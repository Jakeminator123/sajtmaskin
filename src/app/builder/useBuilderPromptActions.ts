"use client";

import type { ShadcnBlockSelection } from "@/components/builder/UiElementPicker";
import type { ChatMessage } from "@/lib/builder/types";
import type { PaletteSelection, PaletteState } from "@/lib/builder/palette";
import type { BuildMethod } from "@/lib/builder/build-intent";
import type { DesignTheme, ThemeColors } from "@/lib/builder/theme-presets";
import { buildPaletteInstruction, mergePaletteSelection } from "@/lib/builder/palette";
import { briefToSpec, promptToSpec } from "@/lib/builder/promptAssistContext";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_PROMPT_POLISH_MODEL,
  SPEC_FILE_INSTRUCTION,
} from "@/lib/builder/defaults";
import { formatPrompt, isGatewayAssistModel } from "@/lib/builder/promptAssist";
import { saveProjectData } from "@/lib/project-client";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import type { CreateChatOptions } from "./types";
import { MODEL_TIER_TO_QUALITY } from "./types";
import type { ModelTier } from "@/lib/validations/chatSchemas";

type Args = {
  chatId: string | null;
  customInstructions: string;
  applyInstructionsOnce: boolean;
  promptAssistDeep: boolean;
  specMode: boolean;
  themeColors: ThemeColors | null;
  paletteState: PaletteState;
  selectedModelTier: ModelTier;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  isTemplateLoading: boolean;
  isPreparingPrompt: boolean;
  buildMethod: BuildMethod | null;
  designTheme: DesignTheme;
  appProjectId: string | null;
  pendingSpecRef: MutableRefObject<object | null>;
  pendingBriefRef: MutableRefObject<Record<string, unknown> | null>;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
  templateInitAttemptKeyRef: MutableRefObject<string | null>;
  router: { replace: (url: string) => void; push: (url: string) => void };
  searchParams: { toString: () => string };
  setChatId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setCurrentDemoUrl: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setEntryIntentActive: Dispatch<SetStateAction<boolean>>;
  setIsPreparingPrompt: Dispatch<SetStateAction<boolean>>;
  setCustomInstructions: Dispatch<SetStateAction<string>>;
  setPromptAssistModel: Dispatch<SetStateAction<string>>;
  setPromptAssistDeep: Dispatch<SetStateAction<boolean>>;
  setDesignTheme: Dispatch<SetStateAction<DesignTheme>>;
  setPaletteState: Dispatch<SetStateAction<PaletteState>>;
  maybeEnhanceInitialPrompt: (
    message: string,
    options?: { forceShallow?: boolean; mode?: "rewrite" | "polish"; modelOverride?: string },
  ) => Promise<string>;
  generateDynamicInstructions: (
    message: string,
    options?: {
      forceShallow?: boolean;
      onBrief?: (brief: Record<string, unknown>) => void;
    },
  ) => Promise<string>;
  createNewChat: (message: string, options?: CreateChatOptions, systemOverride?: string) => Promise<void>;
  cancelActiveGeneration: () => void;
  resetBeforeCreateChat: () => void;
  applyAppProjectId: (nextProjectId: string | null, options?: { chatId?: string | null }) => void;
};

