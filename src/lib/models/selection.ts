import {
  canonicalizeModelId,
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  type CanonicalModelId,
  type OwnModelId,
} from "@/lib/models/catalog";
import { warnLog } from "@/lib/utils/debug";

/**
 * Resolve a request's model selection to the builder's canonical tier.
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
    warnLog("build", "Model fallback occurred", {
      requestedModelId: params.requestedModelId ?? null,
      requestedModelTier: params.requestedModelTier ?? null,
      resolvedTo: resolved,
    });
  }

  return { modelId: resolved, modelTier: resolved };
}

/**
 * Resolve the concrete provider model ID for generation.
 */
export function resolveEngineModelId(
  resolvedTier: CanonicalModelId,
): OwnModelId {
  return canonicalModelIdToOwnModelId(resolvedTier);
}
