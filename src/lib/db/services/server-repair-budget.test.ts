import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import { db } from "@/lib/db/client";

const state = vi.hoisted(() => ({
  logs: [] as Array<{ id: string; category: string; meta: Record<string, unknown>; version_id: string }>,
  version: { id: "v1", chatId: "c1", filesRevision: "rev1", createdAt: new Date(Date.now() - 600_000),
    editKind: null as string | null, lifecycleStage: "design", releaseState: "draft", verificationState: "pending" },
  lease: { runId: "run1", status: "running", expiresAt: Date.now() + 60_000 },
  locks: [] as string[],
  predicates: [] as unknown[],
  failInsert: false,
  emptyInsert: false,
  writes: 0,
  inTransaction: false,
  tail: Promise.resolve(),
}));
const chatHasImportedRepoVersion = vi.hoisted(() => vi.fn());
// Mock the canonical query owner, not the facade: concurrent dynamic facade
// imports must resolve the same controlled query without loading a real DB read.
vi.mock("@/lib/db/chat-repository/versions", () => ({ chatHasImportedRepoVersion }));
vi.mock("./version-errors", () => ({ SERVER_REPAIR_BUDGET_LOG_CATEGORY: "server-repair:budget" }));
vi.mock("@/lib/gen/verify/server-verify", () => ({ isServerVerifyEligible: () => true }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    // A serial row-lock model; compile and assert the real SQL separately.
    const prior = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    state.inTransaction = true;
    const snapshot = [...state.logs];
    const tx = {
      execute: vi.fn(async () => []),
      select: () => ({ from: (table: Table) => ({ where: (condition: SQL) => {
        state.predicates.push(condition);
        const name = getTableName(table);
        const params = new PgDialect().sqlToQuery(condition).params;
        const rows = () => name === "engine_versions"
          ? (params[0] === state.version.id ? [state.version] : [])
          : name === "engine_version_jobs"
            ? (params[0] === state.version.id && params[1] === state.lease.runId && state.lease.status === "running" && state.lease.expiresAt > Date.now() ? [state.lease] : [])
            : state.logs.filter((row) => row.version_id === params[0] && (row.category === "server-repair:budget" || row.id.startsWith("server-repair-budget:")));
        return Object.assign(Promise.resolve().then(rows), { for: async (lock: string) => { state.locks.push(`${name}:${lock}`); return rows(); } });
      } }) }),
      insert: () => ({ values: (row: typeof state.logs[number]) => {
        const returning = async (update?: { meta: Record<string, unknown> }) => {
          if (state.failInsert) throw new Error("receipt write unavailable");
          if (state.emptyInsert) return [];
          const existing = state.logs.find(entry => entry.id === row.id);
          if (existing && !update) return [];
          if (existing) state.logs = state.logs.map(entry => entry.id === row.id ? { ...entry, meta: structuredClone(update!.meta) } : entry);
          else state.logs.push(structuredClone(row));
          state.writes++;
          return [{ id: row.id }];
        };
        return { onConflictDoNothing: () => ({ returning: () => returning() }),
          onConflictDoUpdate: (options: { set: { meta: Record<string, unknown> } }) => ({ returning: () => returning(options.set) }) };
      } }),
    };
    try { return await fn(tx); }
    catch (error) { state.logs = snapshot; throw error; }
    finally { state.inTransaction = false; release(); }
  } },
}));

import { writeServerFinalizeBootstrap, readServerRepairBudget, recordServerRepairBudgetOutcome, reserveServerRepairBudget,
  readServerResumeControl, reserveServerResumeAttempt, settleServerResumeAttempt, recordServerResumeHold,
  type ServerFinalizeBootstrap, type ServerResumeControlResult } from "./server-repair-budget";
const target = { chatId: "c1", versionId: "v1", filesRevision: "rev1", runId: "run1", scopeId: "v1:server-repair" };
const primary = { passIndex: 0, slot: "primary" as const, contentHash: "a".repeat(16), diagnosticFingerprint: "b".repeat(16), requiredFiles: ["src/a.ts"] };
const known = { source: "observed_fixer_calls" as const, finalize: [], consumed: [] };
const initialize = (finalize: ServerFinalizeBootstrap["finalize"] = [], materializeImages?: boolean) => db.transaction((tx) => writeServerFinalizeBootstrap(tx,
  state.version.chatId, { id: state.version.id, chat_id: state.version.chatId, files_revision: state.version.filesRevision, edit_kind: null }, {
    source: "trusted_new_finalize", scopeId: target.scopeId, finalize,
    buildSpec: { buildIntent: "website", generationMode: "init", changeScope: "redesign", scaffoldId: null,
      routePlanSummary: "", stylePack: "clean", qualityTarget: "standard", previewPolicy: "fidelity2",
      verificationPolicy: "standard", contextPolicy: "normal", referenceCategories: [], forbiddenPatterns: [],
      tokenBudgets: { scaffoldChars: 0, refsChars: 0, systemContextChars: 0 } },
    verifierGatesVerification: false, previewHasBuildBreakingFindings: false,
    willRunQualityGate: true, qualityGatePlanned: true,
    materializeImages,
    preflight: { preflightIssues: [], preflightFileCount: 1, finalizedPreviewFileCount: 1, previewBlockingReason: null,
      scaffoldRetry: null, routePlan: null, scaffoldSelection: null,
      previewStart: { canStartPreview: true, primaryPreviewTarget: "preview", shimBlocked: false, requiresEnvConfig: false,
        hasCriticalInstallRisk: false, hasCriticalCodeFailure: false, compatibilityPreviewAllowed: false, blockingCategories: [],
        issueCounts: { code_structure_failure: 0, dependency_install_failure: 0, env_config_missing: 0,
          shim_preview_failure: 0, non_blocking_quality_warning: 0 } } },
  }));

