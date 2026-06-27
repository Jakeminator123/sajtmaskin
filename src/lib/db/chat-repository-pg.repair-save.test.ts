import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// #260 / Codex P2 #5 (repair-vs-user-edit clobber): saveRepairedFiles must bind
// its write to the EXACT files_json the repair was based on, so a concurrent
// user edit that advanced files_json makes the write no-op instead of
// publishing a stale repair. We mock the drizzle update chain to capture the
// SET object + WHERE SQL/params and assert the base predicate + envelope.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateRowCount = vi.hoisted(() => ({ value: 0 }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: (s: unknown) => {
        updateSet.value = s;
        return {
          where: (w: unknown) => {
            updateWhere.value = w;
            return Promise.resolve({ rowCount: updateRowCount.value });
          },
        };
      },
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { saveRepairedFiles } from "./chat-repository-pg";
import { hashFilesJson } from "./repair-files-payload";

const BASE_A = '[{"path":"app/page.tsx","content":"A"}]';
const REPAIRED = '[{"path":"app/page.tsx","content":"A-fixed"}]';

function renderQuery(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("saveRepairedFiles — base-bound write + envelope (#260 #5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateRowCount.value = 0;
  });

  it("binds the UPDATE to the exact base files_json and stores a base-hashed envelope", async () => {
    // rowCount 0 => the base no longer matches (a user edit advanced files_json):
    // the stale repair is NOT published.
    updateRowCount.value = 0;
    const res = await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1", BASE_A);
    expect(res).toBeNull();

    const { sql, params } = renderQuery(updateWhere.value);
    // Revision-binding predicate present + the lease (run_id) guard present.
    expect(sql).toContain("files_json");
    expect(sql).toContain("engine_version_jobs");
    expect(sql).toContain("run_id");
    // The base value is bound as a parameter (not re-serialized from the array).
    expect(params).toContain(BASE_A);

    // The persisted payload is an envelope carrying the base hash + repaired files.
    const set = updateSet.value as Record<string, unknown>;
    expect(typeof set.repairedFilesJson).toBe("string");
    const env = JSON.parse(set.repairedFilesJson as string);
    expect(env.v).toBe(1);
    expect(env.baseFilesHash).toBe(hashFilesJson(BASE_A));
    expect(env.files).toEqual(JSON.parse(REPAIRED));
  });

  it("legacy fallback: with no base it writes the raw payload and adds no base predicate", async () => {
    updateRowCount.value = 0;
    await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1");
    const { sql } = renderQuery(updateWhere.value);
    expect(sql).not.toContain("files_json"); // no revision-binding predicate
    const set = updateSet.value as Record<string, unknown>;
    expect(set.repairedFilesJson).toBe(REPAIRED); // raw array, not an envelope
  });

  it("returns null without touching the DB for an empty repaired payload", async () => {
    const res = await saveRepairedFiles("ver-1", "   ", "summary", "run-1", BASE_A);
    expect(res).toBeNull();
    expect(updateSet.value).toBeUndefined();
  });
});
