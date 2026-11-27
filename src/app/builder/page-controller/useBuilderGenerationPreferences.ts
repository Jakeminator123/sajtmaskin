"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  readChatGenerationSettings,
  resolveBuilderModelTier,
  writeChatGenerationSettings,
  type ChatGenerationSettings,
  type CreatedChatGenerationSettings,
} from "@/lib/builder/chat-generation-settings";
import { DEFAULT_IMAGE_GENERATIONS } from "@/lib/builder/defaults";
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
  serverModelTier?: ModelTier | null;
  createdChatSettingsRef: RefObject<CreatedChatGenerationSettings | null>;
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
  serverModelTier,
  createdChatSettingsRef,
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

  const generationSettingsScope = useRef<{
    chatId: string;
    initialTier: ModelTier;
    awaitingServerTier: boolean;
    applying: ChatGenerationSettings | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (!chatId) {
      generationSettingsScope.current = null;
      return;
    }
    const scope = generationSettingsScope.current;
    if (scope?.chatId !== chatId) {
      const stored = readChatGenerationSettings(chatId);
      const created = createdChatSettingsRef.current?.chatId === chatId
        ? createdChatSettingsRef.current
        : null;
      if (created) createdChatSettingsRef.current = null;
      const initialTier = stored?.modelTier ?? resolveBuilderModelTier(created?.modelTier ?? serverModelTier);
      const imageGenerations = stored?.imageGenerations ?? created?.imageGenerations ?? DEFAULT_IMAGE_GENERATIONS;
      const awaitingServerTier = !stored && !created && serverModelTier === undefined;
      generationSettingsScope.current = {
        chatId,
        initialTier,
        awaitingServerTier,
        applying: initialTier !== selectedModelTier || imageGenerations !== enableImageGenerations
          ? { modelTier: initialTier, imageGenerations }
          : null,
      };
      setSelectedModelTier(initialTier);
      setEnableImageGenerations(imageGenerations);
      if (created && !stored) {
        writeChatGenerationSettings(chatId, { modelTier: initialTier, imageGenerations });
      }
      // These render values still belong to the previous chat. Never save
      // them under the new chat's key, even if the server reply is already here.
      return;
    }

    if (scope.applying) {
      if (selectedModelTier !== scope.applying.modelTier ||
          enableImageGenerations !== scope.applying.imageGenerations) return;
      scope.applying = null;
    }
    if (scope.awaitingServerTier) {
      if (selectedModelTier !== scope.initialTier) {
        // Keep a user selection made while the chat details were loading.
        scope.awaitingServerTier = false;
      } else {
        if (serverModelTier === undefined) return;
        scope.awaitingServerTier = false;
        const restored = resolveBuilderModelTier(serverModelTier);
        if (restored !== selectedModelTier) {
          scope.applying = { modelTier: restored, imageGenerations: enableImageGenerations };
          setSelectedModelTier(restored);
          return;
        }
      }
    }
    writeChatGenerationSettings(chatId, {
      modelTier: selectedModelTier,
      imageGenerations: enableImageGenerations,
    });
  }, [
    chatId, serverModelTier, createdChatSettingsRef, selectedModelTier, enableImageGenerations,
    setSelectedModelTier, setEnableImageGenerations,
  ]);

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

  return useCallback(() => {
    const scope = generationSettingsScope.current;
    return !chatId || (scope?.chatId === chatId && !scope.awaitingServerTier && !scope.applying);
  }, [chatId]);
}
