import type { ModelTier } from "@/lib/validations/chatSchemas";

const FORCED_MODEL_TIER: ModelTier = "v0-max";

export function resolveModelSelection(params: {
  requestedModelId?: string | null;
  requestedModelTier?: string | null;
  fallbackTier?: ModelTier;
}): {
  modelId: string;
  modelTier: ModelTier;
  usingCustomModelId: boolean;
  customModelIdIgnored: boolean;
} {
  const requestedModelId = (params.requestedModelId || "").trim();
  const requestedModelTier = (params.requestedModelTier || "").trim();
  const customModelIdIgnored = Boolean(
    requestedModelId && requestedModelId !== FORCED_MODEL_TIER,
  );
  const nonMaxTierRequested = Boolean(
    requestedModelTier && requestedModelTier !== FORCED_MODEL_TIER,
  );
  return {
    modelId: FORCED_MODEL_TIER,
    modelTier: FORCED_MODEL_TIER,
    usingCustomModelId: false,
    customModelIdIgnored: customModelIdIgnored || nonMaxTierRequested,
  };
}
