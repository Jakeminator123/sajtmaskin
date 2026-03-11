"use client";

import type { V0UserFileAttachment } from "@/components/media";
import { QUALITY_TO_MODEL, type CanonicalModelId, type QualityLevel } from "@/lib/v0/models";

export type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  planMode?: boolean;
};

const _inverted = Object.entries(QUALITY_TO_MODEL).reduce(
  (acc, [quality, modelId]) => {
    if (!acc[modelId]) acc[modelId] = quality as QualityLevel;
    return acc;
  },
  {} as Partial<Record<CanonicalModelId, QualityLevel>>,
);

export const MODEL_TIER_TO_QUALITY: Partial<Record<string, QualityLevel>> = {
  ..._inverted,
  "v0-max-fast": "max",
  "v0-gpt-5": "max",
  "v0-1.5-lg": "max",
};
