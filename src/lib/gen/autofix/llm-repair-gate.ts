import { DEFAULT_MODEL_ID, type CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { readRecurringPatternsForChat } from "@/lib/logging/generation-log-writer";
import type { ReasoningEffort } from "../engine";
import { runLlmFixer } from "./llm-fixer";

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

export async function runLlmRepairGate(params: {
  content: string;
  errors: string[];
  chatId: string;
  timeoutMs: number;
  requiredFiles?: string[];
  resolvedTier?: CanonicalModelId;
  config?: LlmRepairConfig;
}): Promise<{ result: Awaited<ReturnType<typeof runLlmFixer>>; fixerModel: string }> {
  const config = params.config ?? resolveLlmRepairConfig(params.resolvedTier);
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
    return { result, fixerModel: config.fixerModel };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
