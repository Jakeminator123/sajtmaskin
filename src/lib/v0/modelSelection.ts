/**
 * Model selection logic — resolves a user's tier choice to a concrete model ID.
 *
 * This file lives in `v0/` for historical reasons but serves both engines.
 * `resolveEngineModelId()` returns an OpenAI model ID (e.g. "gpt-5.3-codex")
 * when the own engine is active, or a v0 tier ID when v0 fallback is on.
 */
import {
  canonicalizeModelId,
  canonicalModelIdToV0ModelId,
  DEFAULT_MODEL_ID,
  v0TierToOpenAIModel,
  type CanonicalModelId,
  type OwnModelId,
  type V0ModelId,
} from "@/lib/v0/models";
import { warnLog } from "@/lib/utils/debug";

/**
 * Resolve a model selection from request inputs to a canonical internal model ID.
 *
 * Resolution order:
 * 1. `requestedModelId` — canonicalized if valid, else ignored
 * 2. `requestedModelTier` — canonicalized if valid, else ignored
 * 3. `fallbackTier` — canonicalized, or the global default
 *
 * Unknown/invalid IDs are logged when a fallback occurs.
 *
 * Use resolveEngineModelId() to get the actual model string for generation
 * (v0 ID when fallback, OpenAI ID when using own engine).
 */
export function resolveModelSelection(params: {
  requestedModelId?: string | null;
  requestedModelTier?: string | null;
  fallbackTier?: CanonicalModelId;
}): {
  modelId: CanonicalModelId;
  modelTier: CanonicalModelId;
} {
  const fromId = canonicalizeModelId(params.requestedModelId);
  if (fromId) return { modelId: fromId, modelTier: fromId };

  const fromTier = canonicalizeModelId(params.requestedModelTier);
  if (fromTier) return { modelId: fromTier, modelTier: fromTier };

  const fallback = params.fallbackTier ?? DEFAULT_MODEL_ID;
  const resolved = canonicalizeModelId(fallback) ?? DEFAULT_MODEL_ID;

  if (params.requestedModelId || params.requestedModelTier) {
    warnLog("v0", "Model fallback occurred", {
      requestedModelId: params.requestedModelId ?? null,
      requestedModelTier: params.requestedModelTier ?? null,
      resolvedTo: resolved,
    });
  }

  return { modelId: resolved, modelTier: resolved };
}

/**
 * Resolve the engine model ID for code generation.
 *
 * - When useV0Fallback: returns the translated v0 model ID (for v0 Platform API).
 * - When not fallback: maps the internal profile to the corresponding OpenAI model
 *   (e.g. fast -> gpt-4.1, pro -> gpt-5.3-codex,
 *   max -> gpt-5.4, codex -> gpt-5.1-codex-max).
 *
 * Requires OPENAI_API_KEY when useV0Fallback is false.
 * Requires V0_API_KEY when useV0Fallback is true.
 */
export function resolveEngineModelId(
  resolvedTier: CanonicalModelId,
  useV0Fallback: boolean,
): V0ModelId | OwnModelId {
  if (useV0Fallback) return canonicalModelIdToV0ModelId(resolvedTier);
  return v0TierToOpenAIModel(resolvedTier);
}
