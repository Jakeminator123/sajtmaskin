import { createHash } from "node:crypto";

import { DEFAULT_MODEL_ID, type CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import { devLogAppend } from "@/lib/logging/devLog";
import type { ReasoningEffort } from "../engine";
import { runLlmFixer, type FixerResult } from "./llm-fixer";

export interface LlmRepairConfig {
  fixerModel: string;
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
}

export function resolveLlmRepairConfig(resolvedTier?: CanonicalModelId): LlmRepairConfig {
  const fixerTier = resolvedTier ?? DEFAULT_MODEL_ID;
  const fixerModel = resolvePhaseModel(fixerTier, "fixer").modelId;
  const fixerThinking = resolvePhaseThinking(fixerTier, "fixer");
  return {
    fixerModel,
    thinking: fixerThinking?.thinking,
    reasoningEffort: fixerThinking?.reasoningEffort,
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

export class RepairLedger {
  private records = new Map<string, RepairLedgerRecord>();

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
  }): { allowed: true; record: RepairLedgerRecord } | { allowed: false; record: RepairLedgerRecord } {
    const key = this.keyFor(params);
    const now = Date.now();
    const existing = this.records.get(key);
    if (existing) {
      existing.attempts += 1;
      existing.lastSeenAt = now;
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
  phase?: string;
  scopeId?: string;
  ledger?: RepairLedger;
}): Promise<{ result: Awaited<ReturnType<typeof runLlmFixer>>; fixerModel: string }> {
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
    return { result: skippedResult(params.content), fixerModel: config.fixerModel };
  }
  const ledgerKey = ledgerStart?.record.key ?? null;

  const abort = new AbortController();
  const timeoutHandle = setTimeout(() => abort.abort(), Math.max(1_000, params.timeoutMs));
  try {
    const result = await runLlmFixer(params.content, params.errors, {
      model: config.fixerModel,
      thinking: config.thinking,
      reasoningEffort: config.reasoningEffort,
      requiredFiles: params.requiredFiles,
      recurringPatterns: readRecurringPatternsForChat(params.chatId),
      abortSignal: abort.signal,
    });
    if (ledger && ledgerKey) ledger.complete(ledgerKey, result);
    return { result, fixerModel: config.fixerModel };
  } catch (err) {
    if (ledger && ledgerKey) ledger.markError(ledgerKey);
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
