import { createHash } from "node:crypto";
import { and, eq, gt, like, or, sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import { engineVersionErrorLogs, engineVersionJobs, engineVersions } from "@/lib/db/schema";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import type { RepairLedgerInvocation, RepairLedgerRecord } from "@/lib/gen/autofix/llm-repair-gate";
import { SERVER_REPAIR_BUDGET_LOG_CATEGORY } from "./version-errors";

// Nanoid diagnostic writers cannot produce this reserved colon prefix.
const RECEIPT_PREFIX = "server-repair-budget:";
type Slot = {
  passIndex: number;
  slot: "primary" | "retry";
  contentHash: string;
  diagnosticFingerprint: string;
  requiredFiles: string[];
};
type KnownOutcome = NonNullable<RepairLedgerRecord["lastOutcome"]>;
type Attempt = Slot & { outcome: KnownOutcome | "unknown" };
export type ServerRepairBudgetHistory = {
  source: "observed_fixer_calls";
  /** Cross-lane dedupe history, not server-loop capacity. */
  finalize: RepairLedgerInvocation[];
  consumed: Attempt[];
};
export type ServerRepairBudgetSeed = { scopeId: string; history: ServerRepairBudgetHistory };
export type ServerRepairBudgetSnapshot = { scopeId: string; finalize: RepairLedgerInvocation[]; consumed: Attempt[] };
export type ServerRepairBudgetTarget = {
  chatId: string;
  versionId: string;
  filesRevision: string;
  runId: string;
  scopeId: string;
};
type Denied = "stale_target" | "lease_unavailable" | "history_unknown" | "scope_mismatch" | "duplicate" | "slot_used" | "retry_without_primary" | "retry_not_allowed" | "outcome_unknown" | "outcome_conflict" | "reservation_missing" | "capacity" | "unavailable";
export type ServerRepairBudgetResult = { status: "initialized" | "reserved" | "outcome_recorded"; receiptId: string } |
  { status: "ready"; snapshot: ServerRepairBudgetSnapshot } | { status: Denied };
type Init = { kind: "init"; schema: 1; chatId: string; versionId: string; scopeId: string; filesRevision: string; maxPasses: number; history: ServerRepairBudgetHistory };
type Reservation = Slot & { kind: "reservation"; schema: 1; chatId: string; versionId: string; scopeId: string; filesRevision: string; runId: string };
type OutcomeReceipt = Omit<Reservation, "kind"> & { kind: "outcome"; outcome: KnownOutcome };
type Used = Attempt & { reservation?: Reservation };
type Receipt = { id: string; category: string | null; meta: unknown };

const digest = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const initId = (versionId: string) => `${RECEIPT_PREFIX}${digest([versionId, "init"])}`;
const slotId = (versionId: string, scopeId: string, slot: Slot) => `${RECEIPT_PREFIX}${digest([versionId, scopeId, slot.passIndex, slot.slot])}`;
const outcomeId = (versionId: string, scopeId: string, slot: Slot) => `${RECEIPT_PREFIX}${digest([versionId, scopeId, slot.passIndex, slot.slot, "outcome"])}`;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim();
// Same normalization as RepairLedger.keyFor; phase is not part of its identity.
const normalizeFiles = (files: string[]) => [...new Set(files.map((file) => file.trim()).filter(Boolean))].sort();
const sameIdentity = (a: RepairLedgerInvocation | Slot, b: RepairLedgerInvocation | Slot) => a.contentHash === b.contentHash && a.diagnosticFingerprint === b.diagnosticFingerprint && JSON.stringify(a.requiredFiles) === JSON.stringify(b.requiredFiles);
const knownOutcome = (value: unknown): value is KnownOutcome => ["success", "failed", "partial", "aborted", "error"].includes(value as string);
function validIdentity(value: unknown): value is Pick<Slot, "contentHash" | "diagnosticFingerprint" | "requiredFiles"> & Record<string, unknown> {
  return object(value) && typeof value.contentHash === "string" && /^[a-f0-9]{16}$/.test(value.contentHash) &&
    typeof value.diagnosticFingerprint === "string" && /^[a-f0-9]{16}$/.test(value.diagnosticFingerprint) &&
    Array.isArray(value.requiredFiles) && value.requiredFiles.every((file) => typeof file === "string");
}
function validSlot(value: unknown): value is Slot {
  return validIdentity(value) && Number.isInteger(value.passIndex) && Number(value.passIndex) >= 0 && Number(value.passIndex) < SERVER_REPAIR_MAX_PASSES &&
    (value.slot === "primary" || value.slot === "retry");
}
const validInvocation = (value: unknown): value is RepairLedgerInvocation => validIdentity(value) &&
  JSON.stringify(value.requiredFiles) === JSON.stringify(normalizeFiles(value.requiredFiles)) && (knownOutcome(value.outcome) || value.outcome === "unknown");
const canonicalSlot = (value: unknown): value is Slot & Record<string, unknown> => validSlot(value) && JSON.stringify(value.requiredFiles) === JSON.stringify(normalizeFiles(value.requiredFiles));
function validHistory(value: unknown): value is ServerRepairBudgetHistory {
  if (!object(value) || value.source !== "observed_fixer_calls" || !Array.isArray(value.finalize) || !value.finalize.every(validInvocation) || !Array.isArray(value.consumed) ||
    !value.consumed.every((slot) => canonicalSlot(slot) && object(slot) && (knownOutcome(slot.outcome) || slot.outcome === "unknown"))) return false;
  const keys = value.consumed.map((slot) => `${slot.passIndex}:${slot.slot}`);
  return new Set(keys).size === keys.length && value.consumed.every((slot) => slot.slot !== "retry" || keys.includes(`${slot.passIndex}:primary`));
}
function readBudget(rows: Receipt[], target: ServerRepairBudgetTarget): { init: Init; used: Used[] } | null {
  const root = rows.find((row) => row.id === initId(target.versionId));
  if (!root || root.category !== SERVER_REPAIR_BUDGET_LOG_CATEGORY || !object(root.meta)) return null;
  const meta = root.meta;
  if (meta.kind !== "init" || meta.schema !== 1 || meta.chatId !== target.chatId || meta.versionId !== target.versionId ||
    !text(meta.scopeId) || !text(meta.filesRevision) || meta.maxPasses !== SERVER_REPAIR_MAX_PASSES || !validHistory(meta.history)) return null;
  const init = meta as Init;
  const used: Used[] = init.history.consumed.map((slot) => ({ ...slot }));
  const outcomes: OutcomeReceipt[] = [];
  for (const row of rows) {
    if (row === root) continue;
    const receipt = row.meta;
    if (row.category !== SERVER_REPAIR_BUDGET_LOG_CATEGORY || !object(receipt) || receipt.schema !== 1 ||
      receipt.chatId !== target.chatId || receipt.versionId !== target.versionId || receipt.scopeId !== init.scopeId || !text(receipt.filesRevision) || !text(receipt.runId) || !canonicalSlot(receipt)) return null;
    if (receipt.kind === "reservation" && row.id === slotId(target.versionId, init.scopeId, receipt)) {
      used.push({ ...receipt, outcome: "unknown", reservation: receipt as Reservation });
    } else if (receipt.kind === "outcome" && knownOutcome(receipt.outcome) && row.id === outcomeId(target.versionId, init.scopeId, receipt)) {
      outcomes.push(receipt as OutcomeReceipt);
    } else return null;
  }
  for (const outcome of outcomes) {
    const attempt = used.find((slot) => slot.passIndex === outcome.passIndex && slot.slot === outcome.slot);
    if (!attempt?.reservation || attempt.outcome !== "unknown" || !sameIdentity(attempt, outcome) ||
      attempt.reservation.runId !== outcome.runId || attempt.reservation.filesRevision !== outcome.filesRevision) return null;
    attempt.outcome = outcome.outcome;
  }
  return validHistory({ source: "observed_fixer_calls", finalize: init.history.finalize, consumed: used }) ? { init, used } : null;
}

/** Strict readback under the current lease; scope comes from the authenticated init receipt. */
export async function readServerRepairBudget(target: Omit<ServerRepairBudgetTarget, "scopeId">): Promise<ServerRepairBudgetResult> {
  return transact({ ...target, scopeId: "read" }, undefined, undefined, undefined, true);
}
export async function prepareServerRepairBudget(target: Omit<ServerRepairBudgetTarget, "scopeId">, seed?: ServerRepairBudgetSeed): Promise<ServerRepairBudgetResult> {
  const existing = await readServerRepairBudget(target);
  if (existing.status !== "history_unknown" || !seed) return existing;
  const initialized = await initializeServerRepairBudget({ ...target, scopeId: seed.scopeId }, seed.history);
  return initialized.status === "initialized" ? readServerRepairBudget(target) : initialized;
}

/** Private server seed: actual invocation observations only, never ledger.attempts,
 * an absent diagnostic row, a client payload or an inferred empty old history.
 * Finalize observations dedupe without consuming the separate loop's slots. */
export async function initializeServerRepairBudget(target: ServerRepairBudgetTarget, history?: ServerRepairBudgetHistory): Promise<ServerRepairBudgetResult> {
  return transact(target, history);
}
export async function reserveServerRepairBudget(target: ServerRepairBudgetTarget, slot: Slot): Promise<ServerRepairBudgetResult> {
  if (!validSlot(slot)) return { status: "capacity" };
  return transact(target, undefined, { ...slot, requiredFiles: normalizeFiles(slot.requiredFiles) });
}
/** Record the original lease's observed outcome; an absent/failed write never refunds a reservation. */
export async function recordServerRepairBudgetOutcome(target: ServerRepairBudgetTarget, slot: Slot, outcome: KnownOutcome): Promise<ServerRepairBudgetResult> {
  if (!validSlot(slot) || !knownOutcome(outcome)) return { status: "history_unknown" };
  return transact(target, undefined, { ...slot, requiredFiles: normalizeFiles(slot.requiredFiles) }, outcome);
}

async function transact(target: ServerRepairBudgetTarget, history?: ServerRepairBudgetHistory, slot?: Slot, outcome?: KnownOutcome, readOnly = false): Promise<ServerRepairBudgetResult> {
  if (!dbConfigured) return { status: "unavailable" };
  if (![target.chatId, target.versionId, target.filesRevision, target.runId, target.scopeId].every(text)) return { status: "stale_target" };
  try {
    return await db.transaction(async (tx): Promise<ServerRepairBudgetResult> => {
      await tx.execute(sql`SELECT set_config('lock_timeout', '3000', true)`);
      // Same lock order as acquireVersionLease and files-json writers.
      const versions = await tx.select({ id: engineVersions.id, chatId: engineVersions.chatId, filesRevision: engineVersions.filesRevision })
        .from(engineVersions).where(eq(engineVersions.id, target.versionId)).for("update");
      if (versions[0]?.chatId !== target.chatId || versions[0]?.filesRevision !== target.filesRevision) return { status: "stale_target" };
      const leases = await tx.select({ runId: engineVersionJobs.runId }).from(engineVersionJobs).where(and(
        eq(engineVersionJobs.versionId, target.versionId), eq(engineVersionJobs.runId, target.runId),
        eq(engineVersionJobs.status, "running"), gt(engineVersionJobs.leaseExpiresAt, sql`clock_timestamp()`),
      )).for("update");
      if (!leases.length) return { status: "lease_unavailable" };
      // All receipts, not the truncated/age-limited diagnostic reader.
      const rows = await tx.select({ id: engineVersionErrorLogs.id, category: engineVersionErrorLogs.category, meta: engineVersionErrorLogs.meta })
        .from(engineVersionErrorLogs).where(and(eq(engineVersionErrorLogs.version_id, target.versionId),
          or(eq(engineVersionErrorLogs.category, SERVER_REPAIR_BUDGET_LOG_CATEGORY), like(engineVersionErrorLogs.id, `${RECEIPT_PREFIX}%`))));
      const budget = readBudget(rows, target);
      if (!budget) {
        if (readOnly || rows.length || slot || !validHistory(history)) return { status: "history_unknown" };
        const init: Init = { kind: "init", schema: 1, chatId: target.chatId, versionId: target.versionId, scopeId: target.scopeId,
          filesRevision: target.filesRevision, maxPasses: SERVER_REPAIR_MAX_PASSES, history };
        const id = initId(target.versionId);
        const stored = await tx.insert(engineVersionErrorLogs).values({ id, chat_id: target.chatId, version_id: target.versionId,
          level: "info", category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "Server repair budget initialized.", meta: init }).onConflictDoNothing().returning({ id: engineVersionErrorLogs.id });
        if (stored.length !== 1) throw new Error("Budget initialization not stored");
        return { status: "initialized", receiptId: id };
      }
      if (readOnly) return { status: "ready", snapshot: { scopeId: budget.init.scopeId, finalize: budget.init.history.finalize,
        consumed: budget.used.map(({ passIndex, slot, contentHash, diagnosticFingerprint, requiredFiles, outcome }) =>
          ({ passIndex, slot, contentHash, diagnosticFingerprint, requiredFiles, outcome })).sort((a, b) => a.passIndex - b.passIndex || (a.slot === "retry" ? 1 : -1)) } };
      if (budget.init.scopeId !== target.scopeId) return { status: "scope_mismatch" };
      if (!slot) return { status: "initialized", receiptId: initId(target.versionId) };
      const prior = budget.used.find((used) => used.passIndex === slot.passIndex && used.slot === slot.slot);
      if (outcome) {
        if (!prior?.reservation || !sameIdentity(prior, slot)) return { status: "reservation_missing" };
        if (prior.reservation.runId !== target.runId || prior.reservation.filesRevision !== target.filesRevision) return { status: "stale_target" };
        const id = outcomeId(target.versionId, target.scopeId, slot);
        if (prior.outcome !== "unknown") return prior.outcome === outcome ? { status: "outcome_recorded", receiptId: id } : { status: "outcome_conflict" };
        const meta: OutcomeReceipt = { ...prior.reservation, kind: "outcome", outcome };
        const stored = await tx.insert(engineVersionErrorLogs).values({ id, chat_id: target.chatId, version_id: target.versionId,
          level: "info", category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "Server repair model outcome recorded.", meta }).onConflictDoNothing().returning({ id: engineVersionErrorLogs.id });
        if (stored.length !== 1) throw new Error("Budget outcome not stored");
        return { status: "outcome_recorded", receiptId: id };
      }
      if (prior) return { status: sameIdentity(prior, slot) ? "duplicate" : "slot_used" };
      // Unknown invocation outcomes consume capacity and cannot authorize any new paid resumption.
      if ([...budget.init.history.finalize, ...budget.used].some((used) => used.outcome === "unknown")) return { status: "outcome_unknown" };
      const matching = [...budget.init.history.finalize, ...budget.used.slice().sort((a, b) => a.passIndex - b.passIndex || (a.slot === "retry" ? 1 : -1))].filter((used) => sameIdentity(used, slot)).at(-1);
      if (matching && matching.outcome !== "aborted") return { status: "duplicate" };
      if (slot.slot === "retry") {
        const primary = budget.used.find((used) => used.passIndex === slot.passIndex && used.slot === "primary");
        if (!primary) return { status: "retry_without_primary" };
        if (primary.outcome !== "aborted" && primary.outcome !== "partial") return { status: "retry_not_allowed" };
      }
      const id = slotId(target.versionId, target.scopeId, slot);
      const meta: Reservation = { ...slot, kind: "reservation", schema: 1, chatId: target.chatId, versionId: target.versionId, scopeId: target.scopeId, filesRevision: target.filesRevision, runId: target.runId };
      const stored = await tx.insert(engineVersionErrorLogs).values({ id, chat_id: target.chatId, version_id: target.versionId,
        level: "info", category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "Server repair model slot reserved.", meta }).onConflictDoNothing().returning({ id: engineVersionErrorLogs.id });
      if (stored.length !== 1) throw new Error("Budget reservation not stored");
      return { status: "reserved", receiptId: id };
    });
  } catch {
    return { status: "unavailable" };
  }
}
