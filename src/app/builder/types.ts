"use client";

import type { V0UserFileAttachment } from "@/components/media/file-upload-zone";
import { QUALITY_TO_MODEL, type CanonicalModelId, type QualityLevel } from "@/lib/models/catalog";

export type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  planMode?: boolean;
  /**
   * Additional metadata merged into the request body's `meta` object.
   * Special case: `meta.brief` is deep-merged on top of any server-generated
   * Deep Brief so wizard-derived structured fields (primaryCallToAction,
   * industry, mustHave, pages, visualDirection, etc.) win over LLM extraction.
   */
  meta?: Record<string, unknown>;
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
  fast: "max",
  codex: "max",
  max: "max",
  anthropic: "max",
  "v0-max-fast": "max",
  "v0-gpt-5": "max",
  "v0-1.5-lg": "max",
};
