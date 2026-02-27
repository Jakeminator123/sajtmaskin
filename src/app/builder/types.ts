"use client";

import type { V0UserFileAttachment } from "@/components/media";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { QualityLevel } from "@/lib/v0/v0-generator";

export type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
};

export const MODEL_TIER_TO_QUALITY: Record<ModelTier, QualityLevel> = {
  "v0-mini": "light",
  "v0-pro": "standard",
  "v0-max": "max",
};
