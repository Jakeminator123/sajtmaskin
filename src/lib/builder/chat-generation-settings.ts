import {
  DEFAULT_IMAGE_GENERATIONS,
  MODEL_TIER_OPTIONS,
} from "@/lib/builder/defaults";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import { canonicalizeModelId, DEFAULT_MODEL_ID } from "@/lib/models/catalog";

export type ChatGenerationSettings = {
  modelTier: ModelTier;
  imageGenerations: boolean;
};

const CHAT_GENERATION_SETTINGS_PREFIX = "sajtmaskin:chatGenerationSettings:";
const MODEL_TIER_SET = new Set<ModelTier>(MODEL_TIER_OPTIONS.map((option) => option.value));

function buildChatGenerationSettingsKey(chatId: string): string {
  return `${CHAT_GENERATION_SETTINGS_PREFIX}${chatId}`;
}

export function readChatGenerationSettings(chatId: string): ChatGenerationSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(buildChatGenerationSettingsKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatGenerationSettings> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const canonicalModelTier = canonicalizeModelId(parsed.modelTier);
    if (!canonicalModelTier) return null;
    // A chat saved on a tier that is no longer in the slider (codex, anthropic)
    // must open on the default tier. Returning null would keep whatever the
    // slider showed for the previous chat, and the save effect would then
    // persist that onto this chat.
    return {
      modelTier: MODEL_TIER_SET.has(canonicalModelTier as ModelTier)
        ? (canonicalModelTier as ModelTier)
        : (DEFAULT_MODEL_ID as ModelTier),
      imageGenerations:
        typeof parsed.imageGenerations === "boolean"
          ? parsed.imageGenerations
          : DEFAULT_IMAGE_GENERATIONS,
    };
  } catch {
    return null;
  }
}

export function writeChatGenerationSettings(chatId: string, settings: ChatGenerationSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(buildChatGenerationSettingsKey(chatId), JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}
