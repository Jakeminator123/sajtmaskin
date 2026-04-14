"use client";

import type { ChatMessage } from "@/lib/builder/types";
import { buildPromptAssistContext } from "@/lib/builder/promptAssistContext";
import { normalizeBuildIntent } from "@/lib/builder/build-intent";
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
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import { getProject, saveProjectData } from "@/lib/project-client";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptRewrite } from "@/lib/hooks/usePromptRewrite";
import { useInitBrief } from "@/lib/hooks/useInitBrief";
import { useChatMessaging } from "@/lib/hooks/chat/useChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useChatReadiness } from "@/lib/hooks/useChatReadiness";
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
import { useBuilderVmPreview } from "./useBuilderVmPreview";
import { usePreviewSession } from "./usePreviewSession";
import {
  derivePreviewLifecycleState,
  type PreviewLifecycleState,
} from "@/lib/builder/preview-lifecycle";
import {
  isShimOrMissingPreviewUrl,
  resolveAlternatePreviewUrls,
} from "@/lib/gen/preview/legacy/compatibility-shim";
import {
  asRecord,
  parsePreviewOverride,
  pickVersionPreviewUrl,
  versionSummaryHasPreview,
} from "./builder-page-preview-helpers";

/** Max non-404 failures before stopping prompt handoff retries (avoids toast/network spam). */
const MAX_PROMPT_HANDOFF_RETRIES = 5;

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
    chatId, chatIdParam, currentPreviewUrl, customInstructions,
    designTheme, enableBlobMedia, enableImageGenerations, enableThinking,
    entry, entryIntentActive, hasEntryParams, isIntentionalReset, paletteState,
    projectParam, promptId, promptParam, resolvedPrompt, selectedModelTier,
    selectedVersionId, serverProjectChatId, serverProjectDemoUrl,
    serverProjectPreviewOverrideUrl, serverProjectPreviewOverrideVersionId,
    clearedPreviewVersionId,
    showStructuredChat, templateId, externalProjectId,
    setApplyInstructionsOnce, setAppProjectId, setAppProjectName,
    setAuditPromptLoaded, setBuildIntent, setBuildMethod, setChatId,
    setCurrentPreviewUrl, setCurrentPageCode, setCustomInstructions,
    setDesignTheme, setEnableBlobMedia,
    setEnableImageGenerations, setEnableThinking, setEntryIntentActive,
    setExistingUiComponents,
    setIsImageGenerationsSupported, setIsIntentionalReset, setIsMediaEnabled,
    setMessages, setPaletteState, setPreviewRefreshToken, setPromptAssistContext,
    setResolvedPrompt, setSelectedModelTier, setSelectedVersionId,
    setServerProjectChatId, setServerProjectDemoUrl, setServerProjectMessages,
    setServerProjectPreviewOverrideUrl, setServerProjectPreviewOverrideVersionId,
    setClearedPreviewVersionId,
    setShowStructuredChat, setExternalProjectId,
    applyingGenerationSettingsRef, autoProjectInitRef, featureWarnedRef,
    hasLoadedInstructions, hasLoadedInstructionsOnce, lastActiveVersionIdRef,
    lastPaletteSavedRef, lastProjectIdRef,
    loadedGenerationSettingsChatRef, paletteLoadedRef, pendingBriefRef,
    pendingInstructionsOnceRef, pendingInstructionsRef, pendingSpecRef,
    promptAssistContextKeyRef, promptFetchDoneRef,
    promptFetchInFlightRef,
  } = state;

  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
  }, [setPreviewRefreshToken]);

  const resetRecoverAfterBootstrapRef = useRef<(() => void) | null>(null);
  /** Prevents duplicate `createProject` while the dynamic-import path is in flight. */
  const autoProjectCreateInFlightRef = useRef(false);
  const shouldHoldChatHooksForFreshEntry = Boolean(
    chatId && !chatIdParam && !templateId && hasEntryParams && entryIntentActive,
  );
  const readyForChatHooks = Boolean(chatId) && !shouldHoldChatHooksForFreshEntry;
  const chatHooksChatId = readyForChatHooks ? chatId : null;

  // ── External data hooks ──────────────────────────────────────────────
  const { chat, mutate: mutateChat, isError: isChatError, isLoading: isChatLoading } =
    useChat(chatHooksChatId);

  const isAnyStreamingEarly = useMemo(
    () => state.messages.some((m) => Boolean(m.isStreaming)),
    [state.messages],
  );

  const { versions, mutate: mutateVersions } = useVersions(chatHooksChatId, {
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

  const selectedVersionIdRef = useRef<string | null>(null);
  const latestVersionIdRef = useRef<string | null>(null);
  selectedVersionIdRef.current = state.selectedVersionId;
  latestVersionIdRef.current = derived.latestVersionId;

  /** Active live-preview URL for the version (shim slot kept null). */
  const activeVersionAlternatePreview = useMemo(() => {
    const vid = derived.activeVersionId;
    if (!vid) return { shimUrl: null as string | null, storedLivePreviewUrl: null as string | null };
    const v = derived.effectiveVersionsList.find((x) => (x.versionId || x.id) === vid);
    if (!v) return { shimUrl: null, storedLivePreviewUrl: null };
    return resolveAlternatePreviewUrls({
      storedLivePreviewUrl: v.previewUrl,
    });
  }, [derived.activeVersionId, derived.effectiveVersionsList]);

  const { readiness: deployReadiness, isLoading: isDeployReadinessLoading } = useChatReadiness(
    chatHooksChatId,
    derived.activeVersionId,
    {
      isGenerating: isAnyStreamingEarly,
      pauseWhileGenerating: true,
    },
  );

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
    currentPreviewUrl: state.currentPreviewUrl,
    activeVersionId: derived.activeVersionId,
    mediaEnabled: derived.mediaEnabled,
    paletteState: state.paletteState,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    pendingBriefRef: state.pendingBriefRef,
    pendingSpecRef: state.pendingSpecRef,
    hasLoadedInstructions: state.hasLoadedInstructions,
    hasLoadedInstructionsOnce: state.hasLoadedInstructionsOnce,
    router,
    searchParams,
    startUiTransition,
    setChatId: state.setChatId,
    setAppProjectId: state.setAppProjectId,
    setAppProjectName: state.setAppProjectName,
    setPendingProjectName: state.setPendingProjectName,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setPreviewRefreshToken: state.setPreviewRefreshToken,
    setMessages: state.setMessages,
    setIsImportModalOpen: state.setIsImportModalOpen,
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
    setExternalProjectId: state.setExternalProjectId,
    setIsIntentionalReset: state.setIsIntentionalReset,
    setAuthModalReason,
  });

  // ── Deploy actions ───────────────────────────────────────────────────
  const deployActions = useBuilderDeployActions({
    selectedVersionIdRef,
    latestVersionIdRef,
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    deployReadiness,
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
    setSelectedVersionId: state.setSelectedVersionId,
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

  // ── Sandbox preview (Vercel VM) + session recover ───────────────────
  const vmPreview = useBuilderVmPreview({
    isAuthenticated,
    chatId: state.chatId,
    appProjectId: state.appProjectId,
    activeVersionId: derived.activeVersionId,
    effectiveVersionsList: derived.effectiveVersionsList,
    chat: chat as ChatData,
    isAnyStreamingEarly,
    isChatLoading,
    currentPreviewUrl: state.currentPreviewUrl,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    mutateChat,
    mutateVersions,
    isShimOrMissingPreviewUrl,
    onBootstrapRecoverSucceeded: () => resetRecoverAfterBootstrapRef.current?.(),
  });

  const {
    previewBuildError,
    previewProdBuild,
    previewPending,
    previewSessionRecovering,
    activePreviewSessionMeta,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewSessionMeta,
    clearPreviewBuildError,
    clearPreviewSessionState,
    resetPreviewForNewChat,
  } = vmPreview;

  const { handlePreviewSessionSuspect, resetRecoverAttempts } = usePreviewSession({
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    currentPreviewUrl: state.currentPreviewUrl,
    activePreviewSessionMeta,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering: vmPreview.setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef: vmPreview.previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey: vmPreview.setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce: vmPreview.setPreviewBootstrapRetryNonce,
    onRecoverFailed: ({ reason }) => {
      setPreviewBuildError({
        stage: "preview-recover",
        message:
          reason === "status_unavailable"
            ? "Live-preview kunde inte verifieras mot servern efter flera försök."
            : "Live-preview kunde inte återansluta efter flera försök.",
      });
      setPreviewPending(false);
    },
  });
  resetRecoverAfterBootstrapRef.current = resetRecoverAttempts;

  const resetBeforeCreateChat = useCallback(() => {
    setCurrentPreviewUrl(null);
    setPreviewRefreshToken(0);
    resetPreviewForNewChat();
  }, [setCurrentPreviewUrl, setPreviewRefreshToken, resetPreviewForNewChat]);

  // ── Chat messaging ───────────────────────────────────────────────────
  const { isCreatingChat, createNewChat, sendMessage: rawSendMessage, cancelActiveGeneration } =
    useChatMessaging({
      chatId: state.chatId,
      activeVersionId: derived.activeVersionId,
      setChatId: state.setChatId,
      chatIdParam: state.chatIdParam,
      router,
      appProjectId: state.appProjectId,
      linkedProjectId: state.externalProjectId,
      selectedModelTier: state.selectedModelTier,
      enableImageGenerations: state.enableImageGenerations,
      enableImageMaterialization: derived.mediaEnabled,
      enableThinking: state.effectiveThinking,
      chatPrivacy: state.chatPrivacy,
      designThemePreset: state.designTheme,
      systemPrompt: state.customInstructions,
      promptAssistModel: state.promptAssistModel,
      promptAssistDeep: state.promptAssistDeep,
      promptAssistMode: state.promptAssistMode,
      buildIntent: state.resolvedBuildIntent,
      buildMethod: state.buildMethod,
      scaffoldMode: state.scaffoldMode,
      scaffoldId: state.scaffoldId,
      themeColors: state.themeColors,
      paletteState: state.paletteState,
      pendingBriefRef: state.pendingBriefRef,
      mutateVersions,
      setCurrentPreviewUrl: state.setCurrentPreviewUrl,
      setPreviewBuildError,
      setPreviewProdBuild,
      setPreviewPending,
      onPreviewRefresh: bumpPreviewRefreshToken,
      onGenerationComplete: deployActions.handleGenerationComplete,
      onPreviewSessionMeta,
      onLinkedProjectId: (nextId) => state.setExternalProjectId(nextId),
      setMessages: state.setMessages,
      resetBeforeCreateChat,
    });

  const sendMessage = rawSendMessage;

  // ── Prompt rewrite (manual "Förbättra"/"Skriv om") ──────────────────
  const { maybeEnhanceInitialPrompt } = usePromptRewrite({
    model: state.promptAssistModel,
    deep: state.promptAssistDeep,
    imageGenerations: state.enableImageGenerations,
    codeContext: state.promptAssistContext,
    buildIntent: state.resolvedBuildIntent,
    themeColors: state.themeColors,
  });

  // ── Init brief (Deep Brief + fallback addendum) ────────────────────
  const { generateDynamicInstructions } = useInitBrief({
    model: state.promptAssistModel,
    deep: state.promptAssistDeep,
    imageGenerations: state.enableImageGenerations,
    buildIntent: state.resolvedBuildIntent,
    themeColors: state.themeColors,
  });

  // ── Prompt actions ───────────────────────────────────────────────────
  const promptActions = useBuilderPromptActions({
    chatId: state.chatId,
    scaffoldMode: state.scaffoldMode,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    promptAssistModel: state.promptAssistModel,
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
    pendingBriefRef: state.pendingBriefRef,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
    router,
    searchParams,
    setChatId: state.setChatId,
    setMessages: state.setMessages,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setEntryIntentActive: state.setEntryIntentActive,
    setIsPreparingPrompt: state.setIsPreparingPrompt,
    setCustomInstructions: state.setCustomInstructions,
    setPromptAssistModel: state.setPromptAssistModel,
    setPromptAssistDeep: state.setPromptAssistDeep,
      setPromptAssistMode: state.setPromptAssistMode,
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
    currentPreviewUrl: state.currentPreviewUrl,
    sendMessage,
    effectiveVersionsList: derived.effectiveVersionsList,
    bumpPreviewRefreshToken,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setIsVersionPanelCollapsed: state.setIsVersionPanelCollapsed,
  });

  const routeMessages = Array.isArray((chat as { messages?: unknown[] } | null)?.messages)
    ? (((chat as { messages?: ChatMessage[] }).messages) ?? [])
    : [];
  const restoreMessages = routeMessages.length > 0 ? routeMessages : state.serverProjectMessages;
  const restoreMessagesChatId = routeMessages.length > 0 ? state.chatId : state.serverProjectChatId;

  // ── Persisted messages ───────────────────────────────────────────────
  usePersistedChatMessages({
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    messages: state.messages,
    setMessages: state.setMessages,
    serverMessages: restoreMessages,
    serverMessagesChatId: restoreMessagesChatId,
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
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setIsTemplateLoading: state.setIsTemplateLoading,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
  });

  // ── Auto-generate ref for kostnadsfri flow ───────────────────────────
  const autoGenerateTriggeredRef = useRef(false);
  const [promptFetchRetryNonce, setPromptFetchRetryNonce] = useState(0);

  // Reset handoff retry counter when navigating to a different prompt id.
  useEffect(() => {
    setPromptFetchRetryNonce(0);
  }, [promptId]);

  // =====================================================================
  // EFFECTS — cross-cutting concerns, localStorage sync, URL sync
  // =====================================================================

  // Prompt fetch
  useEffect(() => {
    if (entry.isTemplateEntry) return;
    if (!entry.shouldFetchPromptHandoff || !promptId) return;
    if (promptFetchDoneRef.current === promptId) return;
    if (promptFetchInFlightRef.current === promptId) return;
    promptFetchInFlightRef.current = promptId;
    let isActive = true;
    const controller = new AbortController();
    let retryTimer: number | null = null;

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
          const failure = new Error(data?.error || "Prompten hittades inte") as Error & {
            status?: number;
          };
          failure.status = response.status;
          throw failure;
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
        const status = typeof (error as { status?: unknown })?.status === "number"
          ? ((error as { status?: number }).status ?? null)
          : null;
        if (status === 404) {
          debugLog("builder", "Prompt handoff missing", error);
          toast.error("Prompten hittades inte eller har redan använts.");
          setResolvedPrompt(null);
          setEntryIntentActive(false);
          promptFetchDoneRef.current = promptId;
          shouldClearPromptId = true;
          return;
        }
        debugLog("builder", "Prompt handoff fetch failed", error);
        if (promptFetchRetryNonce >= MAX_PROMPT_HANDOFF_RETRIES) {
          toast.error("Kunde inte hämta prompten efter flera försök. Ladda om sidan eller försök senare.", {
            id: "prompt-handoff-gave-up",
          });
          promptFetchDoneRef.current = promptId;
          shouldClearPromptId = true;
          return;
        }
        toast.error("Kunde inte hämta prompten just nu. Försök igen.", {
          id: "prompt-handoff-retry",
        });
        const delayMs = Math.min(1500 * 2 ** promptFetchRetryNonce, 12_000);
        retryTimer = window.setTimeout(() => {
          if (!isActive) return;
          setPromptFetchRetryNonce((value) => value + 1);
        }, delayMs);
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
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      controller.abort();
      if (promptFetchInFlightRef.current === promptId) {
        promptFetchInFlightRef.current = null;
      }
    };
  }, [
    entry.isTemplateEntry,
    entry.shouldFetchPromptHandoff,
    promptId,
    promptFetchDoneRef,
    promptFetchInFlightRef,
    promptFetchRetryNonce,
    setEntryIntentActive,
    setResolvedPrompt,
    setAppProjectId,
    setAuditPromptLoaded,
    router,
    searchParams,
  ]);

  // Auth fetch
  useEffect(() => {
    fetchUser().catch(() => {});
  }, [fetchUser]);

  // Build intent / method sync
  useEffect(() => {
    setBuildIntent(normalizeBuildIntent(buildIntentParam));
  }, [buildIntentParam, setBuildIntent]);

  useEffect(() => {
    setBuildMethod(entry.buildMethodParam);
  }, [entry.buildMethodParam, setBuildMethod]);

  // Auth modal
  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated) setAuthModalReason(null);
  }, [isAuthLoading, isAuthenticated]);

  // Project param -> appProjectId
  useEffect(() => {
    if (projectParam) {
      setAppProjectId(projectParam);
    }
  }, [projectParam, setAppProjectId]);

  // Route entries without an explicit chatId must not inherit stale chat state
  // from the previous builder session. This is especially important when we
  // arrive via prompt handoff (`promptId`) or a fresh project URL.
  // Skip this reset if a create-chat request is in flight (chatId will arrive via SSE).
  useEffect(() => {
    if (chatIdParam) return;
    if (isCreatingChat) return;

    const routeRepresentsFreshBuilderEntry =
      entry.entryKind === "prompt-handoff" ||
      entry.entryKind === "template" ||
      entry.entryKind === "audit" ||
      Boolean(projectParam);
    if (!routeRepresentsFreshBuilderEntry) return;

    const shouldResetChatState = Boolean(chatId);
    const shouldResetResolvedPrompt = promptId !== null || promptParam !== null;
    if (!shouldResetChatState && !shouldResetResolvedPrompt) return;

    pendingBriefRef.current = null;
    pendingSpecRef.current = null;

    if (shouldResetChatState) {
      setChatId(null);
      setMessages([]);
      setCurrentPreviewUrl(null);
      setSelectedVersionId(null);
      setExternalProjectId(null);
    }

    if (shouldResetResolvedPrompt) {
      promptFetchDoneRef.current = null;
      setResolvedPrompt(promptParam?.trim() || null);
    }
  }, [
    chatIdParam,
    projectParam,
    entry.entryKind,
    chatId,
    isCreatingChat,
    promptId,
    promptParam,
    pendingBriefRef,
    pendingSpecRef,
    promptFetchDoneRef,
    setChatId,
    setMessages,
    setCurrentPreviewUrl,
    setSelectedVersionId,
    setExternalProjectId,
    setResolvedPrompt,
  ]);

  // Load latest chat for project when project is in URL but chatId is not
  useEffect(() => {
    if (!projectParam || chatIdParam || chatId) return;
    if (entry.entryKind !== "project-restore") return;
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
        };
        const restoredChatId =
          typeof data.chatId === "string" && data.chatId.trim().length > 0
            ? data.chatId
            : null;

        if (restoredChatId && isActive) {
          setChatId(restoredChatId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", projectParam!);
          params.set("chatId", restoredChatId);
          router.replace(`/builder?${params.toString()}`);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("builder", "Failed to load project chat", error);
      }
    };

    void loadProjectChat();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [projectParam, chatIdParam, chatId, entry.entryKind, setChatId, router, searchParams]);

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
    if (isAuthLoading) return;
    if (autoProjectInitRef.current) return;
    if (autoProjectCreateInFlightRef.current) return;
    if (appProjectId || projectParam || chatIdParam || hasEntryParams) {
      return;
    }

    let restored: string | null = null;
    try {
      restored = localStorage.getItem("sajtmaskin:lastProjectId");
    } catch {
      restored = null;
    }

    if (restored) {
      autoProjectInitRef.current = true;
      setAppProjectId(restored);
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", restored);
      router.replace(`/builder?${params.toString()}`);
      return;
    }

    autoProjectCreateInFlightRef.current = true;
    import("@/lib/project-client")
      .then(({ createProject }) =>
        createProject("Untitled Project")
          .then((project) => {
            autoProjectInitRef.current = true;
            autoProjectCreateInFlightRef.current = false;
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
            debugLog("builder", "Auto project create failed", error);
            autoProjectCreateInFlightRef.current = false;
            autoProjectInitRef.current = false;
            const status = (error as { status?: number })?.status;
            if (status === 401 || status === 403) {
              setAuthModalReason("builder");
            } else {
              toast.error("Kunde inte skapa projekt automatiskt. Försök igen eller logga in.");
            }
          }),
      )
      .catch((err) => {
        autoProjectCreateInFlightRef.current = false;
        autoProjectInitRef.current = false;
        debugLog("builder", "Failed to load project-client for auto init", err);
      });
  }, [
    appProjectId,
    projectParam,
    chatIdParam,
    hasEntryParams,
    isAuthLoading,
    autoProjectInitRef,
    setAppProjectId,
    router,
    searchParams,
    setAuthModalReason,
  ]);

  // Entry intent sync
  useEffect(() => {
    setEntryIntentActive(entry.entryKind === "prompt-handoff" || entry.entryKind === "audit");
  }, [entry.entryKind, setEntryIntentActive]);

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
      setServerProjectPreviewOverrideUrl(null);
      setServerProjectPreviewOverrideVersionId(null);
      setClearedPreviewVersionId(null);
      return;
    }
    const previousProjectId = lastProjectIdRef.current;
    lastProjectIdRef.current = appProjectId;
    if (previousProjectId !== appProjectId) {
      setServerProjectChatId(null);
      setServerProjectMessages([]);
      setServerProjectDemoUrl(null);
      setServerProjectPreviewOverrideUrl(null);
      setServerProjectPreviewOverrideVersionId(null);
      setClearedPreviewVersionId(null);
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
        const previewOverride = parsePreviewOverride(asRecord(result.data?.meta)?.previewOverride);
        setServerProjectPreviewOverrideUrl(previewOverride.url);
        setServerProjectPreviewOverrideVersionId(previewOverride.versionId);
      })
      .catch((error) => {
        debugLog("builder", "Failed to load project name", error);
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
  }, [appProjectId, setAppProjectName, setPaletteState, paletteLoadedRef, lastPaletteSavedRef, lastProjectIdRef, setServerProjectChatId, setServerProjectMessages, setServerProjectDemoUrl, setServerProjectPreviewOverrideUrl, setServerProjectPreviewOverrideVersionId, setClearedPreviewVersionId, setAppProjectId]);

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
      debugLog("builder", "Failed to persist palette state", error);
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
        const { blobEnabled, imageGenerationsEnabled, reasons } = flags;
        if (!isActive) return;
        setIsMediaEnabled(blobEnabled);
        setIsImageGenerationsSupported(imageGenerationsEnabled);
        if (!imageGenerationsEnabled) setEnableImageGenerations(false);
        if (!imageGenerationsEnabled && !featureWarnedRef.current.imageGen) {
          featureWarnedRef.current.imageGen = true;
          const reason = reasons?.imageGenerations || "AI-konfiguration saknas";
          toast.error(`Bildgenerering är avstängd: ${reason}`);
        }
        if (imageGenerationsEnabled && !blobEnabled && !featureWarnedRef.current.blob) {
          featureWarnedRef.current.blob = true;
          const reason = reasons?.vercelBlob || "BLOB_READ_WRITE_TOKEN saknas";
          toast(`Blob saknas: ${reason}. Bilder kan saknas i preview.`);
        }
        debugLog("AI", "Builder feature flags resolved", {
          imageGenerationsEnabled,
          blobEnabled,
        });
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
        debugLog("builder", "GitHub OAuth unsafe return URL sanitized");
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
    if (!entry.isAuditEntry) return;
    if (!promptId) setAuditPromptLoaded(true);
  }, [entry.isAuditEntry, promptId, setAuditPromptLoaded]);

  // Chat not found
  useEffect(() => {
    if (!chatId || !isChatError) return;
    debugLog("builder", "Chat not found or error loading chat", chatId);
    toast.error("Chatten kunde inte hittas. Skapar ny session...");
    // Prevent a brief URL/state race where chatIdParam gets re-applied
    // before `router.replace("/builder")` has cleared query params.
    setIsIntentionalReset(true);
    try {
      localStorage.removeItem("sajtmaskin:lastChatId");
    } catch {
      /* ignore */
    }
    pendingBriefRef.current = null;
    pendingSpecRef.current = null;
    setChatId(null);
    setCurrentPreviewUrl(null);
    setMessages([]);
    router.replace("/builder");
  }, [chatId, isChatError, router, setChatId, setCurrentPreviewUrl, setMessages, pendingBriefRef, pendingSpecRef, setIsIntentionalReset]);

  // External project id sync
  useEffect(() => {
    if (!chatId) {
      setExternalProjectId(null);
      return;
    }
    if (
      derived.chatExternalProjectId &&
      derived.chatExternalProjectId !== externalProjectId
    ) {
      setExternalProjectId(derived.chatExternalProjectId);
    }
  }, [chatId, derived.chatExternalProjectId, externalProjectId, setExternalProjectId]);

  // Reset selected version on chat change
  useEffect(() => {
    setSelectedVersionId(null);
    setExternalProjectId(null);
  }, [chatId, setSelectedVersionId, setExternalProjectId]);

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

  // Preview URL sync when active version changes
  useEffect(() => {
    const didChangeVersion = lastActiveVersionIdRef.current !== derived.activeVersionId;
    lastActiveVersionIdRef.current = derived.activeVersionId;

    if (didChangeVersion && clearedPreviewVersionId && clearedPreviewVersionId !== derived.activeVersionId) {
      setClearedPreviewVersionId(null);
    }

    // Do not skip when only `currentPreviewUrl` is set: the active version can gain `previewUrl` later
    // (async preview session + SWR refresh) while `activeVersionId` stays the same — keep the live preview URL when it arrives.
    if (!didChangeVersion && clearedPreviewVersionId === derived.activeVersionId) return;

    const activeVersionMatch = derived.activeVersionId
      ? derived.effectiveVersionsList.find(
          (v) => v.versionId === derived.activeVersionId || v.id === derived.activeVersionId,
        )
      : undefined;
    const persistedPreviewOverride =
      derived.activeVersionId &&
      serverProjectPreviewOverrideVersionId === derived.activeVersionId &&
      serverProjectPreviewOverrideUrl
        ? serverProjectPreviewOverrideUrl
        : null;
    const chatObj = chat as ChatData;
    const canUseServerDemoUrl =
      !serverProjectChatId || !chatId || serverProjectChatId === chatId;
    const userSelectedActiveVersion =
      Boolean(selectedVersionId) &&
      Boolean(activeVersionMatch) &&
      (activeVersionMatch?.versionId === selectedVersionId || activeVersionMatch?.id === selectedVersionId);
    const firstUsableVersion =
      derived.effectiveVersionsList.find((version) => canExposeEnginePreview(version)) ??
      derived.effectiveVersionsList[0];
    const chatLatest = chatObj?.latestVersion;
    const chatLevelPreview =
      chatLatest && canExposeEnginePreview(chatLatest)
        ? typeof chatLatest.previewUrl === "string" && chatLatest.previewUrl.trim()
          ? chatLatest.previewUrl.trim()
          : null
        : null;

    const selectedVersionPreview =
      persistedPreviewOverride ||
      pickVersionPreviewUrl(activeVersionMatch, { allowFailed: userSelectedActiveVersion }) ||
      null;
    const fallbackPreviewUrl =
      chatLevelPreview ||
      pickVersionPreviewUrl(firstUsableVersion) ||
      (canUseServerDemoUrl && typeof serverProjectDemoUrl === "string" && serverProjectDemoUrl.trim()
        ? serverProjectDemoUrl.trim()
        : null) ||
      null;
    const nextDemoUrl = userSelectedActiveVersion ? selectedVersionPreview : selectedVersionPreview || fallbackPreviewUrl;

    const currentIsLivePreview = currentPreviewUrl != null && !isShimOrMissingPreviewUrl(currentPreviewUrl);
    const nextIsShimPreview = nextDemoUrl != null && isShimOrMissingPreviewUrl(nextDemoUrl);
    if (
      currentIsLivePreview &&
      nextIsShimPreview &&
      versionSummaryHasPreview(activeVersionMatch, { allowFailed: userSelectedActiveVersion })
    ) {
      return;
    }

    if (!nextDemoUrl && didChangeVersion && currentPreviewUrl) {
      setCurrentPreviewUrl(null);
      setPreviewRefreshToken(Date.now());
      return;
    }

    if (nextDemoUrl && nextDemoUrl !== currentPreviewUrl) {
      setCurrentPreviewUrl(nextDemoUrl);
      setPreviewRefreshToken(Date.now());
      if (!isShimOrMissingPreviewUrl(nextDemoUrl)) {
        setPreviewPending(false);
      }
    }
  }, [derived.activeVersionId, selectedVersionId, chat, currentPreviewUrl, derived.effectiveVersionsList, serverProjectDemoUrl, serverProjectChatId, chatId, lastActiveVersionIdRef, serverProjectPreviewOverrideUrl, serverProjectPreviewOverrideVersionId, clearedPreviewVersionId, setClearedPreviewVersionId, setCurrentPreviewUrl, setPreviewRefreshToken, setPreviewPending]);

  const previewLifecycle: PreviewLifecycleState = useMemo(
    () =>
      derivePreviewLifecycleState({
        previewBuildErrorStage: previewBuildError?.stage ?? null,
        hasPreviewBuildError: Boolean(previewBuildError),
        previewSessionRecovering,
        previewPending,
        currentPreviewUrl,
      }),
    [previewBuildError, previewSessionRecovering, previewPending, currentPreviewUrl],
  );

  // Prompt assist context fetch
  useEffect(() => {
    const contextKey =
      chatId && derived.activeVersionId
        ? `${chatId}:${derived.activeVersionId}:${state.previewRefreshToken}`
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
          `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(derived.activeVersionId)}`,
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
  }, [chatId, derived.activeVersionId, state.previewRefreshToken, promptAssistContextKeyRef, setPromptAssistContext, setExistingUiComponents, setCurrentPageCode]);

  const handleFilesSaved = useCallback(() => {
    promptAssistContextKeyRef.current = null;
    promptFetchDoneRef.current = null;
    setPreviewRefreshToken(Date.now());
  }, [promptAssistContextKeyRef, promptFetchDoneRef, setPreviewRefreshToken]);

  // Auto-start generation for kostnadsfri flow
  useEffect(() => {
    if (!isAuthenticated) return;
    if (templateId) return;
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
  }, [isAuthenticated, templateId, buildMethod, resolvedPrompt, chatId, setSelectedModelTier, promptActions]);

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
    buildMethod: state.buildMethod,
    selectedModelTier: state.selectedModelTier,
    promptAssistModel: state.promptAssistModel,
    promptAssistDeep: state.promptAssistDeep,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    enableImageGenerations: state.enableImageGenerations,
    enableThinking: state.enableThinking,
    chatPrivacy: state.chatPrivacy,
    setChatPrivacy: state.setChatPrivacy,
    isImageGenerationsSupported: state.isImageGenerationsSupported,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    showStructuredChat: state.showStructuredChat,
    tipsEnabled,
    designTheme: state.designTheme,
    scaffoldMode: state.scaffoldMode,
    scaffoldId: state.scaffoldId,
    isImportModalOpen: state.isImportModalOpen,
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
    deployReadiness,
    isDeployReadinessLoading,
    externalProjectId: state.externalProjectId,
    paletteState: state.paletteState,
    currentPreviewUrl: state.currentPreviewUrl,
    previewBuildError,
    previewProdBuild,
    previewPending,
    activePreviewSessionId: activePreviewSessionMeta?.previewSessionId ?? null,
    previewLifecycle,
    handlePreviewSessionSuspect,
    clearPreviewBuildError,
    clearPreviewSessionState,
    serverProjectPreviewOverrideVersionId: state.serverProjectPreviewOverrideVersionId,
    previewRefreshToken: state.previewRefreshToken,
    bumpPreviewRefreshToken,
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
    setScaffoldMode: state.setScaffoldMode,
    setScaffoldId: state.setScaffoldId,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameError: state.setDeployNameError,
    setDomainSearchOpen: state.setDomainSearchOpen,
    setDomainManagerOpen: state.setDomainManagerOpen,
    setDomainQuery: state.setDomainQuery,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setPreviewPending,
    setServerProjectPreviewOverrideUrl: state.setServerProjectPreviewOverrideUrl,
    setServerProjectPreviewOverrideVersionId: state.setServerProjectPreviewOverrideVersionId,
    setClearedPreviewVersionId: state.setClearedPreviewVersionId,
    setChatId: state.setChatId,
    setMessages: state.setMessages,

    // Derived
    isAnyStreaming: derived.isAnyStreaming,
    isAwaitingInput: derived.isAwaitingInput,
    activeVersionId: derived.activeVersionId,
    latestVersionId: derived.latestVersionId,
    mediaEnabled: derived.mediaEnabled,
    initialPrompt: derived.initialPrompt,
    auditPromptLoaded: state.auditPromptLoaded,

    // External data
    versions,
    effectiveVersionsList: derived.effectiveVersionsList,
    activeVersionAlternatePreview,
    mutateVersions,

    // Messaging
    isCreatingChat,
    sendMessage,
    cancelActiveGeneration,

    // Project actions
    applyAppProjectId: projectActions.applyAppProjectId,
    handleSaveProject: projectActions.handleSaveProject,
    resetToNewChat: useCallback(() => {
      if (state.chatId && state.messages.length > 0) {
        if (!window.confirm("Vill du verkligen starta en ny chat? Osparade ändringar försvinner.")) {
          return;
        }
      }
      autoProjectInitRef.current = false;
      projectActions.resetToNewChat();
    }, [projectActions, autoProjectInitRef, state.chatId, state.messages.length]),

    // Deploy actions
    handleOpenDeployDialog: deployActions.handleOpenDeployDialog,
    handleDomainSearch: deployActions.handleDomainSearch,
    handleConfirmDeploy: deployActions.handleConfirmDeploy,

    // Prompt actions
    handlePromptAssistModelChange: promptActions.handlePromptAssistModelChange,
    handlePromptAssistModeReset: promptActions.clearPromptAssistMode,
    handlePromptEnhance: promptActions.handlePromptEnhance,
    handlePromptRewrite: promptActions.handlePromptRewrite,
    requestCreateChat: promptActions.requestCreateChat,
    handleStartFromRegistry: promptActions.handleStartFromRegistry,
    handleStartFromTemplate: promptActions.handleStartFromTemplate,
    templateSwitchDialog: promptActions.templateSwitchDialog,
    confirmTemplateSwitchDialog: promptActions.confirmTemplateSwitchDialog,
    cancelTemplateSwitchDialog: promptActions.cancelTemplateSwitchDialog,
    handleGoHome: promptActions.handleGoHome,
    handlePaletteSelection: promptActions.handlePaletteSelection,

    // Preview / version callbacks
    handleClearPreview: builderCallbacks.handleClearPreview,
    handleFixPreview: builderCallbacks.handleFixPreview,
    handleVersionSelect: builderCallbacks.handleVersionSelect,
    handleToggleVersionPanel: builderCallbacks.handleToggleVersionPanel,
    handleFilesSaved,

  };
}

export type BuilderViewModel = ReturnType<typeof useBuilderPageController>;
