import { getWorkloadReasoningEffortFromManifest } from "@/lib/ai-models/load-manifest";
import {
  clampOpenAIReasoningEffort,
  getOpenAIModelCapabilities,
  type OpenAIReasoningEffort,
} from "@/lib/models/openai-capabilities";

/**
 * Effort to send for `modelId` on a manifest workload: the workload's
 * `reasoningEffort` clamped to what the model accepts. Returns `undefined` when
 * the workload declares none or the model is not a registered OpenAI model, so
 * env overrides to older ids (or Anthropic) keep their provider defaults and
 * never receive an effort value they reject.
 */
export function resolveWorkloadReasoningEffort(
  workloadId: string,
  modelId: string,
): OpenAIReasoningEffort | undefined {
  const requested = getWorkloadReasoningEffortFromManifest(workloadId);
  if (!requested || !getOpenAIModelCapabilities(modelId)) return undefined;
  return clampOpenAIReasoningEffort(modelId, requested);
}

/** Raw OpenAI Responses `reasoning` spread for {@link resolveWorkloadReasoningEffort}. */
export function workloadResponsesReasoning(
  workloadId: string,
  modelId: string,
): { reasoning?: { effort: OpenAIReasoningEffort } } {
  const effort = resolveWorkloadReasoningEffort(workloadId, modelId);
  return effort ? { reasoning: { effort } } : {};
}

/** Raw OpenAI Chat Completions `reasoning_effort` spread. */
export function workloadChatReasoningEffort(
  workloadId: string,
  modelId: string,
): { reasoning_effort?: OpenAIReasoningEffort } {
  const effort = resolveWorkloadReasoningEffort(workloadId, modelId);
  return effort ? { reasoning_effort: effort } : {};
}

/** AI SDK `providerOptions` spread for {@link resolveWorkloadReasoningEffort}. */
export function workloadOpenAIProviderOptions(
  workloadId: string,
  modelId: string,
): { providerOptions?: { openai: { reasoningEffort: OpenAIReasoningEffort } } } {
  const reasoningEffort = resolveWorkloadReasoningEffort(workloadId, modelId);
  return reasoningEffort ? { providerOptions: { openai: { reasoningEffort } } } : {};
}
