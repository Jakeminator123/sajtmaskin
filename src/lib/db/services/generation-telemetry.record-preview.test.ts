import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// M#pv1 (honest preview_success): recordPreviewRuntimeOutcomeForVersion stamps
// the CONFIRMED preview runtime outcome onto the version's latest telemetry
// row. Codex P2 (PR #377 round 2): the monotonicity must live INSIDE the single
// UPDATE statement (no read-check-write window):
//   - true-stamp:  WHERE … AND preview_success IS DISTINCT FROM true
//   - false-stamp: WHERE … AND preview_success IS NULL
// and the target row (latest for the version) is resolved by a subquery in the
// same statement. These tests render the generated SQL to prove the guards —
// same pattern as chat-repository-pg.snapshot-merge.test.ts.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateCalls = vi.hoisted(() => ({ count: 0 }));
const updateResult = vi.hoisted(() => ({ rowCount: 1, reject: false }));
// Disambiguation read used ONLY when a true-stamp matched nothing (rowCount 0):
// already-true (stamped elsewhere) vs no-row-yet.
const selectRows = vi.hoisted(
  () => ({
    value: [] as Array<{
      id: string;
      previewSuccess?: boolean | null;
      filesRevision?: string | null;
      qualityGateResult?: string | null;
    }>,
    count: 0,
  }),
);
// Innehållsrevision steg 3: versionens nuvarande revision (`limit(1)`-grenen).
const versionRows = vi.hoisted(
  () => ({ value: [] as Array<{ filesRevision: string | null }>, count: 0 }),
);

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => {
            selectRows.count += 1;
            return Promise.resolve(selectRows.value);
          },
          limit: () => {
            versionRows.count += 1;
            return Promise.resolve(versionRows.value);
          },
        }),
      }),
    }),
    update: () => ({
      set: (s: unknown) => {
        updateSet.value = s;
        return {
          where: (w: unknown) => {
            updateWhere.value = w;
            updateCalls.count += 1;
            if (updateResult.reject) {
              return Promise.reject(new Error("db down"));
            }
            return Promise.resolve({ rowCount: updateResult.rowCount });
          },
        };
      },
    }),
  },
}));

const {
  recordPreviewRuntimeOutcomeForVersion,
  resetConfirmedPreviewReadyCacheForTests,
  shouldVerifyPreviewRuntimeReceipt,
} = await import("./generation-telemetry");

const REVISION_BOOTED = "1".repeat(32);
const REVISION_REWRITTEN = "2".repeat(32);

