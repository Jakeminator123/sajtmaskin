"use client";

import { buildPromptAssistContext } from "@/lib/builder/promptAssistContext";
import {
  normalizeBuildIntent,
  normalizeBuildMethod,
} from "@/lib/builder/build-intent";
import { normalizeDesignTheme } from "@/lib/builder/theme-presets";
import {
  getDefaultPaletteState,
  normalizePaletteState,
} from "@/lib/builder/palette";
import {
  readChatGenerationSettings,
  writeChatGenerationSettings,
} from "@/lib/builder/chat-generation-settings";
import { getProject, saveProjectData } from "@/lib/project-client";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptAssist } from "@/lib/hooks/usePromptAssist";
import { useV0ChatMessaging } from "@/lib/hooks/useV0ChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useAuth } from "@/lib/auth/auth-store";
import { debugLog } from "@/lib/utils/debug";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";

import { useBuilderCallbacks } from "./useBuilderCallbacks";
import { useBuilderDeployActions } from "./useBuilderDeployActions";
import { useBuilderDerivedState, type ChatData } from "./useBuilderDerivedState";
import { useBuilderEffects } from "./useBuilderEffects";
import { useBuilderProjectActions } from "./useBuilderProjectActions";
import { useBuilderPromptActions } from "./useBuilderPromptActions";
import { useBuilderState } from "./useBuilderState";