beforeEach(() => {
  state.logs = []; state.locks = []; state.predicates = []; state.failInsert = false; state.emptyInsert = false; state.writes = 0; state.inTransaction = false;
  state.version = { id: "v1", chatId: "c1", filesRevision: "rev1", createdAt: new Date(Date.now() - 600_000),
    editKind: null, lifecycleStage: "design", releaseState: "draft", verificationState: "pending" };
  chatHasImportedRepoVersion.mockReset().mockResolvedValue(false);
  state.lease = { runId: "run1", status: "running", expiresAt: Date.now() + 60_000 };
  state.tail = Promise.resolve();
});

describe("durable non-paid resume control", () => {
  const NOW = Date.UTC(2026, 9, 12, 10);
  const DAY = 24 * 60 * 60_000;
  const advance = (ms: number) => vi.mocked(Date.now).mockReturnValue(Date.now() + ms);
  const control = () => state.logs.find(row => row.meta.kind === "resume_control")!;
  const paidJson = () => JSON.stringify(state.logs.filter(row => row.meta.kind !== "resume_control"));
  const snapshot = (result: ServerResumeControlResult) => {
    if (!result.snapshot) throw new Error(`Expected control snapshot, received ${result.status}`);
    return result.snapshot;
  };
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    state.version.createdAt = new Date(NOW - 600_000);
    state.lease.expiresAt = NOW + 8 * DAY;
  });
  afterEach(() => vi.restoreAllMocks());

  it("unknown generated history and caller import/scope flags never create authority", async () => {
    const forged = { ...target, scopeId: "replacement", importedRepo: true };
    expect(await reserveServerResumeAttempt(forged)).toEqual({ status: "history_unknown" });
    expect(state.logs).toEqual([]);
    await initialize();
    expect(snapshot(await reserveServerResumeAttempt(forged)).scopeId).toBe(target.scopeId);
  });

  it("initial finalize/paid calls consume no resume capacity and pure reads write no tick receipt", async () => {
    await initialize([{ ...primary, outcome: "success" }]);
    await reserveServerRepairBudget(target, primary);
    await recordServerRepairBudgetOutcome(target, primary, "success");
    const before = paidJson(); const writes = state.writes;
    for (let n = 0; n < 3; n++) expect(await readServerResumeControl(target)).toMatchObject({ status: "resume_control", snapshot: {
      authority: "generated_postchecks_resume", attemptsUsed: 0, nextAttemptId: 1, disposition: "eligible",
    } });
    expect(state.writes).toBe(writes); expect(control()).toBeUndefined(); expect(paidJson()).toBe(before);
  });

  it("serializes duplicate reservations into one monotonically identified logical attempt", async () => {
    await initialize();
    const [a, b] = await Promise.all([reserveServerResumeAttempt(target), reserveServerResumeAttempt(target)]);
    expect(a).toMatchObject({ status: "resume_reserved", attemptId: 1 });
    expect(b).toMatchObject({ status: "resume_reserved", attemptId: 1 });
    expect(snapshot(a).attemptsUsed).toBe(1); expect(snapshot(b).attempts).toHaveLength(1);
    expect(state.logs).toHaveLength(2);
    expect(chatHasImportedRepoVersion).toHaveBeenCalledTimes(2);
    expect(state.locks.slice(0, 2)).toEqual(["engine_versions:update", "engine_version_jobs:update"]);
  });

  it.each(["chat", "version", "revision", "run", "expired", "released"])("rejects stale resume %s before writes", async stale => {
    await initialize(); const before = JSON.stringify(state.logs);
    const next = { ...target };
    if (stale === "chat") next.chatId = "other";
    if (stale === "version") next.versionId = "other";
    if (stale === "revision") next.filesRevision = "old";
    if (stale === "run") next.runId = "old";
    if (stale === "expired") state.lease.expiresAt = NOW;
    if (stale === "released") state.lease.status = "released";
    expect(await reserveServerResumeAttempt(next)).toEqual({ status: ["chat", "version", "revision"].includes(stale) ? "stale_target" : "lease_unavailable" });
    expect(JSON.stringify(state.logs)).toBe(before);
  });

  it.each(["starting", "runtime_hold", "claim_busy", "superseded"] as const)("confirmed %s refunds only logical capacity; duplicate settlement preserves identity/history", async reason => {
    await initialize(); await reserveServerRepairBudget(target, primary);
    const before = paidJson();
    await reserveServerResumeAttempt(target);
    expect(await settleServerResumeAttempt(target, 1, reason)).toMatchObject({ status: "resume_settled", snapshot: {
      attemptsUsed: 0, nextAttemptId: 2, boundedHolds: ["runtime_hold", "claim_busy"].includes(reason) ? 1 : 0,
    } });
    const saved = JSON.stringify(control()); const writes = state.writes;
    expect((await settleServerResumeAttempt(target, 1, reason)).status).toBe("resume_settled");
    expect(JSON.stringify(control())).toBe(saved); expect(state.writes).toBe(writes); expect(paidJson()).toBe(before);
    expect((await reserveServerRepairBudget(target, { ...primary, passIndex: 1 })).status).toBe("outcome_unknown");
    advance(8_000);
    expect(await reserveServerResumeAttempt(target)).toMatchObject({ status: "resume_reserved", attemptId: 2, snapshot: { attemptsUsed: 1 } });
    expect(snapshot(await readServerResumeControl(target)).attempts[0]).toMatchObject({ attemptId: 1, outcome: reason, runId: "run1", filesRevision: "rev1" });
  });

  it("unknown crash/takeover consumes all three logical attempts without a time or paid-budget reset", async () => {
    await initialize(); const original = state.version.createdAt.getTime(); const before = paidJson();
    for (let id = 1; id <= 3; id++) {
      expect(await reserveServerResumeAttempt({ ...target, runId: state.lease.runId, filesRevision: state.version.filesRevision })).toMatchObject({ status: "resume_reserved", attemptId: id });
      state.lease.runId = `takeover${id}`; state.version.filesRevision = `rev${id + 1}`; advance(8_000);
    }
    const next = { ...target, runId: state.lease.runId, filesRevision: state.version.filesRevision };
    expect(await reserveServerResumeAttempt(next)).toMatchObject({ status: "terminal", snapshot: { terminal: "attempts_exhausted", attemptsUsed: 3, originalCreatedAt: original } });
    expect((await settleServerResumeAttempt(next, 1, "runtime_hold")).status).toBe("stale_target");
    expect(snapshot(await readServerResumeControl(next)).attempts.every(a => a.outcome === "unknown")).toBe(true);
    expect(paidJson()).toBe(before); expect(state.logs).toHaveLength(2);
  });

  it("same-holder image revision preserves original history, age, scope and paid receipts", async () => {
    await initialize([], true); await reserveServerRepairBudget(target, primary);
    const before = paidJson(); const original = state.version.createdAt.getTime();
    await reserveServerResumeAttempt(target); state.version.filesRevision = "rev2";
    expect((await settleServerResumeAttempt(target, 1, "superseded")).status).toBe("stale_target");
    const next = { ...target, filesRevision: "rev2" };
    expect(await settleServerResumeAttempt(next, 1, "superseded")).toMatchObject({ status: "resume_settled", snapshot: { originalCreatedAt: original, scopeId: target.scopeId, attemptsUsed: 0 } });
    expect(snapshot(await readServerResumeControl(next)).attempts[0]).toMatchObject({ filesRevision: "rev1", settledFilesRevision: "rev2" });
    expect(paidJson()).toBe(before);
    expect(await readServerRepairBudget(next)).toMatchObject({ status: "ready", snapshot: { startPolicy: { postChecks: { materializeImages: true } }, consumed: [{ outcome: "unknown" }] } });
  });

  it.each(["completed", "terminal"] as const)("persists terminal %s disposition and immutable idempotent settlement", async outcome => {
    await initialize(); await reserveServerResumeAttempt(target);
    expect(await settleServerResumeAttempt(target, 1, outcome)).toMatchObject({ status: "resume_settled", snapshot: { disposition: "terminal", terminal: outcome === "completed" ? "completed" : "policy_stop" } });
    const writes = state.writes;
    expect((await settleServerResumeAttempt(target, 1, outcome)).status).toBe("resume_settled");
    expect((await settleServerResumeAttempt(target, 1, "runtime_hold")).status).toBe("outcome_conflict");
    expect((await reserveServerResumeAttempt(target)).status).toBe("terminal"); expect(state.writes).toBe(writes);
  });

  it.each([false, true])("canonical generated/import %s min-age is server-derived, never caller-derived", async imported => {
    chatHasImportedRepoVersion.mockResolvedValue(imported);
    const min = imported ? 90_000 : 300_000;
    state.version.createdAt = new Date(NOW - min + 1);
    if (!imported) await initialize();
    expect(await reserveServerResumeAttempt(target)).toMatchObject({ status: "not_eligible", snapshot: { disposition: "too_young", nextEligibleAt: NOW + 1 } });
    advance(1); expect((await reserveServerResumeAttempt(target)).status).toBe("resume_reserved");
  });

  it("starting has no wait cap, no attempt history and no per-tick row; hard seven days remains", async () => {
    await initialize(); const original = state.version.createdAt.getTime();
    for (let n = 0; n < 25; n++) {
      expect(await recordServerResumeHold(target, "starting")).toMatchObject({ status: "resume_held", snapshot: { boundedHolds: 0, attemptsUsed: 0 } });
      advance(8_000);
    }
    expect(state.logs).toHaveLength(2); expect(snapshot(await readServerResumeControl(target)).attempts).toEqual([]);
    vi.mocked(Date.now).mockReturnValue(original + 7 * DAY);
    expect(await reserveServerResumeAttempt(target)).toMatchObject({ status: "terminal", snapshot: { terminal: "expired", originalCreatedAt: original } });
  });

  it.each(["runtime_hold", "claim_busy"] as const)("bounded %s stops at 20 without consuming/refunding paid slots", async reason => {
    await initialize(); const before = paidJson();
    for (let n = 0; n < 20; n++) { await recordServerResumeHold(target, reason); advance(8_000); }
    expect(await reserveServerResumeAttempt(target)).toMatchObject({ status: "terminal", snapshot: { boundedHolds: 20, terminal: "holds_exhausted", attemptsUsed: 0 } });
    expect(state.logs).toHaveLength(2); expect(paidJson()).toBe(before);
  });

  it("honors default/server Retry-After, dedupes a hold before due and exposes eligibility", async () => {
    await initialize();
    expect(snapshot(await recordServerResumeHold(target, "claim_busy", 3_000)).nextEligibleAt).toBe(NOW + 3_000);
    const writes = state.writes;
    expect(snapshot(await recordServerResumeHold(target, "claim_busy", 3_000)).boundedHolds).toBe(1);
    expect(state.writes).toBe(writes);
    advance(2_999); expect((await reserveServerResumeAttempt(target)).status).toBe("not_eligible");
    advance(1); expect((await reserveServerResumeAttempt(target)).status).toBe("resume_reserved");
  });

  it.each(["row", "lineage"])("DB-confirmed import %s has strict non-paid control, never a paid-ready/init receipt", async origin => {
    if (origin === "row") state.version.editKind = "imported_repo";
    else chatHasImportedRepoVersion.mockResolvedValue(true);
    expect(await readServerResumeControl(target)).toMatchObject({ status: "resume_control", snapshot: { authority: "import_postchecks_resume" } });
    expect(state.logs).toEqual([]);
    expect((await reserveServerResumeAttempt(target)).status).toBe("resume_reserved");
    expect(chatHasImportedRepoVersion).toHaveBeenCalledWith("c1");
    expect(state.logs.some(row => row.meta.kind === "init")).toBe(false);
    expect((await readServerRepairBudget(target)).status).toBe("history_unknown");
    expect((await reserveServerRepairBudget(target, primary)).status).toBe("history_unknown");
  });

  it("valid import/control receipt is parsed separately without damaging a valid paid init or legacy image-off policy", async () => {
    await initialize(); const before = paidJson(); chatHasImportedRepoVersion.mockResolvedValue(true);
    await reserveServerResumeAttempt(target);
    expect(await readServerRepairBudget(target)).toMatchObject({ status: "ready", snapshot: { startPolicy: { postChecks: { materializeImages: false } }, consumed: [] } });
    expect(paidJson()).toBe(before);
    expect((await reserveServerRepairBudget(target, primary)).status).toBe("reserved");
  });

  it("unknown DB lineage and a lease expiring during provenance read never authorize a control write", async () => {
    await initialize(); const writes = state.writes;
    chatHasImportedRepoVersion.mockRejectedValueOnce(new Error("lineage unavailable"));
    expect((await reserveServerResumeAttempt(target)).status).toBe("unavailable");
    chatHasImportedRepoVersion.mockResolvedValueOnce(null);
    expect((await reserveServerResumeAttempt(target)).status).toBe("history_unknown");
    chatHasImportedRepoVersion.mockImplementationOnce(async () => { state.lease.expiresAt = NOW; return false; });
    expect((await reserveServerResumeAttempt(target)).status).toBe("lease_unavailable");
    expect(state.writes).toBe(writes); expect(control()).toBeUndefined();
  });

  it("canonical lineage read does not await a second pool connection inside the locked transaction", async () => {
    await initialize();
    chatHasImportedRepoVersion.mockImplementation(async () => { expect(state.inTransaction).toBe(false); return false; });
    expect((await reserveServerResumeAttempt(target)).status).toBe("resume_reserved");
    expect(state.locks.slice(-3)).toEqual(["engine_version_jobs:update", "engine_version_jobs:update", "engine_version_jobs:update"]);
  });

  it.each(["quick_edit", "restore", "unknown", "integrations"])("does not auto-authorize %s provenance/stage", async kind => {
    await initialize();
    if (kind === "integrations") state.version.lifecycleStage = kind; else state.version.editKind = kind;
    chatHasImportedRepoVersion.mockResolvedValue(true);
    expect((await reserveServerResumeAttempt(target)).status).toBe("ineligible"); expect(control()).toBeUndefined();
  });

  it.each(["id", "schema", "chat", "version", "authority", "scope", "age", "sequence", "revision", "outcome", "holds", "paid_field", "next"])("rejects forged/corrupt control %s without replacing history", async field => {
    await initialize(); await reserveServerResumeAttempt(target); const row = control();
    if (field === "id") row.id += "forged";
    if (field === "schema") row.meta.schema = 99;
    if (field === "chat") row.meta.chatId = "other";
    if (field === "version") row.meta.versionId = "other";
    if (field === "authority") row.meta.authority = "import_postchecks_resume";
    if (field === "scope") row.meta.scopeId = "reset";
    if (field === "age") row.meta.originalCreatedAt = NOW - 500_000;
    if (field === "sequence") (row.meta.attempts as Record<string, unknown>[])[0].attemptId = 42;
    if (field === "revision") (row.meta.attempts as Record<string, unknown>[])[0].filesRevision = "";
    if (field === "outcome") (row.meta.attempts as Record<string, unknown>[])[0].outcome = "free";
    if (field === "holds") row.meta.boundedHolds = -1;
    if (field === "paid_field") row.meta.history = { finalize: [], consumed: [] };
    if (field === "next") row.meta.nextEligibleAt = NOW + 100 * DAY;
    const before = JSON.stringify(state.logs); const writes = state.writes;
    expect((await reserveServerResumeAttempt(target)).status).toBe("history_unknown");
    expect(JSON.stringify(state.logs)).toBe(before); expect(state.writes).toBe(writes);
  });

  it.each(["throws", "empty"])("never reports a reservation/settlement on %s persistence", async mode => {
    await initialize(); const before = JSON.stringify(state.logs);
    if (mode === "throws") state.failInsert = true; else state.emptyInsert = true;
    expect((await reserveServerResumeAttempt(target)).status).toBe("unavailable"); expect(JSON.stringify(state.logs)).toBe(before);
    state.failInsert = false; state.emptyInsert = false; await reserveServerResumeAttempt(target);
    const reserved = JSON.stringify(state.logs);
    if (mode === "throws") state.failInsert = true; else state.emptyInsert = true;
    expect((await settleServerResumeAttempt(target, 1, "runtime_hold")).status).toBe("unavailable"); expect(JSON.stringify(state.logs)).toBe(reserved);
  });
});

