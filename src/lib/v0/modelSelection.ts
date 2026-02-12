import { modelTiers, type ModelTier } from "@/lib/validations/chatSchemas";

const MODEL_TIER_SET = new Set<ModelTier>(modelTiers);

const CUSTOM_MODEL_FLAG =
  process.env.NODE_ENV !== "production" &&
  process.env.SAJTMASKIN_ENABLE_EXPERIMENTAL_MODEL_ID === "1";

function normalizeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isModelTier(value: string | null | undefined): value is ModelTier {
  return Boolean(value && MODEL_TIER_SET.has(value as ModelTier));
}

export function canUseExperimentalModelId(): boolean {
  return CUSTOM_MODEL_FLAG;
}

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
  const fallbackTier = params.fallbackTier ?? "v0-max";
  const requestedModelId = normalizeValue(params.requestedModelId);
  const requestedTier = normalizeValue(params.requestedModelTier);

  const tierFromModelId = isModelTier(requestedModelId) ? requestedModelId : null;
  const tierFromMeta = isModelTier(requestedTier) ? requestedTier : null;
  const resolvedTier = tierFromModelId ?? tierFromMeta ?? fallbackTier;

  if (!requestedModelId || tierFromModelId) {
    return {
      modelId: resolvedTier,
      modelTier: resolvedTier,
      usingCustomModelId: false,
      customModelIdIgnored: false,
    };
  }

  if (canUseExperimentalModelId()) {
    return {
      modelId: requestedModelId,
      modelTier: resolvedTier,
      usingCustomModelId: true,
      customModelIdIgnored: false,
    };
  }

  return {
    modelId: resolvedTier,
    modelTier: resolvedTier,
    usingCustomModelId: false,
    customModelIdIgnored: true,
  };
}
