"use client";

import type { ShadcnBlockSelection } from "@/components/builder/UiElementPicker";
import type { ChatMessage } from "@/lib/builder/types";
import type { PaletteSelection, PaletteState } from "@/lib/builder/palette";
import type { BuildMethod } from "@/lib/builder/build-intent";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import type { DesignTheme, ThemeColors } from "@/lib/builder/theme-presets";
import type { InitBriefOptions } from "@/lib/hooks/prompt-assist-types";
import { buildPaletteInstruction, mergePaletteSelection } from "@/lib/builder/palette";
import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { CreateChatOptions } from "./types";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import { debugLog } from "@/lib/utils/debug";

export type TemplateSwitchDialogState =
  | null
  | { kind: "abort-gen" | "new-chat"; templateId: string };

type Args = {
  chatId: string | null;
  scaffoldMode: ScaffoldMode;
  customInstructions: string;
  applyInstructionsOnce: boolean;
  promptAssistModel: string;
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
  pendingBriefRef: MutableRefObject<Record<string, unknown> | null>;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
  templateInitAttemptKeyRef: MutableRefObject<string | null>;
  router: { replace: (url: string) => void; push: (url: string) => void };
  searchParams: { toString: () => string };
  setChatId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setEntryIntentActive: Dispatch<SetStateAction<boolean>>;
  setIsPreparingPrompt: Dispatch<SetStateAction<boolean>>;
  setCustomInstructions: Dispatch<SetStateAction<string>>;
  setPromptAssistMode: Dispatch<SetStateAction<"polish" | "rewrite" | null>>;
  setDesignTheme: Dispatch<SetStateAction<DesignTheme>>;
  setPaletteState: Dispatch<SetStateAction<PaletteState>>;
  generateDynamicInstructions: (
    message: string,
    options?: InitBriefOptions,
  ) => Promise<string>;
  createNewChat: (message: string, options?: CreateChatOptions, systemOverride?: string) => Promise<void>;
  cancelActiveGeneration: () => void;
  resetBeforeCreateChat: () => void;
  applyAppProjectId: (nextProjectId: string | null, options?: { chatId?: string | null }) => void;
};

export function useBuilderPromptActions({
  chatId,
  scaffoldMode: _scaffoldMode,
  customInstructions,
  applyInstructionsOnce,
  promptAssistModel: _promptAssistModel,
  themeColors: _themeColors,
  paletteState,
  selectedModelTier: _selectedModelTier,
  isCreatingChat,
  isAnyStreaming,
  isTemplateLoading,
  isPreparingPrompt,
  buildMethod: _buildMethod,
  designTheme: _designTheme,
  appProjectId: _appProjectId,
  pendingBriefRef,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
  templateInitAttemptKeyRef,
  router,
  searchParams,
  setChatId,
  setMessages,
  setCurrentPreviewUrl,
  setSelectedVersionId,
  setEntryIntentActive,
  setIsPreparingPrompt,
  setCustomInstructions,
  setPromptAssistMode,
  setDesignTheme: _setDesignTheme,
  setPaletteState,
  generateDynamicInstructions,
  createNewChat,
  cancelActiveGeneration,
  resetBeforeCreateChat: _resetBeforeCreateChat,
  applyAppProjectId: _applyAppProjectId,
}: Args) {
  const [templateSwitchDialog, setTemplateSwitchDialog] = useState<TemplateSwitchDialogState>(null);

  const applyTemplateSwitch = useCallback(
    (templateId: string) => {
      setTemplateSwitchDialog(null);
      pendingBriefRef.current = null;
      setChatId(null);
      setMessages([]);
      setCurrentPreviewUrl(null);
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
      router,
      searchParams,
      setChatId,
      setCurrentPreviewUrl,
      setEntryIntentActive,
      setMessages,
      setSelectedVersionId,
      templateInitAttemptKeyRef,
      pendingBriefRef,
    ],
  );

  const confirmTemplateSwitchDialog = useCallback(() => {
    if (!templateSwitchDialog) return;
    if (templateSwitchDialog.kind === "abort-gen") {
      cancelActiveGeneration();
      const tid = templateSwitchDialog.templateId;
      if (chatId) {
        setTemplateSwitchDialog({ kind: "new-chat", templateId: tid });
      } else {
        applyTemplateSwitch(tid);
      }
      return;
    }
    applyTemplateSwitch(templateSwitchDialog.templateId);
  }, [applyTemplateSwitch, cancelActiveGeneration, chatId, templateSwitchDialog]);

  const cancelTemplateSwitchDialog = useCallback(() => {
    setTemplateSwitchDialog(null);
  }, []);

  const clearPromptAssistMode = useCallback(() => {
    setPromptAssistMode(null);
  }, [setPromptAssistMode]);

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
        pendingBriefRef.current = null;
        await generateDynamicInstructions(trimmed, {
          forceShallow: false,
          forceDeepBrief: true,
          skipAddendum: true,
          onBrief: (brief) => {
            pendingBriefRef.current = brief;
          },
        });

        const baseInstructions = customInstructions.trim();
        const paletteHint = buildPaletteInstruction(paletteState);
        const combined = [baseInstructions, paletteHint]
          .filter(Boolean)
          .join("\n\n");
        if (combined) {
          setCustomInstructions(combined);
        }
        pendingInstructionsRef.current = combined || null;
        pendingInstructionsOnceRef.current = false;
        return combined || null;
      } catch (error) {
        debugLog("builder", "Dynamic instructions failed", error);
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
      const userInstructions = await applyDynamicInstructionsForNewChat(message);
      // Dynamic path sets pendingInstructionsRef synchronously to `combined`; captureInstructionSnapshot
      // would overwrite it with stale `customInstructions` from the previous render (setState is async).
      if (userInstructions == null) {
        captureInstructionSnapshot();
      }
      const systemOverride = userInstructions?.trim() ? userInstructions.trim() : undefined;
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
      return false;
    },
    [],
  );

  const handleStartFromTemplate = useCallback(
    (templateId: string) => {
      if (!templateId) return;
      if (isTemplateLoading || isPreparingPrompt) {
        toast.error("Vänta tills nuvarande process är klar innan du väljer en ny v0-template.");
        return;
      }

      const hasActiveGeneration = isCreatingChat || isAnyStreaming;
      if (hasActiveGeneration) {
        setTemplateSwitchDialog({ kind: "abort-gen", templateId });
        return;
      }

      if (chatId) {
        setTemplateSwitchDialog({ kind: "new-chat", templateId });
        return;
      }

      applyTemplateSwitch(templateId);
    },
    [
      applyTemplateSwitch,
      chatId,
      isAnyStreaming,
      isCreatingChat,
      isPreparingPrompt,
      isTemplateLoading,
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
    templateSwitchDialog,
    confirmTemplateSwitchDialog,
    cancelTemplateSwitchDialog,
    clearPromptAssistMode,
    captureInstructionSnapshot,
    requestCreateChat,
    handleStartFromRegistry,
    handleStartFromTemplate,
    handleGoHome,
    handlePaletteSelection,
  };
}
