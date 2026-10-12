import { createHash } from "node:crypto";

import { DEFAULT_MODEL_ID, type CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import { devLogAppend } from "@/lib/logging/dev-log";
import type { ReasoningEffort, ReasoningMode } from "../engine";
import type { RecurringFailurePattern } from "./fixer-prompt";
import { runLlmFixer, type FixerResult } from "./llm-fixer";

export interface LlmRepairConfig {
  fixerModel: string;
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  reasoningMode?: ReasoningMode;
}

export function resolveLlmRepairConfig(resolvedTier?: CanonicalModelId): LlmRepairConfig {
  const fixerTier = resolvedTier ?? DEFAULT_MODEL_ID;
  const fixerModel = resolvePhaseModel(fixerTier, "fixer").modelId;
  const fixerThinking = resolvePhaseThinking(fixerTier, "fixer");
  return {
    fixerModel,
    thinking: fixerThinking?.thinking,
    reasoningEffort: fixerThinking?.reasoningEffort,
    reasoningMode: fixerThinking?.reasoningMode,
  };
}

export interface RepairLedgerRecord {
  key: string;
  scopeId: string;
  chatId: string;
  contentHash: string;
  diagnosticFingerprint: string;
  requiredFiles: string[];
  phase?: string;
  attempts: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastOutcome?: "success" | "failed" | "partial" | "aborted" | "error";
}

export type RepairLedgerInvocation = Pick<RepairLedgerRecord, "contentHash" | "diagnosticFingerprint" | "requiredFiles"> & {
  outcome: NonNullable<RepairLedgerRecord["lastOutcome"]> | "unknown";
};
export type RepairBudgetHooks = {
  reserve: (identity: RepairLedgerInvocation) => Promise<void>;
  complete: (identity: RepairLedgerInvocation) => Promise<void>;
};

export class RepairLedger {
  private records = new Map<string, RepairLedgerRecord>();
  private invocations: Array<RepairLedgerInvocation & { scopeId: string; chatId: string }> = [];

  observeInvocation(record: RepairLedgerRecord): RepairLedgerInvocation {
    const observation = { contentHash: record.contentHash, diagnosticFingerprint: record.diagnosticFingerprint,
      requiredFiles: [...record.requiredFiles], outcome: "unknown" as RepairLedgerInvocation["outcome"], scopeId: record.scopeId, chatId: record.chatId };
    this.invocations.push(observation);
    return observation;
  }

  /** Observations only. Exporting/hydrating a ledger grants no bootstrap authority. */
  exportInvocations(chatId: string, scopeId: string): RepairLedgerInvocation[] {
    return this.invocations.filter((call) => call.chatId === chatId && call.scopeId === scopeId)
      .map(({ contentHash, diagnosticFingerprint, requiredFiles, outcome }) => ({ contentHash, diagnosticFingerprint, requiredFiles: [...requiredFiles], outcome }));
  }

  static hydrate(chatId: string, scopeId: string, calls: RepairLedgerInvocation[]): RepairLedger {
    const ledger = new RepairLedger();
    for (const call of calls) {
      const key = [scopeId, chatId, call.contentHash, call.diagnosticFingerprint, call.requiredFiles.join(",")].join(":");
      const previous = ledger.records.get(key);
      const now = Date.now();
      ledger.records.set(key, { key, scopeId, chatId, contentHash: call.contentHash, diagnosticFingerprint: call.diagnosticFingerprint,
        requiredFiles: [...call.requiredFiles], attempts: (previous?.attempts ?? 0) + 1, firstSeenAt: previous?.firstSeenAt ?? now, lastSeenAt: now,
        lastOutcome: call.outcome === "unknown" ? undefined : call.outcome });
    }
    // Hydration is not proof of a new finalize and must never authorize a fresh seed.
    return ledger;
  }

  keyFor(params: {
    scopeId: string;
    chatId: string;
    content: string;
    errors: string[];
    requiredFiles?: string[];
    phase?: string;
  }): string {
    const contentHash = hashText(params.content);
    const diagnosticFingerprint = diagnosticFingerprintFor(params.errors);
    const requiredFiles = normalizeRequiredFiles(params.requiredFiles);
    return [
      params.scopeId,
      params.chatId,
      contentHash,
      diagnosticFingerprint,
      requiredFiles.join(","),
    ].join(":");
  }

  begin(params: {
    scopeId: string;
    chatId: string;
    content: string;
    errors: string[];
    requiredFiles?: string[];
    phase?: string;
  }):
    { allowed: true; record: RepairLedgerRecord } | { allowed: false; record: RepairLedgerRecord } {
    const key = this.keyFor(params);
    const now = Date.now();
    const existing = this.records.get(key);
    if (existing) {
      existing.attempts += 1;
      existing.lastSeenAt = now;
      // An aborted attempt (timeout/AbortSignal) produced no output, so the
      // caller's immediate retry with a reduced budget is a legitimate
      // continuation — not a duplicate repair of already-fixed content. Only a
      // COMPLETED attempt (success/failed/partial/error) dedupe-blocks.
      if (existing.lastOutcome === "aborted") {
        return { allowed: true, record: existing };
      }
      return { allowed: false, record: existing };
    }
    const record: RepairLedgerRecord = {
      key,
      scopeId: params.scopeId,
      chatId: params.chatId,
      contentHash: hashText(params.content),
      diagnosticFingerprint: diagnosticFingerprintFor(params.errors),
      requiredFiles: normalizeRequiredFiles(params.requiredFiles),
      phase: params.phase,
      attempts: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };
    this.records.set(key, record);
    return { allowed: true, record };
  }

  complete(key: string, result: Pick<FixerResult, "success" | "partial" | "aborted">): void {
    const record = this.records.get(key);
    if (!record) return;
    record.lastSeenAt = Date.now();
    record.lastOutcome = result.aborted
      ? "aborted"
      : result.success
        ? "success"
        : result.partial
          ? "partial"
          : "failed";
  }

  markError(key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    record.lastSeenAt = Date.now();
    record.lastOutcome = "error";
  }

  clear(): void {
    this.records.clear();
    this.invocations = [];
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function diagnosticFingerprintFor(errors: string[]): string {
  const normalized = errors
    .map((error) => error.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort();
  return hashText(normalized.join("\n"));
}

function normalizeRequiredFiles(requiredFiles: string[] | undefined): string[] {
  return [...new Set((requiredFiles ?? []).map((file) => file.trim()).filter(Boolean))].sort();
}

function skippedResult(content: string): FixerResult {
  return {
    fixedContent: content,
    fixedFiles: [],
    missingFiles: [],
    incompleteFiles: [],
    partial: false,
    success: false,
    durationMs: 0,
  };
}

export async function runLlmRepairGate(params: {
  content: string;
  errors: string[];
  chatId: string;
  timeoutMs: number;
  requiredFiles?: string[];
  resolvedTier?: CanonicalModelId;
  config?: LlmRepairConfig;
  /** Max output tokens for the fixer call. Omitted → fixer default. */
  maxTokens?: number;
  /**
   * Recurring failure patterns to feed the fixer prompt. When provided
   * (even as `[]`) this overrides the default per-chat read — used by the
   * repair loop, whose callers already resolved the patterns themselves.
   */
  recurringPatterns?: RecurringFailurePattern[];
  phase?: string;
  scopeId?: string;
  ledger?: RepairLedger;
  /** Server-loop only: strict durable writes, not best-effort phase telemetry. */
  repairBudget?: RepairBudgetHooks;
}): Promise<{
  result: Awaited<ReturnType<typeof runLlmFixer>>;
  fixerModel: string;
  /** True when the ledger dedupe-skipped this attempt (no LLM call made). */
  deduped: boolean;
}> {
  const config = params.config ?? resolveLlmRepairConfig(params.resolvedTier);
  const ledger = params.ledger;
  const scopeId = params.scopeId ?? params.chatId;
  const ledgerStart = ledger
    ? ledger.begin({
        scopeId,
        chatId: params.chatId,
        content: params.content,
        errors: params.errors,
        requiredFiles: params.requiredFiles,
        phase: params.phase,
      })
    : null;
  if (ledgerStart && !ledgerStart.allowed) {
    try {
      devLogAppend("in-progress", {
        type: "llm_repair_gate.deduped",
        chatId: params.chatId,
        phase: params.phase ?? null,
        scopeId,
        requiredFiles: ledgerStart.record.requiredFiles,
        diagnosticFingerprint: ledgerStart.record.diagnosticFingerprint,
        contentHash: ledgerStart.record.contentHash,
        attempts: ledgerStart.record.attempts,
        lastOutcome: ledgerStart.record.lastOutcome ?? null,
      });
    } catch {
      // devLog is best-effort; dedupe behavior should not fail repair.
    }
    return { result: skippedResult(params.content), fixerModel: config.fixerModel, deduped: true };
  }
  const ledgerKey = ledgerStart?.record.key ?? null;

  if (params.repairBudget && !ledgerStart) throw new Error("Repair budget requires a hydrated ledger");
  const identity = ledgerStart ? { contentHash: ledgerStart.record.contentHash, diagnosticFingerprint: ledgerStart.record.diagnosticFingerprint,
    requiredFiles: [...ledgerStart.record.requiredFiles], outcome: "unknown" as const } : null;
  // Dedupe has finished; reserve strictly before invoking the fixer.
  if (identity) await params.repairBudget?.reserve(identity);
  const observation = ledgerStart ? ledger?.observeInvocation(ledgerStart.record) : undefined;

  const abort = new AbortController();
  const timeoutHandle = setTimeout(() => abort.abort(), Math.max(1_000, params.timeoutMs));
  try {
    let result: FixerResult;
    try {
      result = await runLlmFixer(params.content, params.errors, {
      model: config.fixerModel,
      thinking: config.thinking,
      reasoningEffort: config.reasoningEffort,
      reasoningMode: config.reasoningMode,
      maxTokens: params.maxTokens,
      requiredFiles: params.requiredFiles,
      recurringPatterns: params.recurringPatterns ?? readRecurringPatternsForChat(params.chatId),
      abortSignal: abort.signal,
      });
    } catch (err) {
      if (ledger && ledgerKey) ledger.markError(ledgerKey);
      if (observation) observation.outcome = "error";
      if (identity) await params.repairBudget?.complete({ ...identity, outcome: "error" });
      throw err;
    }
    if (ledger && ledgerKey) ledger.complete(ledgerKey, result);
    const outcome = result.aborted ? "aborted" : result.success ? "success" : result.partial ? "partial" : "failed";
    if (observation) observation.outcome = outcome;
    if (identity) await params.repairBudget?.complete({ ...identity, outcome });
    return { result, fixerModel: config.fixerModel, deduped: false };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