export function useBuilderPageController() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startUiTransition] = useTransition();
  const { fetchUser, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [authModalReason, setAuthModalReason] = useState<"builder" | "save" | null>(null);

  const state = useBuilderState(searchParams);

  // ── External data hooks ──────────────────────────────────────────────
  const { chat, mutate: mutateChat, isError: isChatError } = useChat(state.chatId);

  const isAnyStreamingEarly = useMemo(
    () => state.messages.some((m) => Boolean(m.isStreaming)),
    [state.messages],
  );

  const { versions, mutate: mutateVersions } = useVersions(state.chatId, {
    isGenerating: isAnyStreamingEarly,
    pauseWhileGenerating: true,
  });

  // ── Derived / memoized state ─────────────────────────────────────────
  const derived = useBuilderDerivedState({
    chatId: state.chatId,
    messages: state.messages,
    selectedVersionId: state.selectedVersionId,
    chat: chat as ChatData,
    versions,
    templateId: state.templateId,
    resolvedPrompt: state.resolvedPrompt,
    auditPromptLoaded: state.auditPromptLoaded,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
  });

  // ── CSS validation ───────────────────────────────────────────────────
  const { validateAndFix: validateCss } = useCssValidation({ autoFix: true, showToasts: true });

  // ── Project actions ──────────────────────────────────────────────────
  const projectActions = useBuilderProjectActions({
    chatId: state.chatId,
    chatIdParam: state.chatIdParam,
    projectParam: state.projectParam,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,
    pendingProjectName: state.pendingProjectName,
    isAuthenticated,
    isSavingProject: state.isSavingProject,
    messages: state.messages,
    resolvedPrompt: state.resolvedPrompt,
    currentDemoUrl: state.currentDemoUrl,
    activeVersionId: derived.activeVersionId,
    mediaEnabled: derived.mediaEnabled,
    paletteState: state.paletteState,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    hasLoadedInstructions: state.hasLoadedInstructions,
    hasLoadedInstructionsOnce: state.hasLoadedInstructionsOnce,
    router,
    searchParams,
    startUiTransition,
    setChatId: state.setChatId,
    setAppProjectId: state.setAppProjectId,
    setAppProjectName: state.setAppProjectName,
    setPendingProjectName: state.setPendingProjectName,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setPreviewRefreshToken: state.setPreviewRefreshToken,
    setMessages: state.setMessages,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setIsSandboxModalOpen: state.setIsSandboxModalOpen,
    setIsSavingProject: state.setIsSavingProject,
    setSelectedModelTier: state.setSelectedModelTier,
    setEnableImageGenerations: state.setEnableImageGenerations,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setV0ProjectId: state.setV0ProjectId,
    setIsIntentionalReset: state.setIsIntentionalReset,
    setAuthModalReason,
  });

  // ── Deploy actions ───────────────────────────────────────────────────
  const deployActions = useBuilderDeployActions({
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    isDeploying: state.isDeploying,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    domainQuery: state.domainQuery,
    deployNameInput: state.deployNameInput,
    isDeployNameSaving: state.isDeployNameSaving,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,
    applyInstructionsOnce: state.applyInstructionsOnce,
    pendingSpecRef: state.pendingSpecRef,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    setIsDeploying: state.setIsDeploying,
    setDomainResults: state.setDomainResults,
    setIsDomainSearching: state.setIsDomainSearching,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameError: state.setDeployNameError,
    setDeployNameInput: state.setDeployNameInput,
    setIsDeployNameSaving: state.setIsDeployNameSaving,
    setPendingProjectName: state.setPendingProjectName,
    setAppProjectName: state.setAppProjectName,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    resolveSuggestedProjectName: projectActions.resolveSuggestedProjectName,
    mutateChat,
    mutateVersions,
    validateCss,
  });

  // ── V0 Chat messaging ───────────────────────────────────────────────
  const resetBeforeCreateChat = useCallback(() => {
    state.setCurrentDemoUrl(null);
    state.setPreviewRefreshToken(0);
  }, [state.setCurrentDemoUrl, state.setPreviewRefreshToken]);

  const bumpPreviewRefreshToken = useCallback(() => {
    state.setPreviewRefreshToken(Date.now());
  }, [state.setPreviewRefreshToken]);

  const { isCreatingChat, createNewChat, sendMessage, cancelActiveGeneration } =
    useV0ChatMessaging({
      chatId: state.chatId,
      setChatId: state.setChatId,
      chatIdParam: state.chatIdParam,
      router,
      appProjectId: state.appProjectId,
      v0ProjectId: state.v0ProjectId,
      selectedModelTier: state.selectedModelTier,
      enableImageGenerations: state.enableImageGenerations,
      enableImageMaterialization: derived.mediaEnabled,
      enableThinking: state.effectiveThinking,
      systemPrompt: state.customInstructions,
      promptAssistModel: state.promptAssistModel,
      promptAssistDeep: state.promptAssistDeep,
      buildIntent: state.resolvedBuildIntent,
      buildMethod: state.buildMethod,
      mutateVersions,
      setCurrentDemoUrl: state.setCurrentDemoUrl,
      onPreviewRefresh: bumpPreviewRefreshToken,
      onGenerationComplete: deployActions.handleGenerationComplete,
      onV0ProjectId: (nextId) => state.setV0ProjectId(nextId),
      setMessages: state.setMessages,
      resetBeforeCreateChat,
    });

  // ── Prompt assist ────────────────────────────────────────────────────
  const { maybeEnhanceInitialPrompt, generateDynamicInstructions } = usePromptAssist({
    model: state.promptAssistModel,
    deep: state.promptAssistDeep,
    imageGenerations: state.enableImageGenerations,
    codeContext: state.promptAssistContext,
    buildIntent: state.resolvedBuildIntent,
    themeColors: state.themeColors,
  });

  // ── Prompt actions ───────────────────────────────────────────────────
  const promptActions = useBuilderPromptActions({
    chatId: state.chatId,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    promptAssistDeep: state.promptAssistDeep,
    specMode: state.specMode,
    themeColors: state.themeColors,
    paletteState: state.paletteState,
    selectedModelTier: state.selectedModelTier,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    isTemplateLoading: state.isTemplateLoading,
    isPreparingPrompt: state.isPreparingPrompt,
    buildMethod: state.buildMethod,
    designTheme: state.designTheme,
    appProjectId: state.appProjectId,
    pendingSpecRef: state.pendingSpecRef,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
    router,
    searchParams,
    setChatId: state.setChatId,
    setMessages: state.setMessages,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setEntryIntentActive: state.setEntryIntentActive,
    setIsPreparingPrompt: state.setIsPreparingPrompt,
    setCustomInstructions: state.setCustomInstructions,
    setPromptAssistModel: state.setPromptAssistModel,
    setPromptAssistDeep: state.setPromptAssistDeep,
    setDesignTheme: state.setDesignTheme,
    setPaletteState: state.setPaletteState,
    maybeEnhanceInitialPrompt,
    generateDynamicInstructions,
    createNewChat,
    cancelActiveGeneration,
    resetBeforeCreateChat,
    applyAppProjectId: projectActions.applyAppProjectId,
  });

  // ── Preview / version callbacks ──────────────────────────────────────
  const builderCallbacks = useBuilderCallbacks({
    chatId: state.chatId,
    currentDemoUrl: state.currentDemoUrl,
    sendMessage,
    effectiveVersionsList: derived.effectiveVersionsList,
    bumpPreviewRefreshToken,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setInspectorSelection: state.setInspectorSelection,
    setInspectorClearToken: state.setInspectorClearToken,
    setIsVersionPanelCollapsed: state.setIsVersionPanelCollapsed,
  });

  // ── Persisted messages ───────────────────────────────────────────────
  usePersistedChatMessages({
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    messages: state.messages,
    setMessages: state.setMessages,
  });

  // ── Template init effects ────────────────────────────────────────────
  useBuilderEffects({
    auditPromptLoaded: state.auditPromptLoaded,
    templateId: state.templateId,
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    selectedModelTier: state.selectedModelTier,
    appProjectId: state.appProjectId,
    applyAppProjectId: projectActions.applyAppProjectId,
    searchParams,
    router,
    setChatId: state.setChatId,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setIsTemplateLoading: state.setIsTemplateLoading,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
  });

  // ── Auto-generate ref for kostnadsfri flow ───────────────────────────
  const autoGenerateTriggeredRef = useRef(false);

  // =====================================================================
  // EFFECTS — cross-cutting concerns, localStorage sync, URL sync
  // =====================================================================

  // Prompt fetch
  useEffect(() => {
    const { promptId } = state;
    if (!promptId) return;
    if (state.promptFetchDoneRef.current === promptId) return;
    if (state.promptFetchInFlightRef.current === promptId) return;
    state.promptFetchInFlightRef.current = promptId;
    let isActive = true;
    const controller = new AbortController();

    const fetchPrompt = async () => {
      let shouldClearPromptId = false;
      try {
        const response = await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          prompt?: string;
          error?: string;
          projectId?: string | null;
        } | null;
        if (!response.ok || !data?.prompt) {
          throw new Error(data?.error || "Prompten hittades inte");
        }
        if (!isActive) return;
        state.promptFetchDoneRef.current = promptId;
        state.setEntryIntentActive(true);
        state.setResolvedPrompt(data.prompt);
        if (data.projectId) {
          state.setAppProjectId((prev) => prev ?? data.projectId!);
        }
        shouldClearPromptId = true;
      } catch (error) {
        if (!isActive) return;
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[Builder] Prompt handoff missing:", error);
        toast.error("Prompten hittades inte eller har redan använts.");
        state.setResolvedPrompt(null);
        state.setEntryIntentActive(false);
        state.promptFetchDoneRef.current = promptId;
        shouldClearPromptId = true;
      } finally {
        if (state.promptFetchInFlightRef.current === promptId) {
          state.promptFetchInFlightRef.current = null;
        }
        if (isActive) {
          state.setAuditPromptLoaded(true);
          if (shouldClearPromptId) {
            const nextParams = new URLSearchParams(searchParams.toString());
            nextParams.delete("promptId");
            const query = nextParams.toString();
            router.replace(query ? `/builder?${query}` : "/builder");
          }
        }
      }
    };

    void fetchPrompt();
    return () => {
      isActive = false;
      controller.abort();
      if (state.promptFetchInFlightRef.current === promptId) {
        state.promptFetchInFlightRef.current = null;
      }
    };
  }, [state.promptId, router, searchParams]);

  // Auth fetch
  useEffect(() => {
    fetchUser().catch(() => {});
  }, [fetchUser]);

  // Build intent / method sync
  useEffect(() => {
    state.setBuildIntent(normalizeBuildIntent(state.buildIntentParam));
  }, [state.buildIntentParam]);

  useEffect(() => {
    const normalized = normalizeBuildMethod(state.buildMethodParam);
    if (normalized) {
      state.setBuildMethod(normalized);
      return;
    }
    if (state.source === "audit") {
      state.setBuildMethod("audit");
      return;
    }
    state.setBuildMethod(null);
  }, [state.buildMethodParam, state.source]);

  // Auth modal
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setAuthModalReason((prev) => prev ?? "builder");
      return;
    }
    setAuthModalReason(null);
  }, [isAuthLoading, isAuthenticated]);

  // Project param -> appProjectId
  useEffect(() => {
    if (state.projectParam) {
      state.setAppProjectId(state.projectParam);
    }
  }, [state.projectParam]);

  // Load latest chat for project when project is in URL but chatId is not
  useEffect(() => {
    if (!state.projectParam || state.chatIdParam || state.chatId) return;
    let isActive = true;
    const controller = new AbortController();

    const loadProjectChat = async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(state.projectParam!)}/chat`,
          { signal: controller.signal },
        );
        if (!res.ok || !isActive) return;
        const data = (await res.json()) as {
          chatId?: string | null;
          v0ChatId?: string | null;
          internalChatId?: string | null;
        };
        const v0ChatId =
          typeof data.v0ChatId === "string" && data.v0ChatId.trim().length > 0
            ? data.v0ChatId
            : null;

        if (v0ChatId && isActive) {
          state.setChatId(v0ChatId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", state.projectParam!);
          params.set("chatId", v0ChatId);
          router.replace(`/builder?${params.toString()}`);
          return;
        }

        if (data.internalChatId && isActive) {
          console.warn(
            "[Builder] Skipped project chat restore because v0ChatId was missing",
            data.internalChatId,
          );
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[Builder] Failed to load project chat:", error);
      }
    };

    void loadProjectChat();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [state.projectParam, state.chatIdParam, state.chatId, router, searchParams]);

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

  // Thinking localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:thinking");
      if (stored !== null) state.setEnableThinking(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:thinking", String(state.enableThinking));
    } catch {
      /* ignore */
    }
  }, [state.enableThinking]);

  // Generation settings per-chat load/save
  useEffect(() => {
    if (!state.chatId) {
      state.loadedGenerationSettingsChatRef.current = null;
      return;
    }
    if (state.loadedGenerationSettingsChatRef.current === state.chatId) return;
    const stored = readChatGenerationSettings(state.chatId);
    state.applyingGenerationSettingsRef.current = true;
    if (stored) {
      state.setSelectedModelTier(stored.modelTier);
      state.setEnableImageGenerations(Boolean(stored.imageGenerations));
    } else {
      writeChatGenerationSettings(state.chatId, {
        modelTier: state.selectedModelTier,
        imageGenerations: state.enableImageGenerations,
      });
    }
    state.loadedGenerationSettingsChatRef.current = state.chatId;
    state.applyingGenerationSettingsRef.current = false;
  }, [
    state.chatId,
    state.selectedModelTier,
    state.enableImageGenerations,
  ]);

  useEffect(() => {
    if (!state.chatId) return;
    if (state.applyingGenerationSettingsRef.current) return;
    if (state.loadedGenerationSettingsChatRef.current !== state.chatId) return;
    writeChatGenerationSettings(state.chatId, {
      modelTier: state.selectedModelTier,
      imageGenerations: state.enableImageGenerations,
    });
  }, [
    state.chatId,
    state.selectedModelTier,
    state.enableImageGenerations,
  ]);

  // Blob media localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:blobImages");
      if (stored !== null) state.setEnableBlobMedia(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:blobImages", String(state.enableBlobMedia));
    } catch {
      /* ignore */
    }
  }, [state.enableBlobMedia]);

  // Design theme localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:designTheme");
      if (stored) state.setDesignTheme(normalizeDesignTheme(stored));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:designTheme", state.designTheme);
    } catch {
      /* ignore */
    }
  }, [state.designTheme]);

  // AppProjectId localStorage persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.appProjectId) return;
    try {
      localStorage.setItem("sajtmaskin:lastProjectId", state.appProjectId);
    } catch {
      /* ignore */
    }
  }, [state.appProjectId]);

  // Auto project init
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.autoProjectInitRef.current) return;
    if (
      state.appProjectId ||
      state.projectParam ||
      state.chatIdParam ||
      state.promptId ||
      state.templateId ||
      state.hasEntryParams
    ) {
      return;
    }
    state.autoProjectInitRef.current = true;

    let restored: string | null = null;
    try {
      restored = localStorage.getItem("sajtmaskin:lastProjectId");
    } catch {
      restored = null;
    }

    if (restored) {
      state.setAppProjectId(restored);
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", restored);
      router.replace(`/builder?${params.toString()}`);
      return;
    }

    import("@/lib/project-client").then(({ createProject }) =>
      createProject("Untitled Project")
        .then((project) => {
          state.setAppProjectId(project.id);
          try {
            localStorage.setItem("sajtmaskin:lastProjectId", project.id);
          } catch {
            /* ignore */
          }
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", project.id);
          router.replace(`/builder?${params.toString()}`);
        })
        .catch((error) => {
          console.warn("[Builder] Auto project create failed:", error);
          state.autoProjectInitRef.current = false;
        }),
    );
  }, [
    state.appProjectId,
    state.projectParam,
    state.chatIdParam,
    state.promptId,
    state.templateId,
    state.hasEntryParams,
    router,
    searchParams,
  ]);

  // Entry intent sync
  useEffect(() => {
    const hasIntent = Boolean(state.promptParam || state.promptId || state.source === "audit");
    state.setEntryIntentActive(hasIntent);
  }, [state.promptParam, state.promptId, state.source]);

  useEffect(() => {
    if (state.chatId) state.setEntryIntentActive(false);
  }, [state.chatId]);

  // Project name / palette load
  useEffect(() => {
    if (!state.appProjectId) {
      state.setAppProjectName(null);
      state.setPaletteState(getDefaultPaletteState());
      state.paletteLoadedRef.current = false;
      state.lastPaletteSavedRef.current = null;
      state.lastProjectIdRef.current = null;
      return;
    }
    const previousProjectId = state.lastProjectIdRef.current;
    state.lastProjectIdRef.current = state.appProjectId;
    let isActive = true;
    getProject(state.appProjectId)
      .then((result) => {
        if (!isActive) return;
        state.setAppProjectName(result.project?.name ?? null);
        const nextPalette = normalizePaletteState(result.data?.meta?.palette);
        const defaultPalette = getDefaultPaletteState();
        state.setPaletteState((prev) => {
          const isNewProject = previousProjectId !== null && previousProjectId !== state.appProjectId;
          if (nextPalette.selections.length === 0) {
            if (!isNewProject && prev.selections.length > 0) return prev;
            return defaultPalette;
          }
          return nextPalette;
        });
        state.paletteLoadedRef.current = true;
      })
      .catch((error) => {
        console.warn("[Builder] Failed to load project name:", error);
        if (error instanceof Error && error.message.toLowerCase().includes("project not found")) {
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("project") === state.appProjectId) {
              params.delete("project");
              const query = params.toString();
              window.history.replaceState(null, "", query ? `/builder?${query}` : "/builder");
            }
          }
          state.setAppProjectId(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, [state.appProjectId]);

  // Palette persist
  useEffect(() => {
    if (!state.appProjectId) return;
    if (!state.paletteLoadedRef.current) return;
    const serialized = JSON.stringify(state.paletteState);
    if (serialized === state.lastPaletteSavedRef.current) return;
    state.lastPaletteSavedRef.current = serialized;
    saveProjectData(state.appProjectId, {
      meta: { palette: state.paletteState },
    }).catch((error) => {
      console.warn("[Builder] Failed to persist palette state:", error);
    });
  }, [state.appProjectId, state.paletteState]);

  // Structured chat localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:structuredChat");
      if (stored !== null) state.setShowStructuredChat(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:structuredChat", String(state.showStructuredChat));
    } catch {
      /* ignore */
    }
  }, [state.showStructuredChat]);

  // Deploy dialog close handler
  useEffect(() => {
    const handleDialogClose = () => state.setDeployNameDialogOpen(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  // Custom instructions load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.chatId) {
      state.hasLoadedInstructions.current = false;
      return;
    }
    const storageKey = `sajtmaskin:chatInstructions:${state.chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = state.pendingInstructionsRef.current;
    if (stored !== null) {
      state.setCustomInstructions(stored);
    } else if (pending) {
      const normalized = pending.trim();
      state.setCustomInstructions(normalized);
      try {
        localStorage.setItem(storageKey, normalized);
      } catch {
        /* ignore */
      }
    } else {
      state.setCustomInstructions("");
    }
    state.pendingInstructionsRef.current = null;
    state.hasLoadedInstructions.current = true;
  }, [state.chatId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.chatId || !state.hasLoadedInstructions.current) return;
    const storageKey = `sajtmaskin:chatInstructions:${state.chatId}`;
    const normalized = state.customInstructions.trim();
    try {
      if (normalized) {
        localStorage.setItem(storageKey, normalized);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [state.chatId, state.customInstructions]);

  // V0 project instructions sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.v0ProjectId || !state.hasLoadedInstructions.current) return;
    if (state.applyInstructionsOnce) return;
    const normalized = state.customInstructions.trim();
    const last = state.lastSyncedInstructionsRef.current;
    if (last && last.v0ProjectId === state.v0ProjectId && last.instructions === normalized) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    fetch("/api/v0/projects/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ projectId: state.v0ProjectId, instructions: normalized }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as unknown;
          const errorMessage =
            err && typeof err === "object" && "error" in err
              ? (err as { error?: unknown }).error
              : null;
          const msg =
            typeof errorMessage === "string"
              ? errorMessage
              : `Failed to sync project instructions (HTTP ${res.status})`;
          throw new Error(msg);
        }
        state.lastSyncedInstructionsRef.current = {
          v0ProjectId: state.v0ProjectId!,
          instructions: normalized,
        };
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("v0", "Failed to sync project instructions", {
          projectId: state.v0ProjectId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  }, [state.v0ProjectId, state.customInstructions, state.applyInstructionsOnce]);

  // Apply-instructions-once load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.chatId) {
      state.hasLoadedInstructionsOnce.current = false;
      state.setApplyInstructionsOnce(false);
      return;
    }
    const storageKey = `sajtmaskin:chatInstructionsOnce:${state.chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = state.pendingInstructionsOnceRef.current;
    if (stored !== null) {
      state.setApplyInstructionsOnce(stored === "true");
    } else if (pending !== null) {
      state.setApplyInstructionsOnce(pending);
      try {
        localStorage.setItem(storageKey, String(pending));
      } catch {
        /* ignore */
      }
    } else {
      state.setApplyInstructionsOnce(false);
    }
    state.pendingInstructionsOnceRef.current = null;
    state.hasLoadedInstructionsOnce.current = true;
  }, [state.chatId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.chatId || !state.hasLoadedInstructionsOnce.current) return;
    const storageKey = `sajtmaskin:chatInstructionsOnce:${state.chatId}`;
    try {
      if (state.applyInstructionsOnce) {
        localStorage.setItem(storageKey, "true");
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [state.chatId, state.applyInstructionsOnce]);

  // Health features
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadImageStrategyDefault = async () => {
      try {
        const flags = await deployActions.fetchHealthFeatures(controller.signal);
        if (!flags) return;
        const { blobEnabled, v0Enabled, reasons } = flags;
        if (!isActive) return;
        state.setIsMediaEnabled(blobEnabled);
        state.setIsImageGenerationsSupported(v0Enabled);
        if (!v0Enabled) state.setEnableImageGenerations(false);
        if (!v0Enabled && !state.featureWarnedRef.current.v0) {
          state.featureWarnedRef.current.v0 = true;
          const reason = reasons?.v0 || "AI-konfiguration saknas";
          toast.error(`Bildgenerering är avstängd: ${reason}`);
        }
        if (v0Enabled && !blobEnabled && !state.featureWarnedRef.current.blob) {
          state.featureWarnedRef.current.blob = true;
          const reason = reasons?.vercelBlob || "BLOB_READ_WRITE_TOKEN saknas";
          toast(`Blob saknas: ${reason}. Bilder kan saknas i preview.`);
        }
        debugLog("AI", "Builder feature flags resolved", { v0Enabled, blobEnabled });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    };

    loadImageStrategyDefault();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [deployActions.fetchHealthFeatures]);

  // GitHub OAuth callback
  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get("github_connected");
    const username = searchParams.get("github_username");
    const error = searchParams.get("github_error");
    const errorReason = searchParams.get("github_error_reason");

    if (!connected && !error) return;

    if (connected) {
      toast.success(username ? `GitHub kopplat: @${username}` : "GitHub kopplat");
    } else if (error) {
      const message =
        error === "not_authenticated"
          ? "Logga in för att koppla GitHub"
          : error === "not_configured"
            ? "GitHub OAuth är inte konfigurerat"
            : error === "user_fetch_failed"
              ? "Kunde inte hämta GitHub-användare"
              : error === "no_code"
                ? "GitHub gav ingen kod"
                : "GitHub-anslutning misslyckades";
      toast.error(message);
      if (errorReason === "unsafe_return") {
        console.warn("[GitHub OAuth] Unsafe return URL sanitized");
      }
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("github_connected");
    nextParams.delete("github_username");
    nextParams.delete("github_error");
    nextParams.delete("github_error_reason");
    const query = nextParams.toString();
    router.replace(query ? `/builder?${query}` : "/builder");
  }, [searchParams, router]);

  // Audit prompt loaded
  useEffect(() => {
    if (state.source !== "audit") return;
    if (!state.promptId) state.setAuditPromptLoaded(true);
  }, [state.source, state.promptId]);

  // Chat not found
  useEffect(() => {
    if (!state.chatId || !isChatError) return;
    console.warn("[Builder] Chat not found or error loading chat:", state.chatId);
    toast.error("Chatten kunde inte hittas. Skapar ny session...");
    try {
      localStorage.removeItem("sajtmaskin:lastChatId");
    } catch {
      /* ignore */
    }
    state.setChatId(null);
    state.setCurrentDemoUrl(null);
    state.setMessages([]);
    router.replace("/builder");
  }, [state.chatId, isChatError, router]);

  // V0 project id sync
  useEffect(() => {
    if (!state.chatId) {
      state.setV0ProjectId(null);
      return;
    }
    if (derived.chatV0ProjectId && derived.chatV0ProjectId !== state.v0ProjectId) {
      state.setV0ProjectId(derived.chatV0ProjectId);
    }
  }, [state.chatId, derived.chatV0ProjectId, state.v0ProjectId]);

  // Reset selected version on chat change
  useEffect(() => {
    state.setSelectedVersionId(null);
    state.setV0ProjectId(null);
  }, [state.chatId]);

  useEffect(() => {
    if (!state.selectedVersionId) return;
    if (!derived.versionIdSet.has(state.selectedVersionId)) {
      state.setSelectedVersionId(null);
    }
  }, [state.selectedVersionId, derived.versionIdSet]);

  // ChatId URL sync
  useEffect(() => {
    if (state.isIntentionalReset) {
      if (!state.chatIdParam) state.setIsIntentionalReset(false);
      return;
    }
    if (state.chatIdParam && state.chatIdParam !== state.chatId) {
      state.setChatId(state.chatIdParam);
    }
  }, [
    state.chatIdParam,
    state.chatId,
    router,
    state.isIntentionalReset,
    state.hasEntryParams,
    state.entryIntentActive,
  ]);

  useEffect(() => {
    if (!state.chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", state.chatId);
    } catch {
      /* ignore */
    }
  }, [state.chatId]);

  // DemoUrl sync when active version changes
  useEffect(() => {
    if (!derived.activeVersionId) return;

    const didChangeVersion = state.lastActiveVersionIdRef.current !== derived.activeVersionId;
    state.lastActiveVersionIdRef.current = derived.activeVersionId;

    if (!didChangeVersion && state.currentDemoUrl) return;

    const activeVersionMatch = derived.effectiveVersionsList.find(
      (v) => v.versionId === derived.activeVersionId || v.id === derived.activeVersionId,
    );
    const chatObj = chat as ChatData;
    const nextDemoUrl =
      activeVersionMatch?.demoUrl ||
      chatObj?.demoUrl ||
      chatObj?.latestVersion?.demoUrl ||
      derived.effectiveVersionsList[0]?.demoUrl ||
      null;

    if (nextDemoUrl && nextDemoUrl !== state.currentDemoUrl) {
      state.setCurrentDemoUrl(nextDemoUrl);
      state.setPreviewRefreshToken(Date.now());
    }
  }, [derived.activeVersionId, chat, state.currentDemoUrl, derived.effectiveVersionsList]);

  // Inspector clear on chat/url change
  useEffect(() => {
    state.setInspectorSelection(null);
    state.setInspectorClearToken(Date.now());
  }, [state.chatId, state.currentDemoUrl]);

  // Prompt assist context fetch
  useEffect(() => {
    const contextKey =
      state.chatId && derived.activeVersionId
        ? `${state.chatId}:${derived.activeVersionId}`
        : null;
    if (!contextKey) {
      state.promptAssistContextKeyRef.current = null;
      state.setPromptAssistContext(null);
      state.setExistingUiComponents([]);
      return;
    }
    if (state.promptAssistContextKeyRef.current === contextKey) return;
    state.promptAssistContextKeyRef.current = contextKey;

    let isActive = true;
    const controller = new AbortController();

    const fetchContext = async () => {
      try {
        if (!state.chatId || !derived.activeVersionId) {
          if (isActive) state.setPromptAssistContext("");
          return;
        }
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(state.chatId)}/files?versionId=${encodeURIComponent(
            derived.activeVersionId,
          )}`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content?: string | null }>;
        } | null;
        if (!response.ok || !Array.isArray(data?.files)) {
          if (isActive) {
            state.setPromptAssistContext("");
            state.setCurrentPageCode(undefined);
            state.setExistingUiComponents([]);
          }
          return;
        }
        const context = buildPromptAssistContext(data.files);
        if (isActive) state.setPromptAssistContext(context);

        const pageFile = data.files.find(
          (f) =>
            f.name === "page.tsx" ||
            f.name === "app/page.tsx" ||
            f.name.endsWith("/page.tsx") ||
            f.name === "index.tsx" ||
            f.name === "App.tsx",
        );
        if (isActive) state.setCurrentPageCode(pageFile?.content || undefined);

        const extractUiComponentName = (fileName: string): string | null => {
          if (!fileName) return null;
          const normalized = fileName.replace(/\\/g, "/");
          const marker = "/components/ui/";
          const idx = normalized.lastIndexOf(marker);
          if (idx === -1) return null;
          const tail = normalized.slice(idx + marker.length);
          if (!tail) return null;
          const indexMatch = tail.match(/([^/]+)\/index\.(tsx|ts|jsx|js)$/);
          if (indexMatch?.[1]) return indexMatch[1];
          const base = tail.split("/").pop() || "";
          const cleaned = base.replace(/\.(tsx|ts|jsx|js)$/, "");
          return cleaned || null;
        };

        const nextUiComponents = Array.from(
          new Set(
            data.files
              .map((file) => extractUiComponentName(file.name))
              .filter((name): name is string => Boolean(name)),
          ),
        ).sort((a, b) => a.localeCompare(b));

        if (isActive) state.setExistingUiComponents(nextUiComponents);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        state.setPromptAssistContext("");
        state.setExistingUiComponents([]);
      }
    };

    fetchContext();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [state.chatId, derived.activeVersionId]);

  // Auto-start generation for kostnadsfri flow
  useEffect(() => {
    if (!isAuthenticated) return;
    if (state.buildMethod !== "kostnadsfri") return;
    if (!state.resolvedPrompt) return;
    if (state.chatId) return;
    if (autoGenerateTriggeredRef.current) return;
    autoGenerateTriggeredRef.current = true;

    state.setSelectedModelTier("v0-max-fast");

    const timer = setTimeout(() => {
      void promptActions.requestCreateChat(state.resolvedPrompt!);
    }, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, state.buildMethod, state.resolvedPrompt, state.chatId, promptActions.requestCreateChat]);

  // =====================================================================
  // Return view model
  // =====================================================================
  return {
    // Auth
    authModalReason,
    setAuthModalReason,
    isAuthenticated,

    // Router
    router,
    searchParams,

    // State (pass through what the shell needs)
    chatId: state.chatId,
    messages: state.messages,
    selectedModelTier: state.selectedModelTier,
    promptAssistModel: state.promptAssistModel,
    promptAssistDeep: state.promptAssistDeep,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    enableImageGenerations: state.enableImageGenerations,
    enableThinking: state.enableThinking,
    isThinkingSupported: state.isThinkingSupported,
    isImageGenerationsSupported: state.isImageGenerationsSupported,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    showStructuredChat: state.showStructuredChat,
    designTheme: state.designTheme,
    isImportModalOpen: state.isImportModalOpen,
    isSandboxModalOpen: state.isSandboxModalOpen,
    isDeploying: state.isDeploying,
    isSavingProject: state.isSavingProject,
    isTemplateLoading: state.isTemplateLoading,
    isPreparingPrompt: state.isPreparingPrompt,
    deployNameDialogOpen: state.deployNameDialogOpen,
    deployNameInput: state.deployNameInput,
    deployNameError: state.deployNameError,
    domainSearchOpen: state.domainSearchOpen,
    domainQuery: state.domainQuery,
    domainResults: state.domainResults,
    isDomainSearching: state.isDomainSearching,
    v0ProjectId: state.v0ProjectId,
    paletteState: state.paletteState,
    currentDemoUrl: state.currentDemoUrl,
    previewRefreshToken: state.previewRefreshToken,
    inspectorSelection: state.inspectorSelection,
    inspectorClearToken: state.inspectorClearToken,
    isVersionPanelCollapsed: state.isVersionPanelCollapsed,
    currentPageCode: state.currentPageCode,
    existingUiComponents: state.existingUiComponents,
    appProjectId: state.appProjectId,

    // Setters the shell needs for onChange handlers
    setSelectedModelTier: state.setSelectedModelTier,
    setPromptAssistDeep: state.setPromptAssistDeep,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    setEnableImageGenerations: state.setEnableImageGenerations,
    setEnableThinking: state.setEnableThinking,
    setEnableBlobMedia: state.setEnableBlobMedia,
    setShowStructuredChat: state.setShowStructuredChat,
    setDesignTheme: state.setDesignTheme,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setIsSandboxModalOpen: state.setIsSandboxModalOpen,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameError: state.setDeployNameError,
    setDomainSearchOpen: state.setDomainSearchOpen,
    setDomainQuery: state.setDomainQuery,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setChatId: state.setChatId,
    setMessages: state.setMessages,
    setInspectorSelection: state.setInspectorSelection,

    // Derived
    isAnyStreaming: derived.isAnyStreaming,
    isAwaitingInput: derived.isAwaitingInput,
    activeVersionId: derived.activeVersionId,
    mediaEnabled: derived.mediaEnabled,
    initialPrompt: derived.initialPrompt,
    auditPromptLoaded: state.auditPromptLoaded,

    // External data
    versions,
    mutateVersions,

    // Messaging
    isCreatingChat,
    sendMessage,

    // Project actions
    applyAppProjectId: projectActions.applyAppProjectId,
    handleSaveProject: projectActions.handleSaveProject,
    resetToNewChat: projectActions.resetToNewChat,

    // Deploy actions
    handleOpenDeployDialog: deployActions.handleOpenDeployDialog,
    handleDomainSearch: deployActions.handleDomainSearch,
    handleConfirmDeploy: deployActions.handleConfirmDeploy,

    // Prompt actions
    handlePromptAssistModelChange: promptActions.handlePromptAssistModelChange,
    handlePromptEnhance: promptActions.handlePromptEnhance,
    requestCreateChat: promptActions.requestCreateChat,
    handleStartFromRegistry: promptActions.handleStartFromRegistry,
    handleStartFromTemplate: promptActions.handleStartFromTemplate,
    handleGoHome: promptActions.handleGoHome,
    handlePaletteSelection: promptActions.handlePaletteSelection,

    // Preview / version callbacks
    handleClearPreview: builderCallbacks.handleClearPreview,
    clearInspectorSelection: builderCallbacks.clearInspectorSelection,
    handleFixPreview: builderCallbacks.handleFixPreview,
    handleVersionSelect: builderCallbacks.handleVersionSelect,
    handleToggleVersionPanel: builderCallbacks.handleToggleVersionPanel,
  };
}

export type BuilderViewModel = ReturnType<typeof useBuilderPageController>;
