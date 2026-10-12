import { createHash } from "node:crypto";
import { and, eq, gt, like, or, sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import { engineVersionErrorLogs, engineVersionJobs, engineVersions } from "@/lib/db/schema";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import type { RepairLedgerInvocation, RepairLedgerRecord } from "@/lib/gen/autofix/llm-repair-gate";
import type { Version } from "@/lib/db/chat-repository/types";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { BuildFinalizePreflightLogBundleParams } from "@/lib/gen/stream/finalize-preflight-logs";
import type { ServerVerifyDecision } from "@/lib/gen/stream/post-finalize-policies";
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
export type ServerFinalizeBootstrap = {
  source: "trusted_new_finalize";
  scopeId: string;
  buildSpec: BuildSpec;
  preflight: Omit<BuildFinalizePreflightLogBundleParams, "chatId" | "versionId">;
  verifierGatesVerification: boolean;
  previewHasBuildBreakingFindings: boolean;
  willRunQualityGate: boolean;
  qualityGatePlanned: boolean;
  /** Typed post-processing choice; absent on legacy finalize callers means off. */
  materializeImages?: boolean;
  finalize: RepairLedgerInvocation[];
};
type StartPolicy = Pick<BuildSpec, "previewPolicy" | "verificationPolicy"> & {
  serverVerify: ServerVerifyDecision;
  preview: { canStartPreview: boolean; hasBuildBreakingFindings: boolean };
  // A server-verify skip (normal F2) is NOT a skip of image/product/QG work.
  postChecks: { willRunQualityGate: boolean; qualityGatePlanned: boolean; materializeImages?: boolean };
};
export type ServerRepairBudgetSnapshot = { scopeId: string; startPolicy: StartPolicy; finalize: RepairLedgerInvocation[]; consumed: Attempt[] };
export type ServerRepairBudgetTarget = {
  chatId: string;
  versionId: string;
  filesRevision: string;
  runId: string;
  scopeId: string;
};
type Denied = "stale_target" | "lease_unavailable" | "history_unknown" | "scope_mismatch" | "duplicate" | "slot_used" | "retry_without_primary" | "retry_not_allowed" | "outcome_unknown" | "outcome_conflict" | "reservation_missing" | "capacity" | "unavailable";
export type ServerRepairBudgetResult = { status: "reserved" | "outcome_recorded"; receiptId: string } |
  { status: "ready"; snapshot: ServerRepairBudgetSnapshot } | { status: Denied };
type Init = { kind: "init"; schema: 1; chatId: string; versionId: string; scopeId: string; filesRevision: string; maxPasses: number; history: ServerRepairBudgetHistory; startPolicy: StartPolicy };
type Reservation = Slot & { kind: "reservation"; schema: 1; chatId: string; versionId: string; scopeId: string; filesRevision: string; runId: string };
type OutcomeReceipt = Omit<Reservation, "kind"> & { kind: "outcome"; outcome: KnownOutcome };
type Used = Attempt & { reservation?: Reservation };
type Receipt = { id: string; category: string | null; meta: unknown };
type BudgetTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BudgetVersion = Pick<typeof engineVersions.$inferSelect, "id" | "chatId" | "filesRevision" | "createdAt" | "editKind" | "lifecycleStage" | "releaseState" | "verificationState">;
export type ServerResumeTarget = Omit<ServerRepairBudgetTarget, "scopeId">;
export type ServerResumeHold = "starting" | "runtime_hold" | "claim_busy" | "superseded";
export type ServerResumeOutcome = ServerResumeHold | "retryable_failure" | "completed" | "terminal";
type ResumeAttempt = { attemptId: number; runId: string; filesRevision: string; reservedAt: number;
  /** Unknown (including crash/takeover) consumes a logical attempt. */
  outcome: ServerResumeOutcome | "unknown"; settledAt?: number; settledFilesRevision?: string };
type ResumeState = { authority: "generated_postchecks_resume" | "import_postchecks_resume"; scopeId: string; originalCreatedAt: number;
  attempts: ResumeAttempt[]; boundedHolds: number; nextEligibleAt: number;
  terminal: "completed" | "policy_stop" | "expired" | "attempts_exhausted" | "holds_exhausted" | "version_closed" | null;
  lastHold?: { runId: string; filesRevision: string; reason: ServerResumeHold; observedAt: number } };
type ResumeControl = ResumeState & { kind: "resume_control"; schema: 1; chatId: string; versionId: string };
export type ServerResumeControlSnapshot = ResumeState & { attemptsUsed: number; nextAttemptId: number;
  disposition: "eligible" | "too_young" | "backoff" | "busy" | "terminal" };
export type ServerResumeControlResult =
  | { status: "resume_control" | "resume_reserved" | "resume_settled" | "resume_held"; snapshot: ServerResumeControlSnapshot; attemptId?: number }
  | { status: Denied | "not_eligible" | "terminal" | "resume_busy" | "ineligible"; snapshot?: ServerResumeControlSnapshot };
const RESUME_MAX_ATTEMPTS = 3;
const RESUME_MAX_HOLDS = 20;
const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const RESUME_BACKOFF_MS = 8_000;
const resumeHolds: readonly ServerResumeHold[] = ["starting", "runtime_hold", "claim_busy", "superseded"];
const resumeOutcomes: readonly ServerResumeOutcome[] = [...resumeHolds, "retryable_failure", "completed", "terminal"];
const resumeKeys = new Set(["kind", "schema", "chatId", "versionId", "authority", "scopeId", "originalCreatedAt", "attempts", "boundedHolds", "nextEligibleAt", "terminal", "lastHold"]);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const resumeMinAge = (state: Pick<ResumeState, "authority">) => state.authority === "import_postchecks_resume" ? 90_000 : 5 * 60_000;
const resumeUsed = (state: Pick<ResumeState, "attempts">) => state.attempts.filter(attempt => !resumeHolds.includes(attempt.outcome as ServerResumeHold)).length;

const digest = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const initId = (versionId: string) => `${RECEIPT_PREFIX}${digest([versionId, "init"])}`;
const resumeId = (versionId: string) => `${RECEIPT_PREFIX}${digest([versionId, "resume_control"])}`;
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
function validStartPolicy(value: unknown): value is StartPolicy {
  return object(value) && ["fidelity2", "fidelity3"].includes(value.previewPolicy as string) &&
    ["fast", "standard", "strict"].includes(value.verificationPolicy as string) &&
    object(value.serverVerify) && typeof value.serverVerify.run === "boolean" && text(value.serverVerify.reason) &&
    (value.serverVerify.diagnosticOnly === undefined || typeof value.serverVerify.diagnosticOnly === "boolean") &&
    object(value.preview) && typeof value.preview.canStartPreview === "boolean" && typeof value.preview.hasBuildBreakingFindings === "boolean" &&
    object(value.postChecks) && typeof value.postChecks.willRunQualityGate === "boolean" && typeof value.postChecks.qualityGatePlanned === "boolean" &&
    (value.postChecks.materializeImages === undefined || typeof value.postChecks.materializeImages === "boolean");
}
function validResumeReceipt(row: Receipt, target: ServerResumeTarget): row is Receipt & { meta: ResumeControl } {
  const m = row.meta;
  if (row.id !== resumeId(target.versionId) || row.category !== SERVER_REPAIR_BUDGET_LOG_CATEGORY || !object(m) ||
      !Object.keys(m).every(key => resumeKeys.has(key)) || m.kind !== "resume_control" || m.schema !== 1 ||
      m.chatId !== target.chatId || m.versionId !== target.versionId || !text(m.scopeId) ||
      !["generated_postchecks_resume", "import_postchecks_resume"].includes(m.authority as string) || !integer(m.originalCreatedAt) ||
      !integer(m.nextEligibleAt) || m.nextEligibleAt < m.originalCreatedAt + resumeMinAge(m as ResumeControl) || m.nextEligibleAt > m.originalCreatedAt + RESUME_MAX_AGE_MS ||
      !integer(m.boundedHolds) || m.boundedHolds > RESUME_MAX_HOLDS || !Array.isArray(m.attempts) ||
      ![null, "completed", "policy_stop", "expired", "attempts_exhausted", "holds_exhausted", "version_closed"].includes(m.terminal as null)) return false;
  const attemptsValid = m.attempts.every((a, index) => object(a) &&
    Object.keys(a).every(key => ["attemptId", "runId", "filesRevision", "reservedAt", "outcome", "settledAt", "settledFilesRevision"].includes(key)) &&
    a.attemptId === index + 1 && text(a.runId) && text(a.filesRevision) && integer(a.reservedAt) && a.reservedAt >= Number(m.originalCreatedAt) + resumeMinAge(m as ResumeControl) && a.reservedAt < Number(m.originalCreatedAt) + RESUME_MAX_AGE_MS &&
    (a.outcome === "unknown" ? a.settledAt === undefined && a.settledFilesRevision === undefined
      : resumeOutcomes.includes(a.outcome as ServerResumeOutcome) && integer(a.settledAt) && a.settledAt >= a.reservedAt && a.settledAt < Number(m.originalCreatedAt) + RESUME_MAX_AGE_MS && text(a.settledFilesRevision)));
  if (!attemptsValid || resumeUsed(m as ResumeControl) > RESUME_MAX_ATTEMPTS) return false;
  return m.lastHold === undefined || (object(m.lastHold) &&
    Object.keys(m.lastHold).every(key => ["runId", "filesRevision", "reason", "observedAt"].includes(key)) &&
    text(m.lastHold.runId) && text(m.lastHold.filesRevision) && resumeHolds.includes(m.lastHold.reason as ServerResumeHold) && integer(m.lastHold.observedAt) &&
    m.lastHold.observedAt >= Number(m.originalCreatedAt) + resumeMinAge(m as ResumeControl) && m.lastHold.observedAt < Number(m.originalCreatedAt) + RESUME_MAX_AGE_MS);
}
function readBudget(rows: Receipt[], target: ServerRepairBudgetTarget): { init: Init; used: Used[] } | null {
  const root = rows.find((row) => row.id === initId(target.versionId));
  if (!root || root.category !== SERVER_REPAIR_BUDGET_LOG_CATEGORY || !object(root.meta)) return null;
  const meta = root.meta;
  if (meta.kind !== "init" || meta.schema !== 1 || meta.chatId !== target.chatId || meta.versionId !== target.versionId ||
    !text(meta.scopeId) || !text(meta.filesRevision) || meta.maxPasses !== SERVER_REPAIR_MAX_PASSES || !validHistory(meta.history) || !validStartPolicy(meta.startPolicy)) return null;
  const init = meta as Init;
  const used: Used[] = init.history.consumed.map((slot) => ({ ...slot }));
  const outcomes: OutcomeReceipt[] = [];
  for (const row of rows) {
    if (row === root) continue;
    // Control/import receipts carry no model slots. Validate before paid parsing.
    if (validResumeReceipt(row, target)) continue;
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
  return transact({ ...target, scopeId: "read" }, undefined, undefined, true);
}
/** Called ONLY inside the new assistant/version transaction. No lease/model slot
 * is claimed here. Any failure propagates so the whole creation rolls back. */
export async function writeServerFinalizeBootstrap(
  tx: Pick<typeof db, "insert">,
  chatId: string,
  version: Pick<Version, "id" | "chat_id" | "files_revision" | "edit_kind">,
  input: ServerFinalizeBootstrap,
): Promise<void> {
  const history: ServerRepairBudgetHistory = { source: "observed_fixer_calls", finalize: input.finalize, consumed: [] };
  if (input.source !== "trusted_new_finalize" || ![chatId, version.id, version.files_revision, input.scopeId].every(text) ||
    version.chat_id !== chatId || version.edit_kind != null || !validHistory(history)) {
    throw new Error("Invalid trusted finalize bootstrap identity/history");
  }
  // Lazy imports keep this DB writer from eagerly loading the entire verify graph.
  const { buildFinalizePreflightLogBundle } = await import("@/lib/gen/stream/finalize-preflight-logs");
  const { resolvePostFinalizeServerVerifyDecision } = await import("@/lib/gen/stream/post-finalize-policies");
  const bundle = buildFinalizePreflightLogBundle({ ...input.preflight, chatId, versionId: version.id });
  const preflight = {
    previewBlocked: bundle.hasPreviewBlockingPreflightErrors,
    verificationBlocked: bundle.hasVerificationBlockingPreflightErrors || input.verifierGatesVerification,
    issueCount: input.preflight.preflightIssues.length,
    errorCount: bundle.preflightErrors.length,
    warningCount: bundle.preflightWarnings.length,
    previewBlockingReason: input.preflight.previewBlockingReason,
    previewStart: input.preflight.previewStart,
  };
  const startPolicy: StartPolicy = {
    previewPolicy: input.buildSpec.previewPolicy,
    verificationPolicy: input.buildSpec.verificationPolicy,
    serverVerify: resolvePostFinalizeServerVerifyDecision({ buildSpec: input.buildSpec, finalized: { version, preflight } }),
    preview: { canStartPreview: input.preflight.previewStart.canStartPreview, hasBuildBreakingFindings: input.previewHasBuildBreakingFindings },
    postChecks: { willRunQualityGate: input.willRunQualityGate, qualityGatePlanned: input.qualityGatePlanned,
      materializeImages: input.materializeImages === true },
  };
  if (!validStartPolicy(startPolicy)) throw new Error("Invalid trusted finalize start policy");
  const id = initId(version.id);
  const meta: Init = { kind: "init", schema: 1, chatId, versionId: version.id, filesRevision: version.files_revision!,
    scopeId: input.scopeId, maxPasses: SERVER_REPAIR_MAX_PASSES, history, startPolicy };
  const stored = await tx.insert(engineVersionErrorLogs).values({ id, chat_id: chatId, version_id: version.id,
    level: "info", category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "Trusted finalize start recorded.", meta }).onConflictDoNothing().returning({ id: engineVersionErrorLogs.id });
  if (stored.length !== 1) throw new Error("Finalize start receipt not stored");
}
export async function reserveServerRepairBudget(target: ServerRepairBudgetTarget, slot: Slot): Promise<ServerRepairBudgetResult> {
  if (!validSlot(slot)) return { status: "capacity" };
  return transact(target, { ...slot, requiredFiles: normalizeFiles(slot.requiredFiles) });
}
/** Record the original lease's observed outcome; an absent/failed write never refunds a reservation. */
export async function recordServerRepairBudgetOutcome(target: ServerRepairBudgetTarget, slot: Slot, outcome: KnownOutcome): Promise<ServerRepairBudgetResult> {
  if (!validSlot(slot) || !knownOutcome(outcome)) return { status: "history_unknown" };
  return transact(target, { ...slot, requiredFiles: normalizeFiles(slot.requiredFiles) }, outcome);
}

/** Non-paid read. A probe/replay must not reserve or create a control receipt. */
export async function readServerResumeControl(target: ServerResumeTarget): Promise<ServerResumeControlResult> {
  return transactResume(target, { kind: "read" });
}
/** Resume only: the initial generation/bootstrap is never a logical attempt. */
export async function reserveServerResumeAttempt(target: ServerResumeTarget): Promise<ServerResumeControlResult> {
  return transactResume(target, { kind: "reserve" });
}
/** Only the original current holder may confirm/refund its own logical attempt. */
export async function settleServerResumeAttempt(target: ServerResumeTarget, attemptId: number, outcome: ServerResumeOutcome, retryAfterMs = RESUME_BACKOFF_MS): Promise<ServerResumeControlResult> {
  if (!integer(attemptId) || attemptId < 1 || !resumeOutcomes.includes(outcome)) return { status: "history_unknown" };
  return transactResume(target, { kind: "settle", attemptId, outcome, retryAfterMs });
}
/** Summarize a confirmed pre-work hold in the same row, never one event per tick. */
export async function recordServerResumeHold(target: ServerResumeTarget, reason: ServerResumeHold, retryAfterMs = RESUME_BACKOFF_MS): Promise<ServerResumeControlResult> {
  if (!resumeHolds.includes(reason)) return { status: "history_unknown" };
  return transactResume(target, { kind: "hold", reason, retryAfterMs });
}
/** Initial postchecks completed under this holder; persist terminal state without a resume attempt. */
export async function completeServerPostchecks(target: ServerResumeTarget): Promise<ServerResumeControlResult> {
  return transactResume(target, { kind: "complete" });
}

async function transact(target: ServerRepairBudgetTarget, slot?: Slot, outcome?: KnownOutcome, readOnly = false): Promise<ServerRepairBudgetResult> {
  if (!dbConfigured) return { status: "unavailable" };
  if (![target.chatId, target.versionId, target.filesRevision, target.runId, target.scopeId].every(text)) return { status: "stale_target" };
  try {
    return await db.transaction(async (tx): Promise<ServerRepairBudgetResult> => {
      const locked = await lockBudgetTarget(tx, target);
      if (locked.kind === "denied") return { status: locked.status };
      const { rows } = locked;
      const budget = readBudget(rows, target);
      if (!budget) return { status: "history_unknown" };
      if (readOnly) return { status: "ready", snapshot: { scopeId: budget.init.scopeId, startPolicy: { ...budget.init.startPolicy,
        postChecks: { ...budget.init.startPolicy.postChecks, materializeImages: budget.init.startPolicy.postChecks.materializeImages === true } }, finalize: budget.init.history.finalize,
        consumed: budget.used.map(({ passIndex, slot, contentHash, diagnosticFingerprint, requiredFiles, outcome }) =>
          ({ passIndex, slot, contentHash, diagnosticFingerprint, requiredFiles, outcome })).sort((a, b) => a.passIndex - b.passIndex || (a.slot === "retry" ? 1 : -1)) } };
      if (budget.init.scopeId !== target.scopeId) return { status: "scope_mismatch" };
      if (!slot) return { status: "history_unknown" };
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

async function currentBudgetLease(tx: BudgetTx, target: ServerResumeTarget): Promise<boolean> {
  const leases = await tx.select({ runId: engineVersionJobs.runId }).from(engineVersionJobs).where(and(
    eq(engineVersionJobs.versionId, target.versionId), eq(engineVersionJobs.runId, target.runId),
    eq(engineVersionJobs.status, "running"), gt(engineVersionJobs.leaseExpiresAt, sql`clock_timestamp()`),
  )).for("update");
  return leases.length > 0;
}
async function lockBudgetTarget(tx: BudgetTx, target: ServerResumeTarget): Promise<
  { kind: "held"; version: BudgetVersion; rows: Receipt[] } | { kind: "denied"; status: "stale_target" | "lease_unavailable" }
> {
  await tx.execute(sql`SELECT set_config('lock_timeout', '3000', true)`);
  // Shared version -> job lock order; the version row cannot advance in this TX.
  const versions = await tx.select({ id: engineVersions.id, chatId: engineVersions.chatId, filesRevision: engineVersions.filesRevision,
    createdAt: engineVersions.createdAt, editKind: engineVersions.editKind, lifecycleStage: engineVersions.lifecycleStage,
    releaseState: engineVersions.releaseState, verificationState: engineVersions.verificationState })
    .from(engineVersions).where(eq(engineVersions.id, target.versionId)).for("update");
  if (versions[0]?.chatId !== target.chatId || versions[0]?.filesRevision !== target.filesRevision) return { kind: "denied", status: "stale_target" };
  if (!(await currentBudgetLease(tx, target))) return { kind: "denied", status: "lease_unavailable" };
  const rows = await tx.select({ id: engineVersionErrorLogs.id, category: engineVersionErrorLogs.category, meta: engineVersionErrorLogs.meta })
    .from(engineVersionErrorLogs).where(and(eq(engineVersionErrorLogs.version_id, target.versionId),
      or(eq(engineVersionErrorLogs.category, SERVER_REPAIR_BUDGET_LOG_CATEGORY), like(engineVersionErrorLogs.id, `${RECEIPT_PREFIX}%`))));
  return { kind: "held", version: versions[0], rows };
}

function resumeSnapshot(state: ResumeState, target: ServerResumeTarget, version: BudgetVersion, now: number): ServerResumeControlSnapshot {
  const ownActive = state.attempts.at(-1)?.outcome === "unknown" && state.attempts.at(-1)?.runId === target.runId;
  const terminal = now >= state.originalCreatedAt + RESUME_MAX_AGE_MS ? "expired"
    : version.releaseState !== "draft" || version.verificationState !== "pending" ? "version_closed"
    : state.terminal ?? (state.boundedHolds >= RESUME_MAX_HOLDS ? "holds_exhausted" : resumeUsed(state) >= RESUME_MAX_ATTEMPTS ? "attempts_exhausted" : null);
  const disposition = terminal && !(ownActive && terminal === "attempts_exhausted") ? "terminal"
    : now < state.originalCreatedAt + resumeMinAge(state) ? "too_young"
    : ownActive ? "busy" : now < state.nextEligibleAt ? "backoff" : "eligible";
  return { ...state, terminal, disposition, attemptsUsed: resumeUsed(state), nextAttemptId: state.attempts.length + 1 };
}
type ResumeOperation = { kind: "read" | "reserve" | "complete" } | { kind: "hold"; reason: ServerResumeHold; retryAfterMs: number }
  | { kind: "settle"; attemptId: number; outcome: ServerResumeOutcome; retryAfterMs: number };
function resumeStateFromRows(rows: Receipt[], target: ServerResumeTarget, version: BudgetVersion, imported: boolean): ResumeState | null {
  const originalCreatedAt = version.createdAt?.getTime();
  if (!integer(originalCreatedAt)) return null;
  const paid = readBudget(rows, { ...target, scopeId: "read" });
  if ((!imported && !paid) || (rows.some(row => !validResumeReceipt(row, target)) && !paid)) return null;
  const authority = imported ? "import_postchecks_resume" : "generated_postchecks_resume";
  const scopeId = paid?.init.scopeId ?? `${target.versionId}:import_postchecks_resume`;
  const existing = rows.find(row => row.id === resumeId(target.versionId));
  if (existing) {
    if (!validResumeReceipt(existing, target) || existing.meta.authority !== authority || existing.meta.scopeId !== scopeId ||
        existing.meta.originalCreatedAt !== originalCreatedAt) return null;
    const { kind: _kind, schema: _schema, chatId: _chatId, versionId: _versionId, ...state } = structuredClone(existing.meta);
    return state;
  }
  return { authority, scopeId, originalCreatedAt, attempts: [], boundedHolds: 0,
    nextEligibleAt: originalCreatedAt + resumeMinAge({ authority }), terminal: null };
}
/** Selection hint only. The versions owner supplies DB rows; execution revalidates under lease. */
export function isServerPostcheckResumeDue(version: BudgetVersion, rows: Receipt[], imported: boolean, now: number): boolean {
  if (version.lifecycleStage !== "design" || (version.editKind !== null && version.editKind !== "imported_repo") ||
      !text(version.filesRevision) || typeof imported !== "boolean") return false;
  const target = { chatId: version.chatId, versionId: version.id, filesRevision: version.filesRevision, runId: "" };
  const paid = readBudget(rows, { ...target, scopeId: "read" });
  if (!imported && paid && (!paid.init.startPolicy.preview.canStartPreview || paid.init.startPolicy.preview.hasBuildBreakingFindings)) return false;
  const state = resumeStateFromRows(rows, target, version, imported);
  return !!state && resumeSnapshot(state, target, version, now).disposition === "eligible";
}
async function transactResume(target: ServerResumeTarget, operation: ResumeOperation): Promise<ServerResumeControlResult> {
  if (!dbConfigured) return { status: "unavailable" };
  if (![target.chatId, target.versionId, target.filesRevision, target.runId].every(text) ||
      ("retryAfterMs" in operation && (!integer(operation.retryAfterMs) || operation.retryAfterMs < 1))) return { status: "stale_target" };
  try {
    // Historical import provenance is persistent; read before holding a pool connection.
    // Current version, lease and authority-bound receipts are still checked under TX.
    const { chatHasImportedRepoVersion } = await import("@/lib/db/chat-repository-pg");
    const importLineage = await chatHasImportedRepoVersion(target.chatId);
    if (typeof importLineage !== "boolean") return { status: "history_unknown" };
    return await db.transaction(async (tx): Promise<ServerResumeControlResult> => {
      const locked = await lockBudgetTarget(tx, target);
      if (locked.kind === "denied") return { status: locked.status };
      const { version, rows } = locked;
      if (version.lifecycleStage !== "design" || (version.editKind !== null && version.editKind !== "imported_repo")) return { status: "ineligible" };
      const originalCreatedAt = version.createdAt?.getTime();
      if (!integer(originalCreatedAt)) return { status: "history_unknown" };
      const imported = version.editKind === "imported_repo" || importLineage;
      const state = resumeStateFromRows(rows, target, version, imported);
      if (!state) return { status: "history_unknown" };
      // Final eligibility/read proof stays under the current version -> job fence.
      if (!(await currentBudgetLease(tx, target))) return { status: "lease_unavailable" };
      const now = Date.now();
      const snapshot = () => resumeSnapshot(state, target, version, Date.now());
      if (operation.kind === "read") return { status: "resume_control", snapshot: snapshot() };
      let attemptId: number | undefined;
      let status: "resume_reserved" | "resume_settled" | "resume_held";
      if (operation.kind === "complete") {
        if (state.terminal === "completed") return { status: "resume_settled", snapshot: snapshot() };
        if (state.terminal || state.attempts.some(attempt => attempt.outcome === "unknown")) return { status: "terminal", snapshot: snapshot() };
        state.terminal = "completed"; status = "resume_settled";
      } else if (operation.kind === "settle") {
        const attempt = state.attempts.find(a => a.attemptId === operation.attemptId);
        if (!attempt) return { status: "reservation_missing" };
        if (attempt.runId !== target.runId) return { status: "stale_target" };
        if (attempt.outcome !== "unknown") return attempt.outcome === operation.outcome
          ? { status: "resume_settled", attemptId: attempt.attemptId, snapshot: snapshot() } : { status: "outcome_conflict" };
        if (now >= originalCreatedAt + RESUME_MAX_AGE_MS) return { status: "terminal", snapshot: snapshot() };
        attempt.outcome = operation.outcome; attempt.settledAt = now; attempt.settledFilesRevision = target.filesRevision;
        attemptId = attempt.attemptId; status = "resume_settled";
        if (state.terminal === "attempts_exhausted" && resumeUsed(state) < RESUME_MAX_ATTEMPTS) state.terminal = null;
        if (operation.outcome === "completed") state.terminal = "completed";
        if (operation.outcome === "terminal") state.terminal = "policy_stop";
      } else {
        const current = snapshot();
        const active = state.attempts.at(-1);
        if (operation.kind === "reserve" && current.disposition === "busy" && active) return { status: "resume_reserved", attemptId: active.attemptId, snapshot: current };
        if (operation.kind === "hold" && state.lastHold?.runId === target.runId && state.lastHold.filesRevision === target.filesRevision &&
            state.lastHold.reason === operation.reason && current.disposition === "backoff") return { status: "resume_held", snapshot: current };
        if (current.disposition !== "eligible") return { status: current.disposition === "terminal" ? "terminal" : current.disposition === "busy" ? "resume_busy" : "not_eligible", snapshot: current };
        if (operation.kind === "reserve") {
          attemptId = current.nextAttemptId;
          state.attempts.push({ attemptId, runId: target.runId, filesRevision: target.filesRevision, reservedAt: now, outcome: "unknown" });
          status = "resume_reserved";
        } else status = "resume_held";
      }
      const hold = operation.kind === "hold" ? operation.reason : operation.kind === "settle" && resumeHolds.includes(operation.outcome as ServerResumeHold) ? operation.outcome as ServerResumeHold : null;
      if (hold) {
        if (hold === "runtime_hold" || hold === "claim_busy") state.boundedHolds++;
        state.lastHold = { runId: target.runId, filesRevision: target.filesRevision, reason: hold, observedAt: now };
      }
      state.nextEligibleAt = Math.min(originalCreatedAt + RESUME_MAX_AGE_MS,
        Math.max(originalCreatedAt + resumeMinAge(state), now + ("retryAfterMs" in operation ? operation.retryAfterMs : RESUME_BACKOFF_MS)));
      if (!state.terminal && state.boundedHolds >= RESUME_MAX_HOLDS) state.terminal = "holds_exhausted";
      if (!state.terminal && resumeUsed(state) >= RESUME_MAX_ATTEMPTS) state.terminal = "attempts_exhausted";
      const meta: ResumeControl = { ...state, kind: "resume_control", schema: 1, chatId: target.chatId, versionId: target.versionId };
      const row = { id: resumeId(target.versionId), chat_id: target.chatId, version_id: target.versionId,
        level: "info", category: SERVER_REPAIR_BUDGET_LOG_CATEGORY, message: "Server resume control.", meta };
      if (!validResumeReceipt(row, target)) return { status: "history_unknown" };
      if (!(await currentBudgetLease(tx, target))) return { status: "lease_unavailable" };
      if (Date.now() >= originalCreatedAt + RESUME_MAX_AGE_MS) return { status: "terminal", snapshot: snapshot() };
      const stored = await tx.insert(engineVersionErrorLogs).values(row).onConflictDoUpdate({ target: engineVersionErrorLogs.id, set: { meta } }).returning({ id: engineVersionErrorLogs.id });
      if (stored.length !== 1) throw new Error("Resume control not stored");
      return { status, attemptId, snapshot: snapshot() };
    });
  } catch { return { status: "unavailable" }; }
}
