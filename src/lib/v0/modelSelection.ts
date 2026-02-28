import {
  canonicalizeModelId,
  DEFAULT_MODEL_ID,
  type CanonicalModelId,
} from "@/lib/v0/models";

/**
 * Resolve a model selection from request inputs to a canonical model ID.
 *
 * Resolution order:
 * 1. `requestedModelId` — canonicalized if valid, else ignored
 * 2. `requestedModelTier` — canonicalized if valid, else ignored
 * 3. `fallbackTier` — canonicalized, or the global default
 *
 * Unknown/invalid IDs are silently dropped (strict allowlist policy).
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
  return { modelId: resolved, modelTier: resolved };
}
