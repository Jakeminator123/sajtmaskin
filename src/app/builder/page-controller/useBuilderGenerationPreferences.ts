"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import {
  readChatGenerationSettings,
  writeChatGenerationSettings,
} from "@/lib/builder/chat-generation-settings";
import { normalizeDesignTheme, type DesignTheme } from "@/lib/builder/theme-presets";
import { useLocalStorageBooleanSync } from "@/lib/hooks/useLocalStorageSync";
import type { ModelTier } from "@/lib/validations/chat-schemas";

type Params = {
  chatId: string | null;
  enableThinking: boolean;
  setEnableThinking: Dispatch<SetStateAction<boolean>>;
  selectedModelTier: ModelTier;
  setSelectedModelTier: Dispatch<SetStateAction<ModelTier>>;
  enableImageGenerations: boolean;
  setEnableImageGenerations: Dispatch<SetStateAction<boolean>>;
  enableBlobMedia: boolean;
  setEnableBlobMedia: Dispatch<SetStateAction<boolean>>;
  designTheme: DesignTheme;
  setDesignTheme: Dispatch<SetStateAction<DesignTheme>>;
  applyingGenerationSettingsRef: MutableRefObject<boolean>;
  loadedGenerationSettingsChatRef: MutableRefObject<string | null>;
};

/**
 * Generation preferences that live in localStorage: thinking, blob media,
 * design theme and the per-chat model tier / image-generation settings.
 */
export function useBuilderGenerationPreferences({
  chatId,
  enableThinking,
  setEnableThinking,
  selectedModelTier,
  setSelectedModelTier,
  enableImageGenerations,
  setEnableImageGenerations,
  enableBlobMedia,
  setEnableBlobMedia,
  designTheme,
  setDesignTheme,
  applyingGenerationSettingsRef,
  loadedGenerationSettingsChatRef,
}: Params) {
  // Legacy localStorage cleanup
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("sajtmaskin:aiImages");
      localStorage.removeItem("sajtmaskin:customModelId");
    } catch {
      /* ignore */
    }
  }, []);

  useLocalStorageBooleanSync("sajtmaskin:thinking", enableThinking, setEnableThinking);

  // Generation settings: load from localStorage when chatId changes
  useEffect(() => {
    if (!chatId) {
      loadedGenerationSettingsChatRef.current = null;
      return;
    }
    if (loadedGenerationSettingsChatRef.current === chatId) return;
    const stored = readChatGenerationSettings(chatId);
    applyingGenerationSettingsRef.current = true;
    if (stored) {
      setSelectedModelTier(stored.modelTier);
      setEnableImageGenerations(Boolean(stored.imageGenerations));
    }
    loadedGenerationSettingsChatRef.current = chatId;
    applyingGenerationSettingsRef.current = false;
  }, [chatId, loadedGenerationSettingsChatRef, applyingGenerationSettingsRef, setSelectedModelTier, setEnableImageGenerations]);

  // Generation settings: save to localStorage when user changes values
  useEffect(() => {
    if (!chatId) return;
    if (applyingGenerationSettingsRef.current) return;
    writeChatGenerationSettings(chatId, {
      modelTier: selectedModelTier,
      imageGenerations: enableImageGenerations,
    });
  }, [chatId, selectedModelTier, enableImageGenerations, applyingGenerationSettingsRef]);

  useLocalStorageBooleanSync("sajtmaskin:blobImages", enableBlobMedia, setEnableBlobMedia);

  // Design theme: load once on mount, migrate legacy "blue" value
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:designTheme");
      if (!stored) return;
      const normalized = stored === "blue" ? "off" : normalizeDesignTheme(stored);
      setDesignTheme(normalized);
      if (stored !== normalized) {
        localStorage.setItem("sajtmaskin:designTheme", normalized);
      }
    } catch {
      /* ignore */
    }
  }, [setDesignTheme]);

  // Design theme: persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:designTheme", designTheme);
    } catch {
      /* ignore */
    }
  }, [designTheme]);
}