export function useBuilderPromptActions({
  chatId,
  customInstructions,
  applyInstructionsOnce,
  promptAssistDeep,
  specMode,
  themeColors,
  paletteState,
  selectedModelTier,
  isCreatingChat,
  isAnyStreaming,
  isTemplateLoading,
  isPreparingPrompt,
  buildMethod: _buildMethod,
  designTheme: _designTheme,
  appProjectId,
  pendingSpecRef,
  pendingBriefRef,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
  templateInitAttemptKeyRef,
  router,
  searchParams,
  setChatId,
  setMessages,
  setCurrentDemoUrl,
  setSelectedVersionId,
  setEntryIntentActive,
  setIsPreparingPrompt,
  setCustomInstructions,
  setPromptAssistModel,
  setPromptAssistDeep,
  setDesignTheme: _setDesignTheme,
  setPaletteState,
  maybeEnhanceInitialPrompt,
  generateDynamicInstructions,
  createNewChat,
  cancelActiveGeneration,
  resetBeforeCreateChat,
  applyAppProjectId,
}: Args) {
  const handlePromptAssistModelChange = useCallback((model: string) => {
    setPromptAssistModel(model);
    if (!isGatewayAssistModel(model)) {
      setPromptAssistDeep(false);
    }
  }, [setPromptAssistModel, setPromptAssistDeep]);

  const handlePromptEnhance = useCallback(
    async (message: string) => {
      const enhanced = await maybeEnhanceInitialPrompt(message, {
        forceShallow: true,
        mode: "polish",
        modelOverride: DEFAULT_PROMPT_POLISH_MODEL,
      });
      return formatPrompt(enhanced);
    },
    [maybeEnhanceInitialPrompt],
  );

  const captureInstructionSnapshot = useCallback(() => {
    pendingInstructionsRef.current = customInstructions.trim() || null;
    pendingInstructionsOnceRef.current = applyInstructionsOnce;
  }, [customInstructions, applyInstructionsOnce, pendingInstructionsRef, pendingInstructionsOnceRef]);

  const applyDynamicInstructionsForNewChat = useCallback(
    async (message: string): Promise<string | null> => {
      if (chatId) return null;
      const trimmed = message.trim();
      if (!trimmed) return null;
      setIsPreparingPrompt(true);
      try {
        const addendum = await generateDynamicInstructions(trimmed, {
          forceShallow: !promptAssistDeep,
          onBrief: (brief) => {
            pendingBriefRef.current = brief;
            if (specMode) {
              pendingSpecRef.current = briefToSpec(brief, trimmed, themeColors, paletteState);
            }
          },
        });
        if (specMode && !pendingSpecRef.current) {
          pendingSpecRef.current = promptToSpec(trimmed, themeColors, paletteState);
        }

        const baseInstructions =
          customInstructions.trim() &&
          customInstructions.trim() !== DEFAULT_CUSTOM_INSTRUCTIONS.trim()
            ? customInstructions.trim()
            : DEFAULT_CUSTOM_INSTRUCTIONS.trim();
        const specSuffix = pendingSpecRef.current ? SPEC_FILE_INSTRUCTION : "";
        const paletteHint = buildPaletteInstruction(paletteState);
        const paletteSuffix = paletteHint ? `\n\n${paletteHint}` : "";
        const combined = addendum.trim()
          ? `${baseInstructions}\n\n${addendum}${paletteSuffix}${specSuffix}`.trim()
          : `${baseInstructions}${paletteSuffix}${specSuffix}`.trim();
        setCustomInstructions(combined);
        pendingInstructionsRef.current = combined;
        pendingInstructionsOnceRef.current = false;
        return combined;
      } catch (error) {
        console.warn("[Builder] Dynamic instructions failed:", error);
        return null;
      } finally {
        setIsPreparingPrompt(false);
      }
    },
    [
      chatId,
      customInstructions,
      generateDynamicInstructions,
      paletteState,
      promptAssistDeep,
      specMode,
      themeColors,
      pendingSpecRef,
      pendingBriefRef,
      pendingInstructionsRef,
      pendingInstructionsOnceRef,
      setIsPreparingPrompt,
      setCustomInstructions,
    ],
  );

  const requestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      setEntryIntentActive(false);
      const dynamicInstructions = await applyDynamicInstructionsForNewChat(message);
      captureInstructionSnapshot();
      const systemOverride = dynamicInstructions?.trim() ? dynamicInstructions.trim() : undefined;
      await createNewChat(message, options, systemOverride);
      return true;
    },
    [createNewChat, captureInstructionSnapshot, applyDynamicInstructionsForNewChat, setEntryIntentActive],
  );

  const handleStartFromRegistry = useCallback(
    async (selection: ShadcnBlockSelection) => {
      if (!selection.registryUrl) {
        toast.error("Registry-URL saknas");
        return false;
      }

      try {
        resetBeforeCreateChat();
        const quality = MODEL_TIER_TO_QUALITY[selectedModelTier] || "max";
        const name = selection.block?.title ? `shadcn/ui: ${selection.block.title}` : undefined;
        const response = await fetch("/api/v0/chats/init-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registryUrl: selection.registryUrl, quality, name }),
        });

        const data = (await response.json().catch(() => null)) as {
          chatId?: string;
          projectId?: string | null;
          project_id?: string | null;
          demoUrl?: string | null;
          error?: string;
          details?: string;
        } | null;

        if (!response.ok || !data?.chatId) {
          throw new Error(data?.error || data?.details || "Kunde inte starta från UI-element");
        }

        setChatId(data.chatId);
        if (appProjectId) {
          applyAppProjectId(appProjectId, { chatId: data.chatId });
        } else {
          const params = new URLSearchParams(searchParams.toString());
          params.set("chatId", data.chatId);
          router.replace(`/builder?${params.toString()}`);
        }
        setMessages([]);
        setCurrentDemoUrl(data.demoUrl || null);
        if (appProjectId) {
          saveProjectData(appProjectId, {
            chatId: data.chatId,
            demoUrl: data.demoUrl ?? undefined,
          }).catch((error) => {
            console.warn("[Builder] Failed to save registry project mapping:", error);
          });
        }
        toast.success("Projekt skapat från block!");
        return true;
      } catch (error) {
        console.warn("[Builder] Could not start directly from registry:", error);
        return false;
      }
    },
    [
      resetBeforeCreateChat,
      selectedModelTier,
      router,
      setChatId,
      setMessages,
      setCurrentDemoUrl,
      appProjectId,
      applyAppProjectId,
      searchParams,
    ],
  );

  const handleStartFromTemplate = useCallback(
    (templateId: string) => {
      if (!templateId) return;
      if (isTemplateLoading || isPreparingPrompt) {
        toast.error("Vänta tills nuvarande mall/process är klar innan du väljer en ny mall.");
        return;
      }

      const hasActiveGeneration = isCreatingChat || isAnyStreaming;
      if (hasActiveGeneration) {
        const shouldAbort = window.confirm(
          "Generering pågår just nu. Vill du avbryta och starta från mallen istället?",
        );
        if (!shouldAbort) return;
        cancelActiveGeneration();
      }

      if (chatId) {
        const shouldStartFresh = window.confirm(
          "Du har redan en aktiv chat. Vill du starta en ny chat från vald mall?",
        );
        if (!shouldStartFresh) return;
      }

      setChatId(null);
      setMessages([]);
      setCurrentDemoUrl(null);
      setSelectedVersionId(null);
      setEntryIntentActive(false);
      templateInitAttemptKeyRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("chatId");
      params.delete("prompt");
      params.delete("promptId");
      params.delete("source");
      params.set("templateId", templateId);
      router.replace(`/builder?${params.toString()}`);
    },
    [
      chatId,
      isAnyStreaming,
      isCreatingChat,
      isPreparingPrompt,
      isTemplateLoading,
      cancelActiveGeneration,
      router,
      searchParams,
      setChatId,
      setMessages,
      setCurrentDemoUrl,
      setSelectedVersionId,
      setEntryIntentActive,
      templateInitAttemptKeyRef,
    ],
  );

  const handleGoHome = useCallback(() => {
    const hasActiveGeneration = isCreatingChat || isAnyStreaming || isTemplateLoading || isPreparingPrompt;
    if (hasActiveGeneration) {
      cancelActiveGeneration();
      toast("Generering avbruten. Går till startsidan.");
    }
    router.push("/");
  }, [
    isAnyStreaming,
    isCreatingChat,
    isPreparingPrompt,
    isTemplateLoading,
    cancelActiveGeneration,
    router,
  ]);

  const handlePaletteSelection = useCallback((selection: PaletteSelection) => {
    setPaletteState((prev) => mergePaletteSelection(prev, selection));
  }, [setPaletteState]);

  return {
    handlePromptAssistModelChange,
    handlePromptEnhance,
    captureInstructionSnapshot,
    requestCreateChat,
    handleStartFromRegistry,
    handleStartFromTemplate,
    handleGoHome,
    handlePaletteSelection,
  };
}
