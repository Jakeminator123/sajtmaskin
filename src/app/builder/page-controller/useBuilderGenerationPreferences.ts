"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import {
  readChatGenerationSettings,
  writeChatGenerationSettings,
} from "@/lib/builder/chat-generation-settings";
import {
  DEFAULT_DESIGN_THEME,
  normalizeDesignTheme,
  type DesignTheme,
} from "@/lib/builder/theme-presets";
import { consumeFirstBuildFromWelcome } from "@/lib/builder/welcome-composer-bridge";
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

/** Legacy global key. Read never again; removed on mount. */
const LEGACY_DESIGN_THEME_KEY = "sajtmaskin:designTheme";
/**
 * Welcome-state draft of "Sidans utseende" for this tab. Session-scoped so it
 * survives a login redirect (the composer draft does too) but never reaches a
 * different project or a later visit.
 */
export const WELCOME_DESIGN_THEME_KEY = "sajtmaskin:welcomeDesignTheme";

/**
 * Generation preferences: thinking and blob media (localStorage), the per-chat
 * model tier / image-generation settings, and the design theme's lifetime.
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

  // Design theme ("Sidans utseende") belongs to the site it was chosen for.
  //
  // It used to persist globally in localStorage and was restored on every page
  // load, also when opening an existing project. `themeColors` ride along on
  // every follow-up and lock primary/secondary/accent, so after a reload one
  // project's palette was silently locked onto another project's edits — with
  // no visible control showing it (the palette only exists in the welcome
  // state). The legacy migration also turned a saved "Havsblå" (`blue`) into
  // Auto on the next load.
  //
  // Now: the welcome state remembers its draft for this tab only; a chat opened
  // from a URL (`?chatId=` at mount, or `?project=` hydrated later) starts at
  // Auto (its colors already live in its own globals.css); a chat created here
  // keeps the choice it was built with; switching from one chat to another
  // clears it. "Ny chatt" resets it in useBuilderProjectActions.
  const initialChatIdRef = useRef(chatId);
  // Set while a restored welcome draft has not reached state yet, so the
  // persist effect below does not overwrite it with the initial Auto.
  const pendingWelcomeThemeRef = useRef<DesignTheme | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(LEGACY_DESIGN_THEME_KEY);
      if (initialChatIdRef.current) return;
      const stored = sessionStorage.getItem(WELCOME_DESIGN_THEME_KEY);
      const restored = stored ? normalizeDesignTheme(stored) : DEFAULT_DESIGN_THEME;
      if (restored === DEFAULT_DESIGN_THEME) return;
      pendingWelcomeThemeRef.current = restored;
      setDesignTheme(restored);
    } catch {
      /* ignore */
    }
  }, [setDesignTheme]);

  const themeChatIdRef = useRef(chatId);
  useEffect(() => {
    const previous = themeChatIdRef.current;
    themeChatIdRef.current = chatId;
    if (!chatId || previous === chatId) return;
    // An empty start that gets a chat id is either a chat CREATED here or an
    // existing project HYDRATED via `?project=` (the chat id arrives after
    // `/api/projects/:id/chat`). Only the first keeps the welcome choice: it is
    // what the create request was sent with. The welcome surface marks a build
    // that starts before any chat exists (R-1743 P2).
    const createdHere = !previous && consumeFirstBuildFromWelcome();
    if (!createdHere) {
      // Another or an existing project: its colors are already in its own files.
      setDesignTheme(DEFAULT_DESIGN_THEME);
      return;
    }
    // Created from the welcome state: the draft is consumed, like Byggval.
    try {
      sessionStorage.removeItem(WELCOME_DESIGN_THEME_KEY);
    } catch {
      /* ignore */
    }
  }, [chatId, setDesignTheme]);

  useEffect(() => {
    if (typeof window === "undefined" || chatId) return;
    if (pendingWelcomeThemeRef.current !== null && designTheme === DEFAULT_DESIGN_THEME) return;
    pendingWelcomeThemeRef.current = null;
    try {
      sessionStorage.setItem(WELCOME_DESIGN_THEME_KEY, designTheme);
    } catch {
      /* ignore */
    }
  }, [chatId, designTheme]);
}