describe("durable server repair budget receipts", () => {
  it.each([true, false, undefined])("reads explicit post-processing %s without changing repair capacity", async (choice) => {
    await initialize([], choice);
    expect(await readServerRepairBudget(target)).toMatchObject({ status: "ready", snapshot: {
      scopeId: target.scopeId, startPolicy: { postChecks: { materializeImages: choice === true } }, consumed: [],
    } });
    expect(state.logs).toHaveLength(1);
    expect(await reserveServerRepairBudget(target, primary)).toMatchObject({ status: "reserved" });
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "duplicate" });
  });

  it("reads an older receipt as off without rewriting it or reopening an occupied slot", async () => {
    await initialize([], true);
    await reserveServerRepairBudget(target, primary);
    delete (state.logs[0].meta.startPolicy as { postChecks: Record<string, unknown> }).postChecks.materializeImages;
    const originalReceipts = JSON.stringify(state.logs);
    expect(await readServerRepairBudget(target)).toMatchObject({ status: "ready", snapshot: {
      startPolicy: { postChecks: { materializeImages: false } }, consumed: [{ ...primary, outcome: "unknown" }],
    } });
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "duplicate" });
    expect(JSON.stringify(state.logs)).toBe(originalReceipts);
  });

  it("rejects a wrong-type stored image choice instead of authorizing any new attempt", async () => {
    await initialize();
    (state.logs[0].meta.startPolicy as { postChecks: Record<string, unknown> }).postChecks.materializeImages = "true";
    expect(await readServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
    expect(state.logs).toHaveLength(1);
  });
  it("requires explicit known actual-call history; absence never grants a free slot", async () => {
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
    expect(await readServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    await initialize();
    expect(state.logs[0].id).toMatch(/^server-repair-budget:/);
    expect(await reserveServerRepairBudget(target, primary)).toMatchObject({ status: "reserved" });
    expect(state.locks.slice(0, 2)).toEqual(["engine_versions:update", "engine_version_jobs:update"]);
    const lease = new PgDialect().sqlToQuery(state.predicates[1] as SQL);
    expect(lease.sql).toContain('"lease_expires_at" > clock_timestamp()');
    expect(lease.params).toContain("run1");
    expect(lease.params).toContain("running");
  });

  it.each(["chat", "version", "revision", "run", "expired", "released"])("rejects stale %s before writing a receipt", async (stale) => {
    await initialize();
    const request = { ...target };
    if (stale === "chat") request.chatId = "other";
    if (stale === "version") request.versionId = "other";
    if (stale === "revision") request.filesRevision = "other";
    if (stale === "run") request.runId = "other";
    if (stale === "expired") state.lease.expiresAt = Date.now() - 1;
    if (stale === "released") state.lease.status = "done";
    expect(await reserveServerRepairBudget(request, primary)).toEqual({
      status: ["chat", "version", "revision"].includes(stale) ? "stale_target" : "lease_unavailable",
    });
    expect(state.logs).toHaveLength(1);
  });

  it("serializes duplicate concurrent reservations and never reopens a slot after process death/takeover", async () => {
    await initialize();
    const concurrent = await Promise.all([reserveServerRepairBudget(target, primary), reserveServerRepairBudget(target, primary)]);
    expect(concurrent.map((result) => result.status).sort()).toEqual(["duplicate", "reserved"]);
    state.lease.runId = "run2";
    expect(await reserveServerRepairBudget({ ...target, runId: "run2" }, primary)).toEqual({ status: "duplicate" });
    expect(await reserveServerRepairBudget({ ...target, runId: "run2" }, { ...primary, passIndex: 1 })).toEqual({ status: "outcome_unknown" });
    expect(await reserveServerRepairBudget({ ...target, runId: "run2" }, { ...primary, slot: "retry" })).toEqual({ status: "outcome_unknown" });
    expect(await reserveServerRepairBudget({ ...target, runId: "run2" }, { ...primary, passIndex: 1, requiredFiles: ["src/b.ts"] })).toEqual({ status: "outcome_unknown" });
    expect(await reserveServerRepairBudget({ ...target, runId: "run2" }, { ...primary, contentHash: "c".repeat(16) })).toEqual({ status: "slot_used" });
    expect(state.logs).toHaveLength(2);
  });

  it("keeps the same budget across revision changes and rejects a new scope instead of resetting it", async () => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    state.version.filesRevision = "rev2";
    const next = { ...target, filesRevision: "rev2" };
    expect(await readServerRepairBudget(next)).toMatchObject({ status: "ready" });
    expect(await reserveServerRepairBudget(next, primary)).toEqual({ status: "duplicate" });
    expect(await reserveServerRepairBudget({ ...next, scopeId: "new" }, primary)).toEqual({ status: "scope_mismatch" });
    await expect(initialize()).rejects.toThrow("Finalize start receipt not stored");
    expect(state.logs).toHaveLength(2);
  });

  it("preserves configured loop passes and one separate primary/retry slot per pass", async () => {
    await initialize();
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "retry_without_primary" });
    for (let passIndex = 0; passIndex < SERVER_REPAIR_MAX_PASSES; passIndex++) {
      const contentHash = passIndex.toString(16).padStart(16, "0");
      const attempt = { ...primary, passIndex, contentHash };
      expect((await reserveServerRepairBudget(target, attempt)).status).toBe("reserved");
      expect((await recordServerRepairBudgetOutcome(target, attempt, "partial")).status).toBe("outcome_recorded");
      // Real retries may use a changed targeted bundle/diagnostic fingerprint.
      const retry = { ...attempt, slot: "retry" as const, diagnosticFingerprint: "c".repeat(16) };
      expect((await reserveServerRepairBudget(target, retry)).status).toBe("reserved");
      expect((await recordServerRepairBudgetOutcome(target, retry, "success")).status).toBe("outcome_recorded");
    }
    expect(await reserveServerRepairBudget(target, { ...primary, passIndex: SERVER_REPAIR_MAX_PASSES })).toEqual({ status: "capacity" });
    expect(await reserveServerRepairBudget(target, { ...primary, contentHash: "0".repeat(16), slot: "retry", diagnosticFingerprint: "c".repeat(16) })).toEqual({ status: "duplicate" });
  });

  it("starts with no consumed slots and derives them only from actual reservation/outcome receipts", async () => {
    await initialize();
    expect(state.logs[0].meta.history).toEqual(known);
    await reserveServerRepairBudget(target, primary);
    await recordServerRepairBudgetOutcome(target, primary, "aborted");
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "duplicate" });
    expect((await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).status).toBe("reserved");
  });

  it.each([
    { ...known, source: "ledger_attempts", consumed: [] },
    { ...known, consumed: [{ ...primary, passIndex: -1 }] },
    { ...known, consumed: [primary, primary] },
    { ...known, consumed: [{ ...primary, slot: "retry" }] },
    { ...known, consumed: [{ ...primary, requiredFiles: undefined, outcome: "aborted" }] },
    { ...known, consumed: [{ ...primary, outcome: "invalid" }] },
    { ...known, consumed: [{ ...primary, requiredFiles: [" src/a.ts "], outcome: "aborted" }] },
  ])("rejects corrupt or unproven stored histories (%j)", async (history) => {
    await initialize();
    state.logs[0].meta.history = history;
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
    expect(state.logs).toHaveLength(1);
  });

  it.each(["id", "category", "meta", "scope"])("rejects forged/corrupt initialized history by %s", async (field) => {
    await initialize();
    const row = state.logs[0];
    if (field === "id") row.id = "ordinary-nanoid";
    if (field === "category") row.category = "diagnostic";
    if (field === "meta") row.meta.history = { ...known, consumed: [primary, primary] };
    if (field === "scope") row.meta.scopeId = "";
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
  });

  it("reads receipts outside any bounded diagnostic window and fails closed on malformed reservations", async () => {
    for (let i = 0; i < 100; i++) state.logs.push({ id: `diag${i}`, category: "diagnostic", meta: {}, version_id: "v1" });
    await initialize();
    await reserveServerRepairBudget(target, primary);
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "duplicate" });
    state.logs.at(-1)!.meta.diagnosticFingerprint = "corrupt";
    expect(await reserveServerRepairBudget(target, { ...primary, passIndex: 1 })).toEqual({ status: "history_unknown" });
  });

  it("never reports reserved if receipt persistence fails", async () => {
    state.failInsert = true;
    await expect(initialize()).rejects.toThrow("receipt write unavailable");
    expect(state.logs).toEqual([]);
    state.failInsert = false;
    await initialize();
    state.failInsert = true;
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "unavailable" });
    expect(state.logs).toHaveLength(1);
  });

  it("normalizes requiredFiles exactly as the ledger and keeps distinct repair targets distinct", async () => {
    await initialize();
    const input = { ...primary, requiredFiles: [" src/b.ts ", "src/a.ts", "", "src/a.ts"] };
    expect((await reserveServerRepairBudget(target, input)).status).toBe("reserved");
    expect(state.logs[1].meta.requiredFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect((await recordServerRepairBudgetOutcome(target, input, "success")).status).toBe("outcome_recorded");
    expect(await reserveServerRepairBudget(target, { ...input, passIndex: 1, requiredFiles: ["src/b.ts", "src/a.ts"] })).toEqual({ status: "duplicate" });
    expect((await reserveServerRepairBudget(target, { ...primary, passIndex: 1 })).status).toBe("reserved");
  });

  it.each(["success", "failed", "partial", "error"] as const)("dedupes completed %s but never grants retry merely because primary exists", async (outcome) => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    expect((await recordServerRepairBudgetOutcome(target, primary, outcome)).status).toBe("outcome_recorded");
    expect(await reserveServerRepairBudget(target, { ...primary, passIndex: 1 })).toEqual({ status: "duplicate" });
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "duplicate" });
    const changed = { ...primary, slot: "retry" as const, requiredFiles: ["src/b.ts"] };
    expect((await reserveServerRepairBudget(target, changed)).status).toBe(outcome === "partial" ? "reserved" : "retry_not_allowed");
  });

  it("allows the existing one retry after a durably observed abort, including takeover", async () => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    expect((await recordServerRepairBudgetOutcome(target, primary, "aborted")).status).toBe("outcome_recorded");
    state.lease.runId = "run2";
    const next = { ...target, runId: "run2" };
    const retry = { ...primary, slot: "retry" as const };
    expect((await reserveServerRepairBudget(next, retry)).status).toBe("reserved");
    expect(await reserveServerRepairBudget(next, retry)).toEqual({ status: "duplicate" });
    expect((await recordServerRepairBudgetOutcome(next, retry, "success")).status).toBe("outcome_recorded");
    expect(await reserveServerRepairBudget(next, { ...primary, passIndex: 1 })).toEqual({ status: "duplicate" });
  });

  it.each(["chat", "version", "revision", "run", "expired", "released", "takeover", "new_revision"])("protects outcome writes against stale %s", async (stale) => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    const request = { ...target };
    if (stale === "chat") request.chatId = "other";
    if (stale === "version") request.versionId = "other";
    if (stale === "revision") request.filesRevision = "other";
    if (stale === "run") request.runId = "other";
    if (stale === "expired") state.lease.expiresAt = Date.now() - 1;
    if (stale === "released") state.lease.status = "done";
    if (stale === "takeover") request.runId = state.lease.runId = "run2";
    if (stale === "new_revision") request.filesRevision = state.version.filesRevision = "rev2";
    expect(await recordServerRepairBudgetOutcome(request, primary, "aborted")).toEqual({
      status: ["chat", "version", "revision", "takeover", "new_revision"].includes(stale) ? "stale_target" : "lease_unavailable",
    });
    expect(state.logs).toHaveLength(2);
  });

  it("makes outcomes immutable/idempotent and fails closed on absent or failed persistence", async () => {
    await initialize();
    expect(await recordServerRepairBudgetOutcome(target, primary, "aborted")).toEqual({ status: "reservation_missing" });
    await reserveServerRepairBudget(target, primary);
    state.failInsert = true;
    expect(await recordServerRepairBudgetOutcome(target, primary, "aborted")).toEqual({ status: "unavailable" });
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "outcome_unknown" });
    state.failInsert = false;
    const result = await recordServerRepairBudgetOutcome(target, primary, "aborted");
    expect(result.status).toBe("outcome_recorded");
    expect(await recordServerRepairBudgetOutcome(target, primary, "aborted")).toEqual(result);
    expect(await recordServerRepairBudgetOutcome(target, primary, "success")).toEqual({ status: "outcome_conflict" });
    expect(state.logs).toHaveLength(3);
  });

  it("retains a reserved invocation with unknown outcome without pretending its payment count is ledger attempts", async () => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "outcome_unknown" });
    expect(await recordServerRepairBudgetOutcome(target, { ...primary, passIndex: 1 }, "aborted")).toEqual({ status: "reservation_missing" });
  });

  it.each(["id", "run", "revision", "identity", "outcome"])("rejects forged/corrupt outcome receipts by %s", async (field) => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    await recordServerRepairBudgetOutcome(target, primary, "aborted");
    const row = state.logs.at(-1)!;
    if (field === "id") row.id = "ordinary-nanoid";
    if (field === "run") row.meta.runId = "other";
    if (field === "revision") row.meta.filesRevision = "other";
    if (field === "identity") row.meta.requiredFiles = ["src/b.ts"];
    if (field === "outcome") row.meta.outcome = "corrupt";
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "history_unknown" });
  });

  it("dedupes finalize A without consuming any of the separate server-loop capacity for B", async () => {
    const finalize = [{ contentHash: primary.contentHash, diagnosticFingerprint: primary.diagnosticFingerprint, requiredFiles: primary.requiredFiles, outcome: "success" as const }];
    await initialize(finalize);
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "duplicate" });
    for (let passIndex = 0; passIndex < SERVER_REPAIR_MAX_PASSES; passIndex++) {
      const attempt = { ...primary, passIndex, contentHash: passIndex.toString(16).padStart(16, "0"), requiredFiles: ["src/b.ts"] };
      expect((await reserveServerRepairBudget(target, attempt)).status).toBe("reserved");
      await recordServerRepairBudgetOutcome(target, attempt, "aborted");
      const retry = { ...attempt, slot: "retry" as const };
      expect((await reserveServerRepairBudget(target, retry)).status).toBe("reserved");
      await recordServerRepairBudgetOutcome(target, retry, "success");
    }
    const read = await readServerRepairBudget(target);
    expect(read).toMatchObject({ status: "ready", snapshot: { scopeId: target.scopeId, finalize } });
    if (read.status === "ready") expect(read.snapshot.consumed).toHaveLength(SERVER_REPAIR_MAX_PASSES * 2);
  });

  it("reads the original scope under a new lease/revision without accepting a replacement seed", async () => {
    await initialize();
    await reserveServerRepairBudget(target, primary);
    await recordServerRepairBudgetOutcome(target, primary, "aborted");
    state.lease.runId = "run2"; state.version.filesRevision = "rev2";
    const next = { ...target, runId: "run2", filesRevision: "rev2" };
    expect(await readServerRepairBudget(next)).toMatchObject({
      status: "ready", snapshot: { scopeId: target.scopeId, consumed: [{ ...primary, outcome: "aborted" }] },
    });
    expect(await readServerRepairBudget(target)).toEqual({ status: "stale_target" });
    expect(await readServerRepairBudget({ ...next, runId: "old" })).toEqual({ status: "lease_unavailable" });
    expect(state.logs).toHaveLength(3);
  });

  it("never invents empty history during readback, nor erases corrupt receipts", async () => {
    expect(await readServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    expect(state.logs).toEqual([]);
    await initialize();
    expect((await readServerRepairBudget(target)).status).toBe("ready");
    state.logs[0].meta.history = { ...known, finalize: [{ ...primary, outcome: "invalid" }] };
    expect(await readServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    await expect(initialize()).rejects.toThrow("Finalize start receipt not stored");
  });

  it("retains unknown finalize outcomes as a payment stop without consuming fake loop slots", async () => {
    await initialize([{ ...primary, outcome: "unknown" }]);
    expect(await reserveServerRepairBudget(target, { ...primary, requiredFiles: ["src/b.ts"] })).toEqual({ status: "outcome_unknown" });
    expect(await readServerRepairBudget(target)).toMatchObject({ status: "ready", snapshot: { consumed: [] } });
  });

  it("rejects old/unknown start intent instead of reconstructing an empty automatic budget", async () => {
    await initialize();
    delete state.logs[0].meta.startPolicy;
    expect(await readServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
    expect(state.logs).toHaveLength(1);
  });
});
