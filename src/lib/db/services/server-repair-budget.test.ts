import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";

const state = vi.hoisted(() => ({
  logs: [] as Array<{ id: string; category: string; meta: Record<string, unknown>; version_id: string }>,
  version: { id: "v1", chatId: "c1", filesRevision: "rev1" },
  lease: { runId: "run1", status: "running", expiresAt: Date.now() + 60_000 },
  locks: [] as string[],
  predicates: [] as unknown[],
  failInsert: false,
  tail: Promise.resolve(),
}));
vi.mock("./version-errors", () => ({ SERVER_REPAIR_BUDGET_LOG_CATEGORY: "server-repair:budget" }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    // A serial row-lock model; compile and assert the real SQL separately.
    const prior = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
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
      insert: () => ({ values: (row: typeof state.logs[number]) => ({ onConflictDoNothing: () => ({ returning: async () => {
        if (state.failInsert) throw new Error("receipt write unavailable");
        if (state.logs.some((existing) => existing.id === row.id)) return [];
        state.logs.push(row);
        return [{ id: row.id }];
      } }) }) }),
    };
    try { return await fn(tx); }
    catch (error) { state.logs = snapshot; throw error; }
    finally { release(); }
  } },
}));

import { initializeServerRepairBudget, prepareServerRepairBudget, readServerRepairBudget, recordServerRepairBudgetOutcome, reserveServerRepairBudget, type ServerRepairBudgetHistory } from "./server-repair-budget";
const target = { chatId: "c1", versionId: "v1", filesRevision: "rev1", runId: "run1", scopeId: "v1:server-repair" };
const primary = { passIndex: 0, slot: "primary" as const, contentHash: "a".repeat(16), diagnosticFingerprint: "b".repeat(16), requiredFiles: ["src/a.ts"] };
const known = { source: "observed_fixer_calls" as const, finalize: [], consumed: [] };
const initialize = () => initializeServerRepairBudget(target, { ...known, consumed: [] });

beforeEach(() => {
  state.logs = []; state.locks = []; state.predicates = []; state.failInsert = false;
  state.version = { id: "v1", chatId: "c1", filesRevision: "rev1" };
  state.lease = { runId: "run1", status: "running", expiresAt: Date.now() + 60_000 };
  state.tail = Promise.resolve();
});

describe("durable server repair budget receipts", () => {
  it("requires explicit known actual-call history; absence never grants a free slot", async () => {
    expect(await reserveServerRepairBudget(target, primary)).toEqual({ status: "history_unknown" });
    expect(await initializeServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    expect(await initialize()).toMatchObject({ status: "initialized", receiptId: expect.stringMatching(/^server-repair-budget:/) });
    expect(await reserveServerRepairBudget(target, primary)).toMatchObject({ status: "reserved" });
    expect(state.locks.slice(0, 2)).toEqual(["engine_versions:update", "engine_version_jobs:update"]);
    const lease = new PgDialect().sqlToQuery(state.predicates[1] as SQL);
    expect(lease.sql).toContain('"lease_expires_at" > clock_timestamp()');
    expect(lease.params).toContain("run1");
    expect(lease.params).toContain("running");
  });

  it.each(["chat", "version", "revision", "run", "expired", "released"])("rejects stale %s before writing a receipt", async (stale) => {
    const request = { ...target };
    if (stale === "chat") request.chatId = "other";
    if (stale === "version") request.versionId = "other";
    if (stale === "revision") request.filesRevision = "other";
    if (stale === "run") request.runId = "other";
    if (stale === "expired") state.lease.expiresAt = Date.now() - 1;
    if (stale === "released") state.lease.status = "done";
    expect(await initializeServerRepairBudget(request, { ...known, consumed: [] })).toEqual({
      status: ["chat", "version", "revision"].includes(stale) ? "stale_target" : "lease_unavailable",
    });
    expect(state.logs).toEqual([]);
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
    expect(await initializeServerRepairBudget(next, { ...known, consumed: [] })).toMatchObject({ status: "initialized" });
    expect(await reserveServerRepairBudget(next, primary)).toEqual({ status: "duplicate" });
    expect(await initializeServerRepairBudget({ ...next, scopeId: "new" }, { ...known, consumed: [] })).toEqual({ status: "scope_mismatch" });
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

  it("seeds actual consumed slots without deriving payment counts from ledger attempts", async () => {
    expect((await initializeServerRepairBudget(target, { ...known, consumed: [{ ...primary, outcome: "aborted" }] })).status).toBe("initialized");
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
  ])("rejects corrupt or unproven seeds (%j)", async (seed) => {
    expect(await initializeServerRepairBudget(target, seed as ServerRepairBudgetHistory)).toEqual({ status: "history_unknown" });
    expect(state.logs).toEqual([]);
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
    expect(await initialize()).toEqual({ status: "unavailable" });
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

  it("retains unknown seeded invocations without pretending their payment count is ledger attempts", async () => {
    expect((await initializeServerRepairBudget(target, { ...known, consumed: [{ ...primary, outcome: "unknown" }] })).status).toBe("initialized");
    expect(await reserveServerRepairBudget(target, { ...primary, slot: "retry" })).toEqual({ status: "outcome_unknown" });
    expect(await recordServerRepairBudgetOutcome(target, primary, "aborted")).toEqual({ status: "reservation_missing" });
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
    await initializeServerRepairBudget(target, { ...known, finalize });
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
    expect(await prepareServerRepairBudget(next, { scopeId: "fresh", history: known })).toMatchObject({
      status: "ready", snapshot: { scopeId: target.scopeId, consumed: [{ ...primary, outcome: "aborted" }] },
    });
    expect(await readServerRepairBudget(target)).toEqual({ status: "stale_target" });
    expect(await readServerRepairBudget({ ...next, runId: "old" })).toEqual({ status: "lease_unavailable" });
    expect(state.logs).toHaveLength(3);
  });

  it("never invents empty history during readback, nor erases corrupt receipts with a known seed", async () => {
    expect(await prepareServerRepairBudget(target)).toEqual({ status: "history_unknown" });
    expect(state.logs).toEqual([]);
    expect((await prepareServerRepairBudget(target, { scopeId: target.scopeId, history: known })).status).toBe("ready");
    state.logs[0].meta.history = { ...known, finalize: [{ ...primary, outcome: "invalid" }] };
    expect(await prepareServerRepairBudget(target, { scopeId: target.scopeId, history: known })).toEqual({ status: "history_unknown" });
  });

  it("retains unknown finalize outcomes as a payment stop without consuming fake loop slots", async () => {
    await initializeServerRepairBudget(target, { ...known, finalize: [{ ...primary, outcome: "unknown" }] });
    expect(await reserveServerRepairBudget(target, { ...primary, requiredFiles: ["src/b.ts"] })).toEqual({ status: "outcome_unknown" });
    expect(await readServerRepairBudget(target)).toMatchObject({ status: "ready", snapshot: { consumed: [] } });
  });
});
