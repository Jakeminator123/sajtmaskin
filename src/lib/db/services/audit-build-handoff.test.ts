import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const state = vi.hoisted(() => ({
  projects: [] as Record<string, unknown>[],
  handoffs: [] as Record<string, unknown>[],
  failPrompt: false,
  tail: Promise.resolve() as Promise<unknown>,
}));
const tables = vi.hoisted(() => ({
  appProjects: { id: "projects.id", user_id: "projects.user_id" },
  promptHandoffs: { id: "handoffs.id", user_id: "handoffs.user_id" },
}));
const canCreateProject = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ allowed: true, limit: 8, current: 0, reason: "quota" })),
);
const execute = vi.hoisted(() => vi.fn(async (_sql: SQL) => undefined));
vi.mock("@/lib/projects/project-cleanup", () => ({ canCreateProject }));
vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("@/lib/db/schema", () => tables);
vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = state.tail.then(async () => {
        const snapshot = structuredClone({ projects: state.projects, handoffs: state.handoffs });
        const tx = {
          execute,
          select: () => ({
            from: (table: unknown) => ({
              where: (clause: SQL) => ({
                limit: async () => {
                  const params = new PgDialect().sqlToQuery(clause).params;
                  return (table === tables.appProjects ? state.projects : state.handoffs).filter(
                    (row) => row.id === params[1] && row.user_id === params[3],
                  );
                },
              }),
            }),
          }),
          insert: (table: unknown) => ({
            values: async (row: Record<string, unknown>) => {
              if (table === tables.promptHandoffs && state.failPrompt)
                throw new Error("prompt insert failed");
              (table === tables.appProjects ? state.projects : state.handoffs).push(row);
            },
          }),
        };
        try {
          return await run(tx);
        } catch (error) {
          state.projects = snapshot.projects;
          state.handoffs = snapshot.handoffs;
          throw error;
        }
      });
      state.tail = result.catch(() => undefined);
      return result;
    },
  },
}));
import { createAuditProjectHandoff } from "./audit-build-handoff";
const input = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  userId: "user_1",
  isPaidUser: false,
  payload: {
    domain: "example.se",
    url: "https://example.se",
    company: "Example AB",
    audit_scores: { seo: 70 },
  },
};
describe("atomic audit build handoff (mock transaction, never live DB)", () => {
  beforeEach(() => {
    state.projects = [];
    state.handoffs = [];
    state.failPrompt = false;
    state.tail = Promise.resolve();
    vi.clearAllMocks();
    canCreateProject.mockResolvedValue({ allowed: true, limit: 8, current: 0, reason: "quota" });
  });
  it("rolls back the project if prompt persistence fails, then retries once", async () => {
    state.failPrompt = true;
    await expect(createAuditProjectHandoff(input)).rejects.toThrow("prompt insert failed");
    expect(state.projects).toHaveLength(0);
    expect(state.handoffs).toHaveLength(0);
    state.failPrompt = false;
    await createAuditProjectHandoff(input);
    expect(state.projects).toHaveLength(1);
    expect(state.handoffs).toHaveLength(1);
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql).toContain(
      "pg_advisory_xact_lock",
    );
  });
  it("reuses the committed result for concurrent/lost-ACK retries, even at quota", async () => {
    const results = await Promise.all([
      createAuditProjectHandoff(input),
      createAuditProjectHandoff(input),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(state.projects).toHaveLength(1);
    canCreateProject.mockResolvedValue({ allowed: false, limit: 8, current: 8, reason: "quota" });
    expect(await createAuditProjectHandoff(input)).toEqual(results[0]);
    expect(canCreateProject).toHaveBeenCalledTimes(1);
  });
  it("creates no project at quota and reads quota in the transaction", async () => {
    canCreateProject.mockResolvedValue({ allowed: false, limit: 8, current: 8, reason: "quota" });
    await expect(createAuditProjectHandoff(input)).rejects.toMatchObject({ status: 403 });
    expect(state.projects).toHaveLength(0);
    expect(canCreateProject).toHaveBeenCalledWith(
      "user_1",
      null,
      false,
      expect.objectContaining({ select: expect.any(Function) }),
    );
  });
  it("isolates the same client attempt id across accounts", async () => {
    const a = await createAuditProjectHandoff(input);
    const b = await createAuditProjectHandoff({ ...input, userId: "user_2" });
    expect(b.projectId).not.toBe(a.projectId);
    expect(b.promptId).not.toBe(a.promptId);
    expect(state.projects.map((row) => row.user_id)).toEqual(["user_1", "user_2"]);
  });
  it("rejects changed payload and deleted projects without overwriting or deleting", async () => {
    await createAuditProjectHandoff(input);
    await expect(
      createAuditProjectHandoff({ ...input, payload: { ...input.payload, company: "Different" } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.projects).toHaveLength(1);
    expect(state.handoffs).toHaveLength(1);
    state.projects = [];
    await expect(createAuditProjectHandoff(input)).rejects.toMatchObject({ status: 409 });
    expect(state.projects).toHaveLength(0);
    expect(state.handoffs).toHaveLength(1);
  });
  it("reports consumed prompts without creating a second project", async () => {
    await createAuditProjectHandoff(input);
    state.handoffs[0].consumed_at = new Date();
    expect(await createAuditProjectHandoff(input)).toMatchObject({ consumed: true });
    expect(state.projects).toHaveLength(1);
  });
});
