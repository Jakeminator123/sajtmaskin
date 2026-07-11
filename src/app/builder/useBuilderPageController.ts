"use client";

import type { ChatMessage } from "@/lib/builder/types";
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
import {
  canExposeEnginePreview,
  resolveEngineVersionLifecycleStatus,
} from "@/lib/db/engine-version-lifecycle";
import { getProject, saveProjectData } from "@/lib/project-client";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { useInitBrief } from "@/lib/hooks/useInitBrief";
import { useChatMessaging } from "@/lib/hooks/chat/useChatMessaging";
import { useResumePendingVerification } from "@/lib/hooks/chat/useResumePendingVerification";
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
import { useDeploymentHistory } from "./useDeploymentHistory";
import { useProjectThumbnail } from "./useProjectThumbnail";
import { useBuilderVmPreview } from "./useBuilderVmPreview";
import { usePreviewSession } from "./usePreviewSession";
import {
  derivePreviewLifecycleState,
  type PreviewLifecycleState,
} from "@/lib/builder/preview-lifecycle";
import {
  isCompatibilityShimPreviewUrl,
  isShimOrMissingPreviewUrl,
} from "@/lib/gen/preview/legacy/compatibility-shim";
import {
  isTier2LivePreviewUrl,
  resolveAlternatePreviewUrls,
} from "@/lib/gen/preview/preview-url-classifier";
import {
  asRecord,
  parsePreviewOverride,
  pickVersionPreviewUrl,
  shouldPreserveUserRouteNavigation,
  shouldRetainLastGoodPreviewOnVersionChange,
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
    setMessages, setPaletteState, setPreviewRefreshToken,
    setResolvedPrompt, setSelectedModelTier, setSelectedVersionId,
    setServerProjectChatId, setServerProjectDemoUrl, setServerProjectMessages,
    setServerProjectPreviewOverrideUrl, setServerProjectPreviewOverrideVersionId,
    setClearedPreviewVersionId,
    setShowStructuredChat, setExternalProjectId,
    applyingGenerationSettingsRef, autoProjectInitRef, featureWarnedRef,
    hasLoadedInstructions, hasLoadedInstructionsOnce, lastActiveVersionIdRef,
    lastPaletteSavedRef, lastProjectIdRef,
    loadedGenerationSettingsChatRef, paletteLoadedRef, pendingBriefRef,
    pendingInstructionsOnceRef, pendingInstructionsRef,
    filesContextKeyRef, promptFetchDoneRef,
    promptFetchInFlightRef,
  } = state;

  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
  }, [setPreviewRefreshToken]);

  // Område 6-3 punkt 1: deterministic post-check completion → version-status
  // refetch. The post-generation check flow calls `onVersionStatusRefresh`
  // in its `finally`, which bumps this nonce; `useVersionStatus` reads it as
  // `refreshNonce` and does a guaranteed final fetch AFTER `/product-postcheck`
  // has emitted any late `version.degraded`. Must stay a stable callback
  // (empty deps; the setState setter is stable) so it never re-triggers
  // downstream effects on every render.
  const [versionStatusNonce, setVersionStatusNonce] = useState(0);
  const bumpVersionStatusRefresh = useCallback(() => {
    setVersionStatusNonce((n) => n + 1);
  }, []);

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

  const { versions, chatStatus, mutate: mutateVersions } = useVersions(chatHooksChatId, {
    isGenerating: isAnyStreamingEarly,
    pauseWhileGenerating: true,
  });

  // P0 stream-abort recovery (2026-04-26). When the chat has no versions
  // and the most recent run is in `aborted` status, we treat it as
  // "versionless aborted" — the preview empty-state shows "Starta om
  // generation" instead of "Försök reparera preview", and the parent
  // component will route a click into a fresh chat rather than a
  // followup_general against the dead chatId. Failed runs (verifier
  // rejected real content) do NOT count here — those still have a
  // version to repair.
  const versionlessAborted = useMemo(() => {
    if (Array.isArray(versions) && versions.length > 0) return false;
    if (!chatStatus) return false;
    if (chatStatus.hasVersion) return false;
    return chatStatus.status === "aborted";
  }, [versions, chatStatus]);

  const repairAvailableToastShownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!Array.isArray(versions) || versions.length === 0) return;
    const latest = versions[0] as Record<string, unknown> | undefined;
    if (!latest) return;
    const vid = typeof latest.id === "string" ? latest.id : null;
    const state = typeof latest.verificationState === "string" ? latest.verificationState : null;
    if (vid && state === "repair_available" && !repairAvailableToastShownRef.current.has(vid)) {
      repairAvailableToastShownRef.current.add(vid);
      toast.message("Serverreparation tillgänglig", {
        description: "Acceptera reparationen i versionspanelen för att applicera fixen.",
      });
    }
  }, [versions]);

  // F2-promotion körs från webbläsaren (post-checks → /quality-gate). Om
  // fliken stängdes/navigerades i fönstret efter finalize blir versionen
  // strandad som draft/pending för alltid (watchdogen rör medvetet inte
  // F2-pending). Denna hook återupptar verify-lanen för en strandad senaste
  // version vid nästa builder-besök. Se useResumePendingVerification.
  useResumePendingVerification({
    chatId: chatHooksChatId,
    versions,
    isStreaming: isAnyStreamingEarly,
    mutateVersions,
    onVersionStatusRefresh: bumpVersionStatusRefresh,
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

  /** Active live-preview URL for the version. */
  const activeVersionAlternatePreview = useMemo(() => {
    const vid = derived.activeVersionId;
    if (!vid) return { storedLivePreviewUrl: null as string | null };
    const v = derived.effectiveVersionsList.find((x) => (x.versionId || x.id) === vid);
    if (!v) return { storedLivePreviewUrl: null };
    return resolveAlternatePreviewUrls({
      storedLivePreviewUrl: v.previewUrl,
    });
  }, [derived.activeVersionId, derived.effectiveVersionsList]);

  const activeVersionFailedWithoutPreviewUrl = useMemo(() => {
    const vid = derived.activeVersionId;
    if (!vid) return false;
    const activeVersion = derived.effectiveVersionsList.find(
      (version) => (version.versionId || version.id) === vid,
    );
    if (!activeVersion) return false;
    // `allowFailed: true` krävs (VADE, PR #381): utan den short-circuitar
    // versionSummaryHasPreview till false för ALLA failade versioner
    // (canExposeEnginePreview-gaten), så en failad version MED egen
    // previewUrl skulle feldetekteras som "utan preview" och få resyncen
    // undertryckt — den ska tvärtom få resynca till sin egen session.
    return (
      resolveEngineVersionLifecycleStatus(activeVersion) === "failed" &&
      !versionSummaryHasPreview(activeVersion, { allowFailed: true })
    );
  }, [derived.activeVersionId, derived.effectiveVersionsList]);

  const {
    readiness: deployReadiness,
    isLoading: isDeployReadinessLoading,
    mutate: mutateDeployReadiness,
  } = useChatReadiness(chatHooksChatId, derived.activeVersionId, {
    isGenerating: isAnyStreamingEarly,
    pauseWhileGenerating: true,
  });
  const handleDeterministicF3Settled = useCallback(
    (payload: { versionId: string; selectVersion: boolean }) => {
      if (payload.selectVersion) {
        setSelectedVersionId(payload.versionId);
      }
      void mutateVersions();
      bumpVersionStatusRefresh();
      void mutateDeployReadiness();
    },
    [
      bumpVersionStatusRefresh,
      mutateDeployReadiness,
      mutateVersions,
      setSelectedVersionId,
    ],
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

  // ── Publish-state hydration (DB) ────────────────────────────────────
  // Rehydrate the "published"/"publish changes" state on mount so a reload
  // knows the live deployment + hosting project. The SSE stream (below) still
  // drives the in-session build/ready transitions and takes precedence.
  const {
    project: hydratedProject,
    liveDeployment,
    latestFailedDeployment,
    hydrationFailed: deploymentHistoryHydrationFailed,
    refetch: refetchDeploymentHistory,
  } = useDeploymentHistory(chatHooksChatId);
  const hydratedVercelProjectName = hydratedProject?.vercelProjectName ?? null;

  // ── Project thumbnail (Mina projekt) ─────────────────────────────────
  // Fire-and-forget: screenshot the live preview → app_projects.thumbnail_path.
  useProjectThumbnail({
    appProjectId: state.appProjectId,
    previewUrl: state.currentPreviewUrl,
    versionId: derived.activeVersionId,
  });

  // ── Deploy actions ───────────────────────────────────────────────────
  const deployActions = useBuilderDeployActions({
    selectedVersionIdRef,
    latestVersionIdRef,
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    activeDeploymentId: state.activeDeploymentId,
    deployReadiness,
    isDeploying: state.isDeploying,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    domainQuery: state.domainQuery,
    deployNameInput: state.deployNameInput,
    isDeployNameSaving: state.isDeployNameSaving,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,
    hydratedProjectName: hydratedVercelProjectName,
    applyInstructionsOnce: state.applyInstructionsOnce,
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

  // BB#deploy3/A#5: felstate + "Publicera om med fix" överlever sidladdning.
  // `activeDeploymentId` sattes tidigare bara av POST-deployen i samma session,
  // så efter reload försvann headerns felstate/byggloggslänk och repair-knappen
  // no-op:ade trots att den failade deployment-raden finns kvar i DB. Hydrera
  // från historiken när den NYASTE raden är terminal `error` — SSE-endpointen
  // skickar terminal-snapshotten direkt och stänger, så ingen poll startar.
  const failedDeploymentHydratedRef = useRef<string | null>(null);
  const setActiveDeploymentId = state.setActiveDeploymentId;
  useEffect(() => {
    if (!latestFailedDeployment) return;
    if (state.activeDeploymentId) return;
    if (failedDeploymentHydratedRef.current === latestFailedDeployment.id) return;
    failedDeploymentHydratedRef.current = latestFailedDeployment.id;
    setActiveDeploymentId(latestFailedDeployment.id);
  }, [latestFailedDeployment, state.activeDeploymentId, setActiveDeploymentId]);

  // After an in-session deploy completes (SSE "ready"), refetch the history so
  // the hydrated live deployment (URL + versionId) becomes the source of truth
  // and the header settles on the correct "Publicerad"/"Publicera ändringar".
  const deployReadyRefetchedRef = useRef(false);
  useEffect(() => {
    if (deploymentStatus.status !== "ready") {
      deployReadyRefetchedRef.current = false;
      return;
    }
    if (deployReadyRefetchedRef.current) return;
    deployReadyRefetchedRef.current = true;
    refetchDeploymentHistory();
  }, [deploymentStatus.status, refetchDeploymentHistory]);

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

  const { handlePreviewSessionSuspect, forcePreviewResync, resetRecoverAttempts, versionMismatchPayload } = usePreviewSession({
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    activeVersionFailedWithoutPreviewUrl,
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
      // 5-2 stale-base gate: the client's current notion of the newest version,
      // distinct from `activeVersionId` (which can be a deliberately-selected
      // older version). Forwarded as `meta.engineLatestKnownVersionId`.
      latestKnownVersionId: derived.latestVersionId,
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
      onVersionStatusRefresh: bumpVersionStatusRefresh,
      onDeterministicF3Settled: handleDeterministicF3Settled,
      onGenerationComplete: deployActions.handleGenerationComplete,
      onPreviewSessionMeta,
      onLinkedProjectId: (nextId) => state.setExternalProjectId(nextId),
      setMessages: state.setMessages,
      resetBeforeCreateChat,
    });

  const sendMessage = rawSendMessage;

  // ── Init brief (Deep Brief) ─────────────────────────────────────────
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
    templateId: state.templateId,
    scaffoldMode: state.scaffoldMode,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    promptAssistModel: state.promptAssistModel,
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
    setPromptAssistMode: state.setPromptAssistMode,
    setDesignTheme: state.setDesignTheme,
    setPaletteState: state.setPaletteState,
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
    setChatId(null);
    setCurrentPreviewUrl(null);
    setMessages([]);
    router.replace("/builder");
  }, [chatId, isChatError, router, setChatId, setCurrentPreviewUrl, setMessages, pendingBriefRef, setIsIntentionalReset]);

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

  // M#sel1: fast-edit (quick edit) persists a NEW minor version and selects it
  // BEFORE the `mutateVersions()` refetch has landed — so the freshly created
  // id is not yet in `versionIdSet` and the guard below used to clear the
  // selection back to the old version. Track the freshly created id and give
  // it a grace window until the refetch catches up.
  const pendingCreatedVersionRef = useRef<{ id: string; ts: number } | null>(null);
  const FRESH_VERSION_GRACE_MS = 15_000;

  useEffect(() => {
    if (!selectedVersionId) return;
    if (!derived.versionIdSet.has(selectedVersionId)) {
      const pending = pendingCreatedVersionRef.current;
      if (
        pending &&
        pending.id === selectedVersionId &&
        Date.now() - pending.ts < FRESH_VERSION_GRACE_MS
      ) {
        // Freshly created version — versions refetch in flight; don't bounce.
        return;
      }
      setSelectedVersionId(null);
    } else if (pendingCreatedVersionRef.current?.id === selectedVersionId) {
      // The refetch landed; the id is now canonical.
      pendingCreatedVersionRef.current = null;
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

    // Hard guard: never downgrade an established tier-2 (VM/live) preview URL
    // back to a compatibility shim URL within the same active version. The
    // shim renders raw JSX without Tailwind and shows a blue overlay, which
    // is jarring when the live preview is already running. This happens when
    // the persisted version row in the DB still has a shim URL while the SSE
    // stream has already set the tier-2 URL on the client. Without this guard
    // the version-sync effect re-renders and overwrites the live URL.
    if (
      currentPreviewUrl != null &&
      isTier2LivePreviewUrl(currentPreviewUrl) &&
      nextDemoUrl != null &&
      isCompatibilityShimPreviewUrl(nextDemoUrl) &&
      !didChangeVersion
    ) {
      return;
    }

    if (
      currentIsLivePreview &&
      nextIsShimPreview &&
      versionSummaryHasPreview(activeVersionMatch, { allowFailed: userSelectedActiveVersion })
    ) {
      return;
    }

    if (!nextDemoUrl && didChangeVersion && currentPreviewUrl) {
      // Keep the last-good live (tier-2/VM) preview visible while the newly
      // active version is still spinning up its own preview (no previewUrl in
      // the versions list yet). Blanking here was the "white preview" flash on
      // follow-up completion: the client auto-selects the freshly generated
      // draft the instant the stream ends — seconds before its VM preview is
      // running. VM bootstrap + preview-session polling replace this URL once
      // the new preview is ready, and the version_mismatch / "startar preview"
      // overlays render on top of the retained frame instead of a white panel.
      if (
        shouldRetainLastGoodPreviewOnVersionChange({
          didChangeVersion,
          nextDemoUrl,
          currentPreviewUrl,
          // Retain only for a just-generated follow-up version: either its row
          // hasn't arrived from the `/versions` refetch yet (`!activeVersionMatch`
          // — true on the first render after `done`, before `latestVersionId`
          // catches up) OR it is the newest non-failed version. A manually
          // selected OLDER version already in the list is neither, so we never
          // pin the previous frame over a different, user-chosen version.
          activeVersionIsFreshOrLatest:
            !activeVersionMatch ||
            (Boolean(derived.activeVersionId) &&
              derived.activeVersionId === derived.latestVersionId),
        })
      ) {
        return;
      }
      setCurrentPreviewUrl(null);
      setPreviewRefreshToken(Date.now());
      return;
    }

    if (nextDemoUrl && nextDemoUrl !== currentPreviewUrl) {
      // Page-tab navigation guard: within the same version + same tier-2
      // session, `currentPreviewUrl` may carry a user-chosen subroute
      // (`/<chatId>/<route>`) while the version row only stores the session
      // base URL. Overwriting here snapped the iframe back to "/" right
      // after every tab click (this effect re-runs on `currentPreviewUrl`).
      // See `shouldPreserveUserRouteNavigation` for the ownership contract.
      if (
        shouldPreserveUserRouteNavigation({
          didChangeVersion,
          nextDemoUrl,
          currentPreviewUrl,
        })
      ) {
        // Same live session is already on screen — keep the user's route but
        // still clear the pending flag the URL-write branch would have cleared.
        if (!isShimOrMissingPreviewUrl(nextDemoUrl)) {
          setPreviewPending(false);
        }
        return;
      }
      setCurrentPreviewUrl(nextDemoUrl);
      setPreviewRefreshToken(Date.now());
      if (!isShimOrMissingPreviewUrl(nextDemoUrl)) {
        setPreviewPending(false);
      }
    }
  }, [derived.activeVersionId, derived.latestVersionId, selectedVersionId, chat, currentPreviewUrl, derived.effectiveVersionsList, serverProjectDemoUrl, serverProjectChatId, chatId, lastActiveVersionIdRef, serverProjectPreviewOverrideUrl, serverProjectPreviewOverrideVersionId, clearedPreviewVersionId, setClearedPreviewVersionId, setCurrentPreviewUrl, setPreviewRefreshToken, setPreviewPending]);

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
      filesContextKeyRef.current = null;
      setExistingUiComponents([]);
      return;
    }
    if (filesContextKeyRef.current === contextKey) return;
    filesContextKeyRef.current = contextKey;

    let isActive = true;
    const controller = new AbortController();

    const fetchContext = async () => {
      try {
        if (!chatId || !derived.activeVersionId) {
          return;
        }
        // Liten delay sa fetchen inte race:ar mot finalize-pipens
        // versions-persist (annars far vi 404 + console-spam pa nyligen
        // skapade versionId i ~1s-fonstret innan DB:n hunnit committa).
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        if (!isActive || controller.signal.aborted) return;
        const response = await fetch(
          `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(derived.activeVersionId)}`,
          { signal: controller.signal },
        );
        // 404 inom kort fonster efter version.created ar normalt (race
        // mot finalize-persist). Vi tystar dem och provar igen vid nasta
        // refreshToken-tick istallet for att spamma Chrome-konsolen.
        if (response.status === 404) {
          return;
        }
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content?: string | null }>;
        } | null;
        if (!response.ok || !Array.isArray(data?.files)) {
          if (isActive) {
            setCurrentPageCode(undefined);
            setExistingUiComponents([]);
          }
          return;
        }

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
        setExistingUiComponents([]);
      }
    };

    fetchContext();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, derived.activeVersionId, state.previewRefreshToken, filesContextKeyRef, setExistingUiComponents, setCurrentPageCode]);

  const handleFilesSaved = useCallback(
    (info?: {
      versionId?: string;
      previewUrl?: string | null;
      previewSessionId?: string | null;
      previewMode?: string | null;
    }) => {
      filesContextKeyRef.current = null;
      promptFetchDoneRef.current = null;
      // Fast Edit Lane: a quick edit created a new minor version — select it so
      // follow-ups build on the patched version (avoids a stale-base reject) and
      // refresh the version list so the new v.x row appears.
      if (info?.versionId) {
        // M#sel1: register the fresh id BEFORE selecting, so the versionIdSet
        // guard tolerates it while the mutateVersions refetch is in flight.
        pendingCreatedVersionRef.current = { id: info.versionId, ts: Date.now() };
        setSelectedVersionId(info.versionId);
        void mutateVersions();
        // If the live preview was patched in place (same preview session, new
        // version + URL), thread the session meta and mark the new version's
        // bootstrap as done so useBuilderVmPreview does NOT re-POST
        // /preview-session — i.e. keep the no-restart fast path. Without this the
        // version switch would clear the session meta and trigger a full VM
        // bootstrap right after the hot patch.
        if (info.previewUrl && info.previewSessionId && chatId) {
          state.setCurrentPreviewUrl(info.previewUrl);
          onPreviewSessionMeta({
            previewSessionId: info.previewSessionId,
            versionId: info.versionId,
          });
          vmPreview.previewBootstrapDoneKeysRef.current.add(`${chatId}:${info.versionId}`);
        }
      }
      setPreviewRefreshToken(Date.now());
    },
    [
      filesContextKeyRef,
      promptFetchDoneRef,
      setPreviewRefreshToken,
      setSelectedVersionId,
      mutateVersions,
      chatId,
      state,
      onPreviewSessionMeta,
      vmPreview,
    ],
  );

  // Auto-start generation for the packaged `kostnadsfri` handoff from the
  // landing page. `freeform` (fritext) deliberately does NOT auto-start
  // (user decision 2026-07-02): the prompt is only prefilled into the chat
  // input (ChatInterface `initialPrompt`, same as the audit flow) so the user
  // can pick Modell/Inställningar before the explicit send — auto-send also
  // used to force-reset the model tier below, discarding any prior choice.
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
    // Hydrated publish state (survives reloads; see useDeploymentHistory).
    liveDeploymentUrl: liveDeployment?.url ?? null,
    liveDeploymentVersionId: liveDeployment?.versionId ?? null,
    liveDeploymentId: liveDeployment?.deploymentId ?? null,
    deploymentHistoryHydrationFailed,
    refetchDeploymentHistory,
    hydratedVercelProjectId: hydratedProject?.vercelProjectId ?? null,
    hydratedVercelProjectName,
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
    handleDeterministicF3Settled,
    handlePreviewSessionSuspect,
    forcePreviewResync,
    versionMismatchPayload,
    clearPreviewBuildError,
    clearPreviewSessionState,
    serverProjectPreviewOverrideVersionId: state.serverProjectPreviewOverrideVersionId,
    previewRefreshToken: state.previewRefreshToken,
    bumpPreviewRefreshToken,
    versionStatusNonce,
    isVersionPanelCollapsed: state.isVersionPanelCollapsed,
    currentPageCode: state.currentPageCode,
    existingUiComponents: state.existingUiComponents,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,

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
    // A3: manuell deploy-repair ("Publicera om med fix") + dess laddningsstate.
    republishWithFix: deployActions.republishWithFix,
    isRepublishRepairing: deployActions.isRepublishRepairing,

    // Prompt actions
    handlePromptAssistModeReset: promptActions.clearPromptAssistMode,
    requestCreateChat: promptActions.requestCreateChat,
    handleStartFromTemplate: promptActions.handleStartFromTemplate,
    templateSwitchDialog: promptActions.templateSwitchDialog,
    confirmTemplateSwitchDialog: promptActions.confirmTemplateSwitchDialog,
    cancelTemplateSwitchDialog: promptActions.cancelTemplateSwitchDialog,
    handleGoHome: promptActions.handleGoHome,
    handlePaletteSelection: promptActions.handlePaletteSelection,

    // Preview / version callbacks
    handleClearPreview: builderCallbacks.handleClearPreview,
    handleFixPreview: builderCallbacks.handleFixPreview,
    handleRestartGeneration: builderCallbacks.handleRestartGeneration,
    handleVersionSelect: builderCallbacks.handleVersionSelect,
    handleToggleVersionPanel: builderCallbacks.handleToggleVersionPanel,
    handleFilesSaved,
    versionlessAborted,

  };
}

export type BuilderViewModel = ReturnType<typeof useBuilderPageController>;
