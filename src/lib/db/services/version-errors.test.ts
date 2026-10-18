import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_REPAIR_BUDGET_LOG_CATEGORY } from "./version-errors";
describe("server-only policy skip and current-policy readers", () => {
  beforeEach(() => {
    vi.clearAllMocks(); setF2ProductPostcheck(false); txOrder.length = 0;
    lockedVersionRows.mockReturnValue([{ chatId: "c1", filesRevision: "rev_n" }]);
    insertRows.mockReturnValue([{ id: "policy" }]); selectRows.mockReturnValue([]);
  });
  afterEach(() => { setF2ProductPostcheck(true); });
  const store = () => storeProductPostcheckPolicySkip({ chatId: "c1", versionId: "v1", expectedFilesRevision: "rev_n" });
  it("real OFF stores a revision-bound canonical skip under the version lock", async () => {
    await expect(store()).resolves.toMatchObject({ status: "stored" });
    expect(txOrder).toEqual(["version", "logs"]);
    expect(insertValuesSpy.mock.calls[0][0]).toMatchObject({ id: "product-postcheck-policy:v1:rev_n", category: "product_postcheck.summary",
      meta: { verdict: "allowed_skip", skippedReason: "feature_disabled", attestedFilesRevision: "rev_n" } });
    expect(claimWhereSpy).not.toHaveBeenCalled();
  });
  it("ON cannot mint a policy skip even with a valid revision", async () => {
    setF2ProductPostcheck(true);
    await expect(store()).resolves.toMatchObject({ status: "superseded" });
    expect(db.transaction).not.toHaveBeenCalled(); expect(insertValuesSpy).not.toHaveBeenCalled();
  });
  it.each(["chat", "revision"])("changed %s writes no policy receipt", async mismatch => {
    lockedVersionRows.mockReturnValue([{ chatId: mismatch === "chat" ? "other" : "c1", filesRevision: mismatch === "revision" ? "forged" : "rev_n" }]);
    await expect(store()).resolves.toMatchObject({ status: "superseded" }); expect(insertValuesSpy).not.toHaveBeenCalled();
  });
  it("a lost/empty insert result is not a storage acknowledgment", async () => {
    insertRows.mockReturnValue([]);
    await expect(store()).rejects.toThrow("not stored");
  });
  it.each(["allowed_skip", "pending", "blocked"])("generic writer denies all product %s payloads", async verdict => {
    await expect(createEngineVersionErrorLogs([{ chatId: "c1", versionId: "v1", level: "info",
      category: "product_postcheck.summary", message: "forged", meta: { verdict, skippedReason: "feature_disabled", filesRevision: "forged" } }]))
      .rejects.toThrow("server owner");
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });
  it("all four canonical readers apply the actual ON flag and both revision keys in SQL", async () => {
    setF2ProductPostcheck(true);
    await getEngineVersionErrorLogs("v1"); await getLatestEngineVersionErrorLogs("v1");
    await getEngineVersionErrorLogsForCategories("v1", ["product_postcheck.summary"]);
    await getLatestEngineVersionErrorLogForCategory("v1", "product_postcheck.summary");
    expect(queryWhereSpy).toHaveBeenCalledTimes(4);
    for (const [where] of queryWhereSpy.mock.calls) {
      const sql = new PgDialect().sqlToQuery(where).sql;
      expect(sql).toContain("IS DISTINCT FROM 'feature_disabled'");
      expect(sql).toContain("->>'attestedFilesRevision'"); expect(sql).toContain("->>'filesRevision'");
    }
  });
  it("OFF->ON invalidates policy skip while current canonical blockers remain visible", () => {
    const disabled = { verdict: "allowed_skip", skippedReason: "feature_disabled", attestedFilesRevision: "rev_n" };
    const blocked = { verdict: "blocked", attestedFilesRevision: "rev_n" };
    expect(productPostcheckLogMatchesCurrentFilesRevision(disabled, "rev_n")).toBe(true);
    setF2ProductPostcheck(true);
    expect(productPostcheckLogMatchesCurrentFilesRevision(disabled, "rev_n")).toBe(false);
    expect(productPostcheckLogMatchesCurrentFilesRevision(blocked, "rev_n")).toBe(true);
    expect(productPostcheckLogMatchesCurrentFilesRevision({ filesRevision: "forged", verdict: "allowed_skip" }, "rev_n")).toBe(false);
  });
});

import { FEATURES } from "@/lib/config";
function setF2ProductPostcheck(value: boolean) {
  Object.defineProperty(FEATURES, "f2ProductPostcheck", { value, configurable: true });
}