function renderWhere(): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(updateWhere.value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("recordPreviewRuntimeOutcomeForVersion (M#pv1, atomic SQL-side monotonicity)", () => {
  beforeEach(() => {
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateCalls.count = 0;
    updateResult.rowCount = 1;
    updateResult.reject = false;
    selectRows.value = [];
    selectRows.count = 0;
    versionRows.value = [];
    versionRows.count = 0;
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
    resetConfirmedPreviewReadyCacheForTests();
    vi.clearAllMocks();
  });

  it("true-stamp: single conditional UPDATE with IS DISTINCT FROM true (null→true and false→true allowed, true terminal)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    expect(updateCalls.count).toBe(1);
    expect(updateSet.value).toEqual({ previewSuccess: true });
    const { sql, params } = renderWhere();
    // Monotonic guard lives in the statement itself…
    expect(sql).toContain("is distinct from true");
    // …and the latest-row-for-version target is a subquery in the SAME
    // statement (no pre-read).
    expect(sql).toContain("select");
    expect(sql).toContain("order by");
    expect(sql).toContain("limit 1");
    expect(params).toContain("ver_1");
  });

  it("false-stamp: guard is IS NULL — a delayed false can never overwrite a confirmed true (only null→false allowed)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);

    expect(updateCalls.count).toBe(1);
    expect(updateSet.value).toEqual({ previewSuccess: false });
    const { sql, params } = renderWhere();
    expect(sql).toContain("is null");
    expect(sql).not.toContain("is distinct from");
    expect(sql).toContain("limit 1");
    expect(params).toContain("ver_1");
  });

  it("caches a MATCHED true-stamp per instance — repeat polls do no DB round-trip at all", async () => {
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCalls.count).toBe(1);

    // Other versions are unaffected by the cache.
    await recordPreviewRuntimeOutcomeForVersion("ver_2", true);
    expect(updateCalls.count).toBe(2);
  });

  it("does NOT cache when the true-stamp matched nothing because no row exists yet — a later stamp still reaches the DB", async () => {
    updateResult.rowCount = 0;
    selectRows.value = []; // disambiguation read: no telemetry row at all
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);
    expect(selectRows.count).toBe(1);

    // A telemetry row may appear later (finalize) — the next receipt must
    // still issue the conditional UPDATE.
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
  });

  it("caches when the true-stamp matched nothing because the row is ALREADY true (stamped by another instance)", async () => {
    updateResult.rowCount = 0;
    selectRows.value = [{ id: "tel_1", previewSuccess: true }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);
    expect(selectRows.count).toBe(1);

    // Confirmed via disambiguation read → repeat stamps do no DB work at all
    // (heartbeat steady state stays free even cross-instance).
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);
    expect(selectRows.count).toBe(1);
  });

  it("does NOT cache false-stamps — a later confirmed boot can still upgrade false→true", async () => {
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCalls.count).toBe(1);

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
    expect(updateSet.value).toEqual({ previewSuccess: true });
  });

  it("no-ops for an empty versionId (best-effort)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("", true);
    expect(updateCalls.count).toBe(0);
  });

  it("nämner ingen revision i SQL:en med flaggan av (oförändrat beteende)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    const { sql } = renderWhere();
    expect(sql).not.toContain("files_revision");
    expect(sql).not.toContain("engine_versions");
    // Ingen extra läsning av versionens revision heller.
    expect(versionRows.count).toBe(0);
  });

  it("never throws when the UPDATE fails (best-effort hot path)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateResult.reject = true;

    await expect(
      recordPreviewRuntimeOutcomeForVersion("ver_err", true),
    ).resolves.toBeUndefined();

    expect(updateCalls.count).toBe(1);
    expect(warn).toHaveBeenCalled();
    // A failed stamp must NOT poison the cache — the next receipt retries.
    updateResult.reject = false;
    await recordPreviewRuntimeOutcomeForVersion("ver_err", true);
    expect(updateCalls.count).toBe(2);
    warn.mockRestore();
  });
});

/**
 * Innehållsrevision steg 3 stänger M#pv4:s båda halvor — stämpeln OCH cachen.
 * Repro-scenariot: version v1 servas av VM:en, ett server-repair skapar en NY
 * telemetri-rad för innehåll som aldrig bootats, och nästa `running:true` från
 * den gamla sessionen skulle annars stämpla den nya raden grön.
 */
describe("recordPreviewRuntimeOutcomeForVersion — revisionsgrind (flaggan PÅ)", () => {
  beforeEach(() => {
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateCalls.count = 0;
    updateResult.rowCount = 1;
    updateResult.reject = false;
    selectRows.value = [];
    selectRows.count = 0;
    versionRows.value = [{ filesRevision: REVISION_BOOTED }];
    versionRows.count = 0;
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    resetConfirmedPreviewReadyCacheForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("grinden ligger i SAMMA sats som monotoniteten — inget läs-kontroll-skriv-fönster", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    const { sql } = renderWhere();
    expect(sql).toContain("files_revision");
    expect(sql).toContain("engine_versions");
    // Okänd revision på raden är fortfarande stämpelbar (fail-open per rad).
    expect(sql).toContain("is null");
    expect(sql).toContain("is distinct from true");
  });

  it("cachen nycklas på revision — samma innehåll är DB-fritt, omskrivet innehåll stämplas igen", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    // Samma revision → cachen kortsluter precis som förut.
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    // Samma versionId, nytt innehåll (targetVersionId-rewrite): den NYA raden
    // måste kunna få sitt kvitto, annars förblir den pending för alltid på den
    // instansen (cache-halvan av M#pv4).
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
  });

  it("stämplar inte alls när varje rad beskriver ett annat innehåll — och poisonar inte cachen", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateResult.rowCount = 0;
    selectRows.value = [
      { id: "tel_repair", previewSuccess: null, filesRevision: REVISION_REWRITTEN },
    ];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[content-revision]"));

    // Kvittot är inte cachat: när raden för det bootade innehållet dyker upp
    // (eller repairen accepteras) ska nästa kvitto nå DB:n.
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
    warn.mockRestore();
  });

  it("cachar fortfarande en rad som redan är true (stämplad av annan instans)", async () => {
    updateResult.rowCount = 0;
    selectRows.value = [
      { id: "tel_1", previewSuccess: true, filesRevision: REVISION_BOOTED },
    ];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);
  });
});

