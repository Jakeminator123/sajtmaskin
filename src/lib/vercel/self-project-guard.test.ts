import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSync = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  default: { existsSync, readFileSync },
  existsSync,
  readFileSync,
}));

const {
  assertVercelProjectDeletable,
  getSelfVercelProjectId,
  isSelfVercelProject,
  resolveSelfVercelProject,
} = await import("@/lib/vercel/self-project-guard");

const ORIGINAL = process.env.VERCEL_PROJECT_ID;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no local `.vercel/` link files.
  existsSync.mockReturnValue(false);
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.VERCEL_PROJECT_ID;
  } else {
    process.env.VERCEL_PROJECT_ID = ORIGINAL;
  }
});

describe("self-project identity", () => {
  it("prefers VERCEL_PROJECT_ID", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";

    expect(resolveSelfVercelProject()).toEqual({ id: "prj_own", source: "env" });
    expect(getSelfVercelProjectId()).toBe("prj_own");
    expect(isSelfVercelProject("prj_own")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    process.env.VERCEL_PROJECT_ID = "prj_Own";
    expect(isSelfVercelProject(" PRJ_OWN ")).toBe(true);
  });

  it("does not treat another project as self", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";
    expect(isSelfVercelProject("prj_customer")).toBe(false);
  });

  it("falls back to a locally linked .vercel/project.json", () => {
    delete process.env.VERCEL_PROJECT_ID;
    existsSync.mockImplementation((file: string) => String(file).endsWith("project.json"));
    readFileSync.mockReturnValue(JSON.stringify({ projectId: "prj_linked" }));

    expect(resolveSelfVercelProject()).toEqual({ id: "prj_linked", source: "vercel-link" });
    expect(isSelfVercelProject("prj_linked")).toBe(true);
  });

  it("falls back to .vercel/repo.json when project.json is absent", () => {
    delete process.env.VERCEL_PROJECT_ID;
    existsSync.mockImplementation((file: string) => String(file).endsWith("repo.json"));
    readFileSync.mockReturnValue(JSON.stringify({ projects: [{ id: "prj_repo" }] }));

    expect(resolveSelfVercelProject()).toEqual({ id: "prj_repo", source: "vercel-link" });
  });

  it("survives unreadable link files", () => {
    delete process.env.VERCEL_PROJECT_ID;
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("{ not json");

    expect(resolveSelfVercelProject()).toEqual({ id: null, source: null });
  });
});

describe("assertVercelProjectDeletable", () => {
  it("allows a customer project when the self id is known", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";
    expect(assertVercelProjectDeletable("prj_customer")).toEqual({ allowed: true });
  });

  it("refuses the app's own project", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";

    const decision = assertVercelProjectDeletable("prj_own");

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("self");
      expect(decision.error).toMatch(/eget Vercel-projekt/i);
    }
  });

  it("FAILS CLOSED when the self id cannot be resolved (Codex P1 on #611)", () => {
    // With a token configured but no project id, every project would otherwise be
    // classified as "not self" — which is exactly how production could be deleted.
    delete process.env.VERCEL_PROJECT_ID;

    const decision = assertVercelProjectDeletable("prj_anything");

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("unknown-self");
      expect(decision.error).toMatch(/VERCEL_PROJECT_ID/);
    }
  });

  it("refuses an id it cannot reason about (blank/undefined)", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";

    expect(assertVercelProjectDeletable("")).toMatchObject({
      allowed: false,
      reason: "missing-id",
    });
    expect(assertVercelProjectDeletable(undefined)).toMatchObject({ allowed: false });
    // Whitespace around the self id must still be caught as "self".
    expect(assertVercelProjectDeletable(" prj_own ")).toMatchObject({
      allowed: false,
      reason: "self",
    });
  });
});