// ---------------------------------------------------------------------------
// db/client mock — captures the chained .delete().where().returning() call.
// ---------------------------------------------------------------------------

const deletedRows = vi.fn();
const whereSpy = vi.fn();
const returningSpy = vi.fn();
const insertRows = vi.fn(() => [] as unknown[]);
const selectRows = vi.fn(() => [] as unknown[]);
const lockedVersionRows = vi.fn(() => [] as Array<{ filesRevision: string | null; chatId: string }>);
const lockedJobRows = vi.fn(() => [] as Array<{ runId: string }>);
const completedRows = vi.fn(() => [] as Array<{ runId: string }>);
const txOrder: string[] = [];
const claimWhereSpy = vi.fn();
const jobWhereSpy = vi.fn();
const claimSetSpy = vi.fn();
const queryWhereSpy = vi.fn();
/** Fångar raderna som faktiskt skulle skrivas, så metan går att granska. */
const insertValuesSpy = vi.fn();

vi.mock("@/lib/db/client", () => {
  const insertChain = () => ({
    values: (values: unknown) => {
      insertValuesSpy(values);
      const returning = () => Promise.resolve(insertRows());
      return { returning, onConflictDoUpdate: () => ({ returning }) };
    },
  });
  return {
    db: {
      delete: vi.fn(() => ({
        where: (...args: unknown[]) => {
          whereSpy(...args);
          return {
            returning: (...rArgs: unknown[]) => {
              returningSpy(...rArgs);
              return Promise.resolve(deletedRows());
            },
          };
        },
      })),
      insert: vi.fn(() => insertChain()),
      select: vi.fn(() => ({ from: () => ({ where: (where: unknown) => {
        queryWhereSpy(where);
        const rows = () => Object.assign(Promise.resolve(selectRows()), { orderBy: () => rows(), limit: () => rows() });
        return rows();
      } }) })),
      execute: vi.fn(() => Promise.resolve([])),
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          execute: vi.fn(() => Promise.resolve([])),
          insert: vi.fn(() => { txOrder.push("logs"); return insertChain(); }),
          update: vi.fn(() => { txOrder.push("claim"); return { set: (value: unknown) => {
            claimSetSpy(value); return { where: (where: unknown) => { claimWhereSpy(where); return {
              returning: async () => completedRows(),
            }; } };
          } }; }),
          select: vi.fn(() => ({
            from: (table: unknown) => ({
              where: (where: unknown) => ({
                for: () => {
                  txOrder.push(table === engineVersions ? "version" : "job");
                  if (table !== engineVersions) jobWhereSpy(where);
                  return Promise.resolve(table === engineVersions ? lockedVersionRows() : lockedJobRows());
                },
              }),
            }),
          })),
        };
        return await fn(tx);
      }),
    },
    dbConfigured: true,
  };
});

vi.mock("@/lib/logging/bug-register", () => ({
  appendBugRegisterEntries: vi.fn(),
}));

vi.mock("./shared", () => ({
  assertDbConfigured: vi.fn(),
}));

vi.mock("@/lib/gen/scaffolds", () => ({
  getScaffoldById: vi.fn().mockReturnValue(null),
}));

import { engineVersions } from "@/lib/db/schema";

vi.mock("next/server", () => ({ after: vi.fn() }));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { F3_READINESS_MISSING_ENV_CATEGORY } from "@/lib/integrations/log-tier3-missing-env";
import { PREVIEW_CLIENT_ERROR_CATEGORY } from "@/lib/builder/preview-client-error-report";
import {
  commitProductPostcheckResult,
  storeProductPostcheckPolicySkip,
  getEngineVersionErrorLogs,
  getLatestEngineVersionErrorLogs,
  getEngineVersionErrorLogsForCategories,
  getLatestEngineVersionErrorLogForCategory,
  createEngineVersionErrorLogs,
  productPostcheckLogMatchesCurrentFilesRevision,
  PRUNE_EXEMPT_CATEGORIES,
  PRUNE_EXEMPT_CATEGORY_PREFIXES,
  pruneStaleVersionErrorLogs,
} from "./version-errors";

