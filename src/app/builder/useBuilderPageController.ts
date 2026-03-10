"use client";

import type { ChatMessage } from "@/lib/builder/types";
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
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import { getProject, saveProjectData } from "@/lib/project-client";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptAssist } from "@/lib/hooks/usePromptAssist";
import { useV0ChatMessaging } from "@/lib/hooks/useV0ChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useAuth } from "@/lib/auth/auth-store";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";
import { useLocalStorageBooleanSync } from "@/lib/hooks/useLocalStorageSync";
import { debugLog } from "@/lib/utils/debug";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

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
  const [tipsEnabled, setTipsEnabled] = useState(false);

  const state = useBuilderState(searchParams);

  // Destructure state for clean effect dependency tracking.
  // Setters (from useState) and refs (from useRef) are stable across
  // renders — including them in dep arrays is safe and avoids the need
  // for eslint-disable comments.
  const {
    appProjectId, applyInstructionsOnce, buildIntentParam, buildMethod,
    buildMethodParam, chatId, chatIdParam, currentDemoUrl, customInstructions,
    designTheme, designSystemId, enableBlobMedia, enableImageGenerations, enableThinking,
    entryIntentActive, hasEntryParams, isIntentionalReset, paletteState,
    projectParam, promptId, promptParam, resolvedPrompt, selectedModelTier,
    selectedVersionId, serverProjectChatId, serverProjectDemoUrl,
    showStructuredChat, source, templateId, v0ProjectId,
    setApplyInstructionsOnce, setAppProjectId, setAppProjectName,
    setAuditPromptLoaded, setBuildIntent, setBuildMethod, setChatId,
    setCurrentDemoUrl, setCurrentPageCode, setCustomInstructions,
    setDesignTheme, setDesignSystemId, setEnableBlobMedia,
    setEnableImageGenerations, setEnableThinking, setEntryIntentActive,
    setExistingUiComponents,
    setIsImageGenerationsSupported, setIsIntentionalReset, setIsMediaEnabled,
    setMessages, setPaletteState, setPreviewRefreshToken, setPromptAssistContext,
    setResolvedPrompt, setSelectedModelTier, setSelectedVersionId,
    setServerProjectChatId, setServerProjectDemoUrl, setServerProjectMessages,
    setShowStructuredChat, setV0ProjectId,
    applyingGenerationSettingsRef, autoProjectInitRef, featureWarnedRef,
    hasLoadedInstructions, hasLoadedInstructionsOnce, lastActiveVersionIdRef,
    lastPaletteSavedRef, lastProjectIdRef, lastSyncedInstructionsRef,
    loadedGenerationSettingsChatRef, paletteLoadedRef, pendingInstructionsOnceRef,
    pendingInstructionsRef, promptAssistContextKeyRef, promptFetchDoneRef,
    promptFetchInFlightRef,
  } = state;

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
    setPromptAssistModel: state.setPromptAssistModel,
    setPromptAssistDeep: state.setPromptAssistDeep,
    setEnableImageGenerations: state.setEnableImageGenerations,
    setDesignTheme: state.setDesignTheme,
    setScaffoldMode: state.setScaffoldMode,
    setScaffoldId: state.setScaffoldId,
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
    setDomainManagerOpen: state.setDomainManagerOpen,
    setLastDeployVercelProjectId: state.setLastDeployVercelProjectId,
    setActiveDeploymentId: state.setActiveDeploymentId,
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
  const fetchHealthFeatures = deployActions.fetchHealthFeatures;

  // ── Deployment status SSE ──────────────────────────────────────────
  const deploymentStatus = useDeploymentStatus(state.activeDeploymentId);

  // ── V0 Chat messaging ───────────────────────────────────────────────
  const resetBeforeCreateChat = useCallback(() => {
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
  }, [setCurrentDemoUrl, setPreviewRefreshToken]);

  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
  }, [setPreviewRefreshToken]);

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
      chatPrivacy: state.chatPrivacy,
      designSystemId: state.designSystemId || undefined,
      systemPrompt: state.customInstructions,
      promptAssistModel: state.promptAssistModel,
      promptAssistDeep: state.promptAssistDeep,
      buildIntent: state.resolvedBuildIntent,
      buildMethod: state.buildMethod,
      scaffoldMode: state.scaffoldMode,
      scaffoldId: state.scaffoldId,
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
    setIsVersionPanelCollapsed: state.setIsVersionPanelCollapsed,
  });

  // ── Persisted messages ───────────────────────────────────────────────
  usePersistedChatMessages({
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    messages: state.messages,
    setMessages: state.setMessages,
    serverMessages: state.serverProjectMessages,
    serverMessagesChatId: state.serverProjectChatId,
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
    if (!promptId) return;
    if (promptFetchDoneRef.current === promptId) return;
    if (promptFetchInFlightRef.current === promptId) return;
    promptFetchInFlightRef.current = promptId;
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
        promptFetchDoneRef.current = promptId;
        setEntryIntentActive(true);
        setResolvedPrompt(data.prompt);
        if (data.projectId) {
          setAppProjectId((prev) => prev ?? data.projectId!);
        }
        shouldClearPromptId = true;
      } catch (error) {
        if (!isActive) return;
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[Builder] Prompt handoff missing:", error);
        toast.error("Prompten hittades inte eller har redan använts.");
        setResolvedPrompt(null);
        setEntryIntentActive(false);
        promptFetchDoneRef.current = promptId;
        shouldClearPromptId = true;
      } finally {
        if (promptFetchInFlightRef.current === promptId) {
          promptFetchInFlightRef.current = null;
        }
        if (isActive) {
          setAuditPromptLoaded(true);
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
      if (promptFetchInFlightRef.current === promptId) {
        promptFetchInFlightRef.current = null;
      }
    };
  }, [promptId, promptFetchDoneRef, promptFetchInFlightRef, setEntryIntentActive, setResolvedPrompt, setAppProjectId, setAuditPromptLoaded, router, searchParams]);

  // Auth fetch
  useEffect(() => {
    fetchUser().catch(() => {});
  }, [fetchUser]);

  // Build intent / method sync
  useEffect(() => {
    setBuildIntent(normalizeBuildIntent(buildIntentParam));
  }, [buildIntentParam, setBuildIntent]);

  useEffect(() => {
    const normalized = normalizeBuildMethod(buildMethodParam);
    if (normalized) {
      setBuildMethod(normalized);
      return;
    }
    if (source === "audit") {
      setBuildMethod("audit");
      return;
    }
    setBuildMethod(null);
  }, [buildMethodParam, source, setBuildMethod]);

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
    if (projectParam) {
      setAppProjectId(projectParam);
    }
  }, [projectParam, setAppProjectId]);

  // Load latest chat for project when project is in URL but chatId is not
  useEffect(() => {
    if (!projectParam || chatIdParam || chatId) return;
    let isActive = true;
    const controller = new AbortController();

    const loadProjectChat = async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectParam!)}/chat`,
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
          setChatId(v0ChatId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", projectParam!);
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
  }, [projectParam, chatIdParam, chatId, setChatId, router, searchParams]);

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

  // Generation settings per-chat load/save
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
    } else {
      writeChatGenerationSettings(chatId, {
        modelTier: selectedModelTier,
        imageGenerations: enableImageGenerations,
      });
    }
    loadedGenerationSettingsChatRef.current = chatId;
    applyingGenerationSettingsRef.current = false;
  }, [chatId, selectedModelTier, enableImageGenerations, loadedGenerationSettingsChatRef, applyingGenerationSettingsRef, setSelectedModelTier, setEnableImageGenerations]);

  useEffect(() => {
    if (!chatId) return;
    if (applyingGenerationSettingsRef.current) return;
    if (loadedGenerationSettingsChatRef.current !== chatId) return;
    writeChatGenerationSettings(chatId, {
      modelTier: selectedModelTier,
      imageGenerations: enableImageGenerations,
    });
  }, [chatId, selectedModelTier, enableImageGenerations, applyingGenerationSettingsRef, loadedGenerationSettingsChatRef]);

  useLocalStorageBooleanSync("sajtmaskin:blobImages", enableBlobMedia, setEnableBlobMedia);

  // Design theme localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:designTheme");
      if (!stored) return;
      if (stored === "blue") {
        setDesignTheme("off");
        localStorage.setItem("sajtmaskin:designTheme", "off");
        return;
      }
      setDesignTheme(normalizeDesignTheme(stored));
    } catch {
      /* ignore */
    }
  }, [setDesignTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:designTheme", designTheme);
    } catch {
      /* ignore */
    }
  }, [designTheme]);

  // Design system ID localStorage sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:designSystemId");
      if (stored) setDesignSystemId(stored);
    } catch {
      /* ignore */
    }
  }, [setDesignSystemId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:designSystemId", designSystemId);
    } catch {
      /* ignore */
    }
  }, [designSystemId]);

  // AppProjectId localStorage persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!appProjectId) return;
    try {
      localStorage.setItem("sajtmaskin:lastProjectId", appProjectId);
    } catch {
      /* ignore */
    }
  }, [appProjectId]);

  // Auto project init
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoProjectInitRef.current) return;
    if (appProjectId || projectParam || chatIdParam || promptId || templateId || hasEntryParams) {
      return;
    }
    autoProjectInitRef.current = true;

    let restored: string | null = null;
    try {
      restored = localStorage.getItem("sajtmaskin:lastProjectId");
    } catch {
      restored = null;
    }

    if (restored) {
      setAppProjectId(restored);
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", restored);
      router.replace(`/builder?${params.toString()}`);
      return;
    }

    import("@/lib/project-client").then(({ createProject }) =>
      createProject("Untitled Project")
        .then((project) => {
          setAppProjectId(project.id);
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
          autoProjectInitRef.current = false;
        }),
    );
  }, [appProjectId, projectParam, chatIdParam, promptId, templateId, hasEntryParams, autoProjectInitRef, setAppProjectId, router, searchParams]);

  // Entry intent sync
  useEffect(() => {
    const hasIntent = Boolean(promptParam || promptId || source === "audit");
    setEntryIntentActive(hasIntent);
  }, [promptParam, promptId, source, setEntryIntentActive]);

  useEffect(() => {
    if (chatId) setEntryIntentActive(false);
  }, [chatId, setEntryIntentActive]);

  // Project name / palette / messages / demoUrl load
  useEffect(() => {
    if (!appProjectId) {
      setAppProjectName(null);
      setPaletteState(getDefaultPaletteState());
      paletteLoadedRef.current = false;
      lastPaletteSavedRef.current = null;
      lastProjectIdRef.current = null;
      setServerProjectChatId(null);
      setServerProjectMessages([]);
      setServerProjectDemoUrl(null);
      return;
    }
    const previousProjectId = lastProjectIdRef.current;
    lastProjectIdRef.current = appProjectId;
    if (previousProjectId !== appProjectId) {
      setServerProjectChatId(null);
      setServerProjectMessages([]);
      setServerProjectDemoUrl(null);
    }
    let isActive = true;
    getProject(appProjectId)
      .then((result) => {
        if (!isActive) return;
        setAppProjectName(result.project?.name ?? null);
        const nextPalette = normalizePaletteState(result.data?.meta?.palette);
        const defaultPalette = getDefaultPaletteState();
        setPaletteState((prev) => {
          const isNewProject = previousProjectId !== null && previousProjectId !== appProjectId;
          if (nextPalette.selections.length === 0) {
            if (!isNewProject && prev.selections.length > 0) return prev;
            return defaultPalette;
          }
          return nextPalette;
        });
        paletteLoadedRef.current = true;

        const serverChatId =
          typeof result.data?.chat_id === "string" && result.data.chat_id.trim().length > 0
            ? result.data.chat_id.trim()
            : null;
        setServerProjectChatId(serverChatId);

        const serverMsgs = Array.isArray(result.data?.messages) ? result.data.messages : [];
        setServerProjectMessages(serverMsgs as ChatMessage[]);

        const serverDemoUrl =
          typeof result.data?.demo_url === "string" ? result.data.demo_url : null;
        setServerProjectDemoUrl(serverDemoUrl);
      })
      .catch((error) => {
        console.warn("[Builder] Failed to load project name:", error);
        if (error instanceof Error && error.message.toLowerCase().includes("project not found")) {
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("project") === appProjectId) {
              params.delete("project");
              const query = params.toString();
              window.history.replaceState(null, "", query ? `/builder?${query}` : "/builder");
            }
          }
          setAppProjectId(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, [appProjectId, setAppProjectName, setPaletteState, paletteLoadedRef, lastPaletteSavedRef, lastProjectIdRef, setServerProjectChatId, setServerProjectMessages, setServerProjectDemoUrl, setAppProjectId]);

  // Palette persist
  useEffect(() => {
    if (!appProjectId) return;
    if (!paletteLoadedRef.current) return;
    const serialized = JSON.stringify(paletteState);
    if (serialized === lastPaletteSavedRef.current) return;
    lastPaletteSavedRef.current = serialized;
    saveProjectData(appProjectId, {
      meta: { palette: paletteState },
    }).catch((error) => {
      console.warn("[Builder] Failed to persist palette state:", error);
    });
  }, [appProjectId, paletteState, paletteLoadedRef, lastPaletteSavedRef]);

  useLocalStorageBooleanSync("sajtmaskin:structuredChat", showStructuredChat, setShowStructuredChat);
  useLocalStorageBooleanSync("sajtmaskin:openclawTipsEnabled", tipsEnabled, setTipsEnabled);

  // Custom instructions load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructions.current = false;
      return;
    }
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsRef.current;
    if (stored !== null) {
      setCustomInstructions(stored);
    } else if (pending) {
      const normalized = pending.trim();
      setCustomInstructions(normalized);
      try {
        localStorage.setItem(storageKey, normalized);
      } catch {
        /* ignore */
      }
    } else {
      setCustomInstructions("");
    }
    pendingInstructionsRef.current = null;
    hasLoadedInstructions.current = true;
  }, [chatId, hasLoadedInstructions, pendingInstructionsRef, setCustomInstructions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructions.current) return;
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    const normalized = customInstructions.trim();
    try {
      if (normalized) {
        localStorage.setItem(storageKey, normalized);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [chatId, customInstructions, hasLoadedInstructions]);

  // V0 project instructions sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!v0ProjectId || !hasLoadedInstructions.current) return;
    if (applyInstructionsOnce) return;
    const normalized = customInstructions.trim();
    const last = lastSyncedInstructionsRef.current;
    if (last && last.v0ProjectId === v0ProjectId && last.instructions === normalized) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    fetch("/api/v0/projects/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ projectId: v0ProjectId, instructions: normalized }),
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
        lastSyncedInstructionsRef.current = {
          v0ProjectId: v0ProjectId!,
          instructions: normalized,
        };
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("v0", "Failed to sync project instructions", {
          projectId: v0ProjectId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  }, [v0ProjectId, customInstructions, applyInstructionsOnce, hasLoadedInstructions, lastSyncedInstructionsRef]);

  // Apply-instructions-once load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructionsOnce.current = false;
      setApplyInstructionsOnce(false);
      return;
    }
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsOnceRef.current;
    if (stored !== null) {
      setApplyInstructionsOnce(stored === "true");
    } else if (pending !== null) {
      setApplyInstructionsOnce(pending);
      try {
        localStorage.setItem(storageKey, String(pending));
      } catch {
        /* ignore */
      }
    } else {
      setApplyInstructionsOnce(false);
    }
    pendingInstructionsOnceRef.current = null;
    hasLoadedInstructionsOnce.current = true;
  }, [chatId, hasLoadedInstructionsOnce, pendingInstructionsOnceRef, setApplyInstructionsOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructionsOnce.current) return;
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    try {
      if (applyInstructionsOnce) {
        localStorage.setItem(storageKey, "true");
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [chatId, applyInstructionsOnce, hasLoadedInstructionsOnce]);

  // Health features
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadImageStrategyDefault = async () => {
      try {
        const flags = await fetchHealthFeatures(controller.signal);
        if (!flags) return;
        const { blobEnabled, v0Enabled, reasons } = flags;
        if (!isActive) return;
        setIsMediaEnabled(blobEnabled);
        setIsImageGenerationsSupported(v0Enabled);
        if (!v0Enabled) setEnableImageGenerations(false);
        if (!v0Enabled && !featureWarnedRef.current.v0) {
          featureWarnedRef.current.v0 = true;
          const reason = reasons?.v0 || "AI-konfiguration saknas";
          toast.error(`Bildgenerering är avstängd: ${reason}`);
        }
        if (v0Enabled && !blobEnabled && !featureWarnedRef.current.blob) {
          featureWarnedRef.current.blob = true;
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
  }, [fetchHealthFeatures, setIsMediaEnabled, setIsImageGenerationsSupported, setEnableImageGenerations, featureWarnedRef]);

  // OAuth callback feedback
  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get("github_connected");
    const username = searchParams.get("github_username");
    const githubError = searchParams.get("github_error");
    const githubErrorReason = searchParams.get("github_error_reason");
    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    const verified = searchParams.get("verified");
    const verificationReason = searchParams.get("reason");

    const hasGitHubFeedback = Boolean(connected || githubError);
    const hasAuthFeedback = Boolean(login || authError || verified);
    if (!hasGitHubFeedback && !hasAuthFeedback) return;

    if (connected) {
      toast.success(username ? `GitHub kopplat: @${username}` : "GitHub kopplat");
    } else if (githubError) {
      const message =
        githubError === "not_authenticated"
          ? "Logga in för att koppla GitHub"
          : githubError === "not_configured"
            ? "GitHub OAuth är inte konfigurerat"
            : githubError === "user_fetch_failed"
              ? "Kunde inte hämta GitHub-användare"
              : githubError === "no_code"
                ? "GitHub gav ingen kod"
                : "GitHub-anslutning misslyckades";
      toast.error(message);
      if (githubErrorReason === "unsafe_return") {
        console.warn("[GitHub OAuth] Unsafe return URL sanitized");
      }
    }

    if (login === "success") {
      toast.success("Inloggningen lyckades.");
    }
    if (authError) {
      toast.error(authError);
    }
    if (verified === "success") {
      toast.success("E-postadressen är verifierad. Logga in för att fortsätta.");
    } else if (verified === "error") {
      const verificationMessage =
        verificationReason === "missing_token"
          ? "Verifieringslänken saknar token."
          : verificationReason === "invalid_or_expired"
            ? "Verifieringslänken är ogiltig eller har gått ut."
            : verificationReason === "server_error"
              ? "Något gick fel vid e-postverifiering."
              : "Kunde inte verifiera e-postadressen.";
      toast.error(verificationMessage);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("github_connected");
    nextParams.delete("github_username");
    nextParams.delete("github_error");
    nextParams.delete("github_error_reason");
    nextParams.delete("login");
    nextParams.delete("error");
    nextParams.delete("verified");
    nextParams.delete("reason");
    const query = nextParams.toString();
    router.replace(query ? `/builder?${query}` : "/builder");
  }, [searchParams, router]);

  // Audit prompt loaded
  useEffect(() => {
    if (source !== "audit") return;
    if (!promptId) setAuditPromptLoaded(true);
  }, [source, promptId, setAuditPromptLoaded]);

  // Chat not found
  useEffect(() => {
    if (!chatId || !isChatError) return;
    console.warn("[Builder] Chat not found or error loading chat:", chatId);
    toast.error("Chatten kunde inte hittas. Skapar ny session...");
    try {
      localStorage.removeItem("sajtmaskin:lastChatId");
    } catch {
      /* ignore */
    }
    setChatId(null);
    setCurrentDemoUrl(null);
    setMessages([]);
    router.replace("/builder");
  }, [chatId, isChatError, router, setChatId, setCurrentDemoUrl, setMessages]);

  // V0 project id sync
  useEffect(() => {
    if (!chatId) {
      setV0ProjectId(null);
      return;
    }
    if (derived.chatV0ProjectId && derived.chatV0ProjectId !== v0ProjectId) {
      setV0ProjectId(derived.chatV0ProjectId);
    }
  }, [chatId, derived.chatV0ProjectId, v0ProjectId, setV0ProjectId]);

  // Reset selected version on chat change
  useEffect(() => {
    setSelectedVersionId(null);
    setV0ProjectId(null);
  }, [chatId, setSelectedVersionId, setV0ProjectId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    if (!derived.versionIdSet.has(selectedVersionId)) {
      setSelectedVersionId(null);
    }
  }, [selectedVersionId, derived.versionIdSet, setSelectedVersionId]);

  // ChatId URL sync
  useEffect(() => {
    if (isIntentionalReset) {
      if (!chatIdParam) setIsIntentionalReset(false);
      return;
    }
    if (chatIdParam && chatIdParam !== chatId) {
      setChatId(chatIdParam);
    }
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams, entryIntentActive, setIsIntentionalReset, setChatId]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", chatId);
    } catch {
      /* ignore */
    }
  }, [chatId]);

  // DemoUrl sync when active version changes
  useEffect(() => {
    const didChangeVersion = lastActiveVersionIdRef.current !== derived.activeVersionId;
    lastActiveVersionIdRef.current = derived.activeVersionId;

    if (!didChangeVersion && currentDemoUrl) return;

    const activeVersionMatch = derived.activeVersionId
      ? derived.effectiveVersionsList.find(
          (v) => v.versionId === derived.activeVersionId || v.id === derived.activeVersionId,
        )
      : undefined;
    const chatObj = chat as ChatData;
    const canUseServerDemoUrl =
      !serverProjectChatId || !chatId || serverProjectChatId === chatId;
    const nextDemoUrl =
      activeVersionMatch?.demoUrl ||
      chatObj?.demoUrl ||
      chatObj?.latestVersion?.demoUrl ||
      derived.effectiveVersionsList[0]?.demoUrl ||
      (canUseServerDemoUrl ? serverProjectDemoUrl : null) ||
      null;

    if (nextDemoUrl && nextDemoUrl !== currentDemoUrl) {
      setCurrentDemoUrl(nextDemoUrl);
      setPreviewRefreshToken(Date.now());
    }
  }, [derived.activeVersionId, chat, currentDemoUrl, derived.effectiveVersionsList, serverProjectDemoUrl, serverProjectChatId, chatId, lastActiveVersionIdRef, setCurrentDemoUrl, setPreviewRefreshToken]);

  // Prompt assist context fetch
  useEffect(() => {
    const contextKey =
      chatId && derived.activeVersionId
        ? `${chatId}:${derived.activeVersionId}`
        : null;
    if (!contextKey) {
      promptAssistContextKeyRef.current = null;
      setPromptAssistContext(null);
      setExistingUiComponents([]);
      return;
    }
    if (promptAssistContextKeyRef.current === contextKey) return;
    promptAssistContextKeyRef.current = contextKey;

    let isActive = true;
    const controller = new AbortController();

    const fetchContext = async () => {
      try {
        if (!chatId || !derived.activeVersionId) {
          if (isActive) setPromptAssistContext("");
          return;
        }
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            derived.activeVersionId,
          )}`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content?: string | null }>;
        } | null;
        if (!response.ok || !Array.isArray(data?.files)) {
          if (isActive) {
            setPromptAssistContext("");
            setCurrentPageCode(undefined);
            setExistingUiComponents([]);
          }
          return;
        }
        const context = buildPromptAssistContext(data.files);
        if (isActive) setPromptAssistContext(context);

        const pageFile = data.files.find(
          (f) =>
            f.name === "page.tsx" ||
            f.name === "app/page.tsx" ||
            f.name.endsWith("/page.tsx") ||
            f.name === "index.tsx" ||
            f.name === "App.tsx",
        );
        if (isActive) setCurrentPageCode(pageFile?.content || undefined);

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

        if (isActive) setExistingUiComponents(nextUiComponents);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setPromptAssistContext("");
        setExistingUiComponents([]);
      }
    };

    fetchContext();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, derived.activeVersionId, promptAssistContextKeyRef, setPromptAssistContext, setExistingUiComponents, setCurrentPageCode]);

  // Auto-start generation for kostnadsfri flow
  useEffect(() => {
    if (!isAuthenticated) return;
    if (buildMethod !== "kostnadsfri") return;
    if (!resolvedPrompt) return;
    if (chatId) return;
    if (autoGenerateTriggeredRef.current) return;
    autoGenerateTriggeredRef.current = true;

    setSelectedModelTier(DEFAULT_MODEL_TIER);

    const timer = setTimeout(() => {
      void promptActions.requestCreateChat(resolvedPrompt!);
    }, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, buildMethod, resolvedPrompt, chatId, setSelectedModelTier, promptActions]);

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
    chatPrivacy: state.chatPrivacy,
    setChatPrivacy: state.setChatPrivacy,
    isThinkingSupported: state.isThinkingSupported,
    isImageGenerationsSupported: state.isImageGenerationsSupported,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    showStructuredChat: state.showStructuredChat,
    tipsEnabled,
    designTheme: state.designTheme,
    designSystemId: state.designSystemId,
    scaffoldMode: state.scaffoldMode,
    scaffoldId: state.scaffoldId,
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
    domainManagerOpen: state.domainManagerOpen,
    domainQuery: state.domainQuery,
    domainResults: state.domainResults,
    isDomainSearching: state.isDomainSearching,
    lastDeployVercelProjectId: state.lastDeployVercelProjectId,
    activeDeploymentId: state.activeDeploymentId,
    deploymentStatus: deploymentStatus.status,
    deploymentUrl: deploymentStatus.url,
    deploymentInspectorUrl: deploymentStatus.inspectorUrl,
    v0ProjectId: state.v0ProjectId,
    paletteState: state.paletteState,
    currentDemoUrl: state.currentDemoUrl,
    previewRefreshToken: state.previewRefreshToken,
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
    setTipsEnabled,
    setDesignTheme: state.setDesignTheme,
    setDesignSystemId: state.setDesignSystemId,
    setScaffoldMode: state.setScaffoldMode,
    setScaffoldId: state.setScaffoldId,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setIsSandboxModalOpen: state.setIsSandboxModalOpen,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameError: state.setDeployNameError,
    setDomainSearchOpen: state.setDomainSearchOpen,
    setDomainManagerOpen: state.setDomainManagerOpen,
    setDomainQuery: state.setDomainQuery,
    setCurrentDemoUrl: state.setCurrentDemoUrl,
    setChatId: state.setChatId,
    setMessages: state.setMessages,

    // Derived
    isAnyStreaming: derived.isAnyStreaming,
    isAwaitingInput: derived.isAwaitingInput,
    activeVersionId: derived.activeVersionId,
    mediaEnabled: derived.mediaEnabled,
    initialPrompt: derived.initialPrompt,
    auditPromptLoaded: state.auditPromptLoaded,

    // External data
    versions,
    effectiveVersionsList: derived.effectiveVersionsList,
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
    handleFixPreview: builderCallbacks.handleFixPreview,
    handleVersionSelect: builderCallbacks.handleVersionSelect,
    handleToggleVersionPanel: builderCallbacks.handleToggleVersionPanel,
  };
}

export type BuilderViewModel = ReturnType<typeof useBuilderPageController>;
