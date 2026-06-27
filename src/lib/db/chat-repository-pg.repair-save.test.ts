import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// #260 / Codex P2 #5 (repair-vs-user-edit clobber): saveRepairedFiles must bind
// its write to the EXACT files_json the repair was based on, so a concurrent
// user edit that advanced files_json makes the write no-op instead of
// publishing a stale repair. Follow-up Codex P2: a 0-row UPDATE must report
// WHY it no-op'd — `stale_base` (a concurrent edit advanced files_json) vs.
// `failed` (lost lease / missing row) — so the caller never finalizes the
// user's newer edit as failed from a stale repair. We mock the drizzle update
// + select chains to drive both branches.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateRowCount = vi.hoisted(() => ({ value: 0 }));
// What the stale-probe SELECT returns as the CURRENT files_json. `undefined`
// means "no row" (simulating a deleted version).
const currentFilesJson = vi.hoisted(() => ({ value: undefined as string | undefined }));

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
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              currentFilesJson.value === undefined
                ? []
                : [{ filesJson: currentFilesJson.value }],
            ),
        }),
      }),
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { saveRepairedFiles } from "./chat-repository-pg";
import { hashFilesJson } from "./repair-files-payload";

const BASE_A = '[{"path":"app/page.tsx","content":"A"}]';
const EDITED_B = '[{"path":"app/page.tsx","content":"B"}]';
const REPAIRED = '[{"path":"app/page.tsx","content":"A-fixed"}]';

function renderQuery(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("saveRepairedFiles — base-bound write + stale-base distinction (#260 #5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateRowCount.value = 0;
    currentFilesJson.value = undefined;
  });

  it("binds the UPDATE to the exact base files_json and stores a base-hashed envelope", async () => {
    // rowCount 0 + current files_json advanced past the base => the user edited
    // while the repair ran: report `stale_base` so the caller skips finalize.
    updateRowCount.value = 0;
    currentFilesJson.value = EDITED_B;
    const res = await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1", BASE_A);
    expect(res.status).toBe("stale_base");

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

  it("reports `failed` (not stale) when the no-op is a lost lease — files_json still equals the base", async () => {
    // rowCount 0 but current files_json STILL equals the base => the base
    // predicate matched; the lease (run_id) guard is what failed. This is a
    // genuine failure, NOT a concurrent edit.
    updateRowCount.value = 0;
    currentFilesJson.value = BASE_A;
    const res = await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1", BASE_A);
    expect(res.status).toBe("failed");
  });

  it("reports `failed` when the version row is gone", async () => {
    updateRowCount.value = 0;
    currentFilesJson.value = undefined; // no row
    const res = await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1", BASE_A);
    expect(res.status).toBe("failed");
  });

  it("legacy fallback: with no base it writes the raw payload, adds no base predicate, and cannot be stale", async () => {
    updateRowCount.value = 0;
    const res = await saveRepairedFiles("ver-1", REPAIRED, "summary", "run-1");
    expect(res.status).toBe("failed"); // no base => never `stale_base`
    const { sql } = renderQuery(updateWhere.value);
    expect(sql).not.toContain("files_json"); // no revision-binding predicate
    const set = updateSet.value as Record<string, unknown>;
    expect(set.repairedFilesJson).toBe(REPAIRED); // raw array, not an envelope
  });

  it("reports `failed` without touching the DB for an empty repaired payload", async () => {
    const res = await saveRepairedFiles("ver-1", "   ", "summary", "run-1", BASE_A);
    expect(res.status).toBe("failed");
    expect(updateSet.value).toBeUndefined();
  });
});