describe("productPostcheckLogMatchesCurrentFilesRevision", () => {
  it("keeps legacy rows but rejects an attested stale or malformed revision", () => {
    expect(productPostcheckLogMatchesCurrentFilesRevision(null, "rev_n_plus_1")).toBe(true);
    expect(productPostcheckLogMatchesCurrentFilesRevision({}, "rev_n_plus_1")).toBe(true);
    expect(
      productPostcheckLogMatchesCurrentFilesRevision(
        { attestedFilesRevision: "rev_n_plus_1" },
        "rev_n_plus_1",
      ),
    ).toBe(true);
    expect(
      productPostcheckLogMatchesCurrentFilesRevision(
        { attestedFilesRevision: "rev_n" },
        "rev_n_plus_1",
      ),
    ).toBe(false);
    expect(
      productPostcheckLogMatchesCurrentFilesRevision(
        { attestedFilesRevision: 42 },
        "rev_n_plus_1",
      ),
    ).toBe(false);
  });
});

describe("budget receipt trust boundary", () => {
  it("rejects an entire generic insert containing a reserved budget category", async () => {
    vi.clearAllMocks();
    const payload = [
      { chatId: "c1", versionId: "v1", level: "info" as const, category: "diagnostic", message: "ordinary" },
      { chatId: "c1", versionId: "v1", level: "info" as const, category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "forged init", meta: { kind: "init" } },
    ];
    await expect(createEngineVersionErrorLogs(payload)).rejects.toThrow("private owner");
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("exempts the exact budget category from real prune SQL even without repairPassIndex", async () => {
    whereSpy.mockClear();
    deletedRows.mockReturnValue([]);
    await pruneStaleVersionErrorLogs("v1", 2);
    const query = new PgDialect().sqlToQuery(whereSpy.mock.calls[0][0] as never);
    expect(query.sql.toLowerCase()).toContain("not in");
    expect(query.params).toContain(SERVER_REPAIR_BUDGET_LOG_CATEGORY);
    expect(PRUNE_EXEMPT_CATEGORIES).toContain(SERVER_REPAIR_BUDGET_LOG_CATEGORY);
  });
});

describe("pruneStaleVersionErrorLogs", () => {
  beforeEach(() => {
    deletedRows.mockReset();
    whereSpy.mockReset();
    returningSpy.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when versionId is empty", async () => {
    const result = await pruneStaleVersionErrorLogs("", 5);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("returns 0 when currentRepairPassIndex is 0 (init pass — nothing to prune)", async () => {
    const result = await pruneStaleVersionErrorLogs("v-1", 0);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("returns 0 when currentRepairPassIndex is negative (defensive)", async () => {
    const result = await pruneStaleVersionErrorLogs("v-1", -1);
    expect(result).toBe(0);
  });

  it("issues delete with WHERE version_id + meta.repairPassIndex < N when pass > 0", async () => {
    deletedRows.mockReturnValue([{ id: "row-a" }, { id: "row-b" }, { id: "row-c" }]);
    const result = await pruneStaleVersionErrorLogs("v-42", 2);
    expect(result).toBe(3);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no rows matched (empty array)", async () => {
    deletedRows.mockReturnValue([]);
    const result = await pruneStaleVersionErrorLogs("v-42", 1);
    expect(result).toBe(0);
  });

  it("never throws on weird input — returns 0 for non-finite pass index", async () => {
    const result = await pruneStaleVersionErrorLogs("v-42", Number.NaN);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });

  /**
   * En gate-observation beskriver inget repair-pass och sätter därför aldrig
   * `meta.repairPassIndex`. Utan undantaget räknas den som pass 0 och raderas
   * vid nästa rena follow-up — vilket träffade R7:s missing-env-rad, vars enda
   * syfte är att vara durabel (granskning 2026-07-29).
   */
  it("undantar gate-observationer från prunet", async () => {
    deletedRows.mockReturnValue([]);
    await pruneStaleVersionErrorLogs("v-42", 2);

    const where = whereSpy.mock.calls[0]?.[0];
    const { sql, params } = new PgDialect().sqlToQuery(where as never);
    // COALESCE runt category, inte ett naket NOT IN: `category` är nullable och
    // `NULL NOT IN (...)` är NULL, vilket skulle spara varje kategorilös rad.
    expect(sql.toLowerCase()).toContain('coalesce("engine_version_error_logs"."category", \'\') not in');
    expect(params).toContain(F3_READINESS_MISSING_ENV_CATEGORY);
  });

  /**
   * Undantagslistan är en literal i version-errors.ts (att importera R7:s
   * konstant där hade blivit ett cirkelberoende). Låset här gör att de två
   * inte kan glida isär tyst.
   */
  it("undantagslistan täcker R7:s kategori", () => {
    expect(PRUNE_EXEMPT_CATEGORIES).toContain(F3_READINESS_MISSING_ENV_CATEGORY);
  });

  /**
   * Browser-runtime-fel från previewn (steg 3, hydration-reparationskedjan)
   * är också gate-observationer utan `meta.repairPassIndex` — utan undantaget
   * raderas de vid nästa rena follow-up på samma version.
   */
  it("undantagslistan täcker preview:client-error", () => {
    expect(PRUNE_EXEMPT_CATEGORIES).toContain(PREVIEW_CLIENT_ERROR_CATEGORY);
    expect(PRUNE_EXEMPT_CATEGORIES).toContain("server-repair:phase");
  });

  it("undantagslistan täcker preview:install-peer-fallback", () => {
    expect(PRUNE_EXEMPT_CATEGORIES).toContain("preview:install-peer-fallback");
  });

  it("undantar alla product_postcheck.*-rader från repair-prunet", async () => {
    deletedRows.mockReturnValue([]);
    await pruneStaleVersionErrorLogs("v-42", 2);

    const where = whereSpy.mock.calls[0]?.[0];
    const { sql, params } = new PgDialect().sqlToQuery(where as never);
    expect(sql.toLowerCase()).toContain("not like");
    expect(params).toContain("product_postcheck.%");
    expect(PRUNE_EXEMPT_CATEGORY_PREFIXES).toContain("product_postcheck.");
  });
});

describe("createEngineVersionErrorLogs (lock-timeout degrade)", () => {
  const lockErr = () =>
    Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });

  beforeEach(() => {
    insertRows.mockReset();
    insertRows.mockReturnValue([]);
    selectRows.mockReset();
    selectRows.mockReturnValue([]);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const onePayload = [{ chatId: "c-1", versionId: "v-1", level: "warning" as const, message: "m" }];

  it("returns [] for an empty payload list without touching the db", async () => {
    expect(await createEngineVersionErrorLogs([])).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("inserts directly (no transaction) when no lockTimeoutMs is given", async () => {
    insertRows.mockReturnValue([{ id: "a" }]);
    const rows = await createEngineVersionErrorLogs(onePayload);
    expect(rows).toEqual([{ id: "a" }]);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("uses a bounded-lock transaction when lockTimeoutMs is set", async () => {
    insertRows.mockReturnValue([{ id: "z" }]);
    const rows = await createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 });
    expect(rows).toEqual([{ id: "z" }]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("degrades to [] on row contention (55P03) instead of throwing a 500", async () => {
    (db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw lockErr();
    });
    const rows = await createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 });
    expect(rows).toEqual([]);
  });

  it("rethrows non-lock errors even in bounded-lock mode", async () => {
    (db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw Object.assign(new Error("boom"), { code: "23505" });
    });
    await expect(
      createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 }),
    ).rejects.toThrow("boom");
  });
});

describe("canonical server product result transaction", () => {
  const held = { chatId: "c1", versionId: "v1", filesRevision: "rev_n", holderRunId: "holder_n" };
  const key = { versionId: "v1", filesRevision: "rev_n", previewSession: "ps_n", lifecycleToken: "life_n", mutationRevision: 2 };
  const claim = { runId: "product_n", claimGeneration: 3 };
  const result = { ok: true as const, skipped: false, skippedReason: null, warnings: [], warningCount: 0,
    productBlocked: false, routesChecked: 1, durationMs: 5, checkedUrl: "https://preview.example",
    attestation: { previewSessionId: "ps_n", lifecycleToken: "life_n", filesRevision: "rev_n" } };
  const commit = (overrides: Partial<Parameters<typeof commitProductPostcheckResult>[0]> = {}) =>
    commitProductPostcheckResult({ held, key, claim, result, deadlineAt: Date.now() + 60_000, ...overrides });
  beforeEach(() => {
    vi.clearAllMocks(); txOrder.length = 0;
    selectRows.mockReturnValue([]); insertRows.mockReturnValue([]);
    lockedVersionRows.mockReturnValue([{ chatId: "c1", filesRevision: "rev_n" }]);
    lockedJobRows.mockReturnValue([{ runId: "holder_n" }]); completedRows.mockReturnValue([{ runId: "product_n" }]);
  });
  it("locks version -> job -> claim and saves canonical logs in that same transaction", async () => {
    await expect(commit()).resolves.toMatchObject({ status: "stored" });
    expect(txOrder).toEqual(["version", "job", "claim", "logs"]);
    const guard = new PgDialect().sqlToQuery(claimWhereSpy.mock.calls[0][0]);
    expect(guard.sql).toContain('"expires_at" > clock_timestamp()');
    expect(guard.sql).toContain("clock_timestamp() <");
    expect(guard.params).toEqual(expect.arrayContaining(["c1", "v1", "rev_n", "ps_n", "life_n", 2, "product_n", 3, "holder_n"]));
    const job = new PgDialect().sqlToQuery(jobWhereSpy.mock.calls[0][0]);
    expect(job.sql).toContain("clock_timestamp()");
    expect(claimSetSpy.mock.calls[0][0].status).toBe("passed");
    const logs = insertValuesSpy.mock.calls[0][0] as Array<{category:string; meta:Record<string,unknown>}>;
    expect(logs[0].category).toBe("product_postcheck.summary");
    expect(logs[0].meta).toMatchObject({ verificationRunId: "product_n", claimGeneration: 3, attestedFilesRevision: "rev_n", verdict: "passed" });
  });
  it.each(["revision", "chat", "lease", "claim"])("fence miss %s inserts nothing", async failure => {
    if (failure === "revision") lockedVersionRows.mockReturnValue([{ chatId: "c1", filesRevision: "rev_new" }]);
    if (failure === "chat") lockedVersionRows.mockReturnValue([{ chatId: "other", filesRevision: "rev_n" }]);
    if (failure === "lease") lockedJobRows.mockReturnValue([]);
    if (failure === "claim") completedRows.mockReturnValue([]);
    await expect(commit()).resolves.toMatchObject({ status: "superseded" });
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });
  it("insert failure rejects the transaction instead of independently completing a claim", async () => {
    const error = new Error("offline insert failure");
    insertRows.mockImplementationOnce(() => { throw error; });
    await expect(commit()).rejects.toThrow(error);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txOrder).toEqual(["version", "job", "claim", "logs"]);
  });
  it("maps bounded lock contention to a retryable result", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce({ code: "55P03" });
    await expect(commit()).resolves.toEqual({ status: "contention", logs: [] });
  });
  it.each([0, NaN])("exhausted/invalid deadline %s never completes or inserts", async deadlineAt => {
    await expect(commit({ deadlineAt })).resolves.toMatchObject({ status: "superseded" });
    expect(db.transaction).not.toHaveBeenCalled(); expect(insertValuesSpy).not.toHaveBeenCalled();
  });
  it("retains blockers and keeps preview-boot pending/reclaimable", async () => {
    await commit({ result: { ...result, productBlocked: true } });
    expect(claimSetSpy.mock.calls[0][0].status).toBe("blocked");
    await commit({ result: { ...result, skipped: true, skippedReason: "preview_not_ready", attestation: null } });
    expect(claimSetSpy.mock.calls[1][0].status).toBe("superseded");
  });
  it("rejects mismatched held/key/attestation without a transaction", async () => {
    await expect(commit({ held: { ...held, filesRevision: "other" } })).resolves.toMatchObject({ status: "superseded" });
    await expect(commit({ result: { ...result, attestation: { ...result.attestation, previewSessionId: "other" } } })).resolves.toMatchObject({ status: "superseded" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("createEngineVersionErrorLogs — defektklassificering", () => {
  beforeEach(() => {
    insertValuesSpy.mockClear();
    selectRows.mockReturnValue([]);
  });

  function writtenRows() {
    const values = insertValuesSpy.mock.calls[0]?.[0];
    return (Array.isArray(values) ? values : [values]) as Array<{
      meta?: { defect?: { kind?: string; signature?: string } } | null;
    }>;
  }

  it("sätter kind och signature på varje rad utan att anroparen ber om det", async () => {
    await createEngineVersionErrorLogs([
      {
        chatId: "c1",
        versionId: "v1",
        level: "warning",
        category: PREVIEW_CLIENT_ERROR_CATEGORY,
        message: "[hydration] Hydration failed because the server rendered text didn't match.",
        meta: { kind: "hydration" },
      },
    ]);

    const defect = writtenRows()[0]?.meta?.defect;
    expect(defect?.kind).toBe("hydration");
    expect(defect?.signature).toMatch(/^[0-9a-f]{12}$/);
  });

  it("rör inte en defect som anroparen redan satt", async () => {
    await createEngineVersionErrorLogs([
      {
        chatId: "c1",
        versionId: "v1",
        level: "error",
        category: "syntax",
        message: "boom",
        meta: { defect: { kind: "compile", signature: "handpicked00" } },
      },
    ]);

    expect(writtenRows()[0]?.meta?.defect).toEqual({
      kind: "compile",
      signature: "handpicked00",
    });
  });

  it("klassificerar även när chat-uppslaget hoppas över (tom chatId)", async () => {
    await createEngineVersionErrorLogs([
      { chatId: "", versionId: "v1", level: "error", category: "syntax", message: "boom" },
    ]);

    expect(writtenRows()[0]?.meta?.defect?.kind).toBe("compile");
  });
});