describe("shouldVerifyPreviewRuntimeReceipt", () => {
  beforeEach(() => {
    updateResult.rowCount = 1;
    updateResult.reject = false;
    selectRows.value = [];
    selectRows.count = 0;
    versionRows.value = [{ filesRevision: REVISION_BOOTED }];
    versionRows.count = 0;
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
    resetConfirmedPreviewReadyCacheForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("en aldrig bekräftad version verifieras utan att röra DB:n", async () => {
    expect(await shouldVerifyPreviewRuntimeReceipt("ver_1")).toBe(true);
    expect(versionRows.count).toBe(0);
  });

  it("tom versionId verifieras inte", async () => {
    expect(await shouldVerifyPreviewRuntimeReceipt("")).toBe(false);
  });

  it("med flaggan av räcker en bekräftelse per version (dagens beteende)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(await shouldVerifyPreviewRuntimeReceipt("ver_1")).toBe(false);
    expect(versionRows.count).toBe(0);
  });

  it("med flaggan på gäller bekräftelsen bara den revision som bekräftades", async () => {
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    expect(await shouldVerifyPreviewRuntimeReceipt("ver_1")).toBe(false);

    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];
    expect(await shouldVerifyPreviewRuntimeReceipt("ver_1")).toBe(true);
  });
});

/**
 * Vad VM:n faktiskt kör, inte vad DB-raden råkar hålla just nu.
 *
 * Versionsraden kan avancera till N+1 (repair-accept, användarredigering) medan
 * VM:n fortfarande serverar N. Läser kvittot DB:ns nuvarande revision som proxy
 * blir ett kvitto för N jämfört mot N+1 — och stämplar då antingen fel rad
 * eller ingen alls. Anroparen som äger sessionen vet vad som bootades och
 * skickar det explicit.
 */
describe("recordPreviewRuntimeOutcomeForVersion — bootad revision framför DB-proxyn", () => {
  beforeEach(() => {
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateCalls.count = 0;
    updateResult.rowCount = 1;
    updateResult.reject = false;
    selectRows.value = [];
    selectRows.count = 0;
    versionRows.value = [];
    versionRows.count = 0;
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    resetConfirmedPreviewReadyCacheForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("VM=N medan DB=N+1: den bootade revisionen används och DB-proxyn läses aldrig", async () => {
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });

    expect(versionRows.count).toBe(0);
    expect(updateCalls.count).toBe(1);
  });

  it("satsen jämför mot den BOOTADE revisionen, inte mot versionens nuvarande rad", async () => {
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });

    const { sql, params } = renderWhere();
    // Den bootade revisionen är bunden som parameter…
    expect(params).toContain(REVISION_BOOTED);
    // …och subselecten mot versionens NUVARANDE innehåll används inte, annars
    // väljer satsen en annan rad än JS-sidans revisionslogik.
    expect(sql).not.toContain("engine_versions");
    expect(params).not.toContain(REVISION_REWRITTEN);
  });

  it("utan bootad revision står subselecten mot versionens innehåll kvar", async () => {
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    const { sql } = renderWhere();
    expect(sql).toContain("engine_versions");
    expect(sql).toContain("files_revision");
  });

  it("cachen nycklas på den bootade revisionen — samma boot stämplas inte om", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });

    expect(updateCalls.count).toBe(1);
  });

  it("en faktisk uppdatering till N+1 är en ny boot och stämplas separat", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_REWRITTEN,
    });

    expect(updateCalls.count).toBe(2);
  });

  it("en samtidig DB-ändring påverkar inte kvittot när den bootade revisionen är känd", async () => {
    versionRows.value = [{ filesRevision: REVISION_BOOTED }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });
    // DB hinner skrivas om mellan de två kvittona; VM:n kör fortfarande samma.
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, {
      bootedFilesRevision: REVISION_BOOTED,
    });

    expect(updateCalls.count).toBe(1);
    expect(versionRows.count).toBe(0);
  });

  it("utan bootad revision faller den tillbaka till DB-läsningen (dokumenterad degradering)", async () => {
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    expect(versionRows.count).toBe(1);
    expect(updateCalls.count).toBe(1);
  });

  it("tom sträng räknas som okänd och faller tillbaka", async () => {
    versionRows.value = [{ filesRevision: REVISION_REWRITTEN }];

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true, { bootedFilesRevision: "  " });

    expect(versionRows.count).toBe(1);
  });
});
