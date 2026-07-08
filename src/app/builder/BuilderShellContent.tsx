"use client";

import {
  ChatInterface,
  type VisualPlacementDecision,
  type VisualPlacementRequest,
} from "@/components/builder/ChatInterface";
import { getLatestPendingReply as getLatestPendingReplyFromTooling } from "@/components/builder/BuilderMessageTooling";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { MessageList } from "@/components/builder/MessageList";
import { PlacementConfirmDialog } from "@/components/builder/PlacementConfirmDialog";
import { PreviewPanel } from "@/components/builder/preview-panel/PreviewPanel";
import type { ComposerAiFallbackPayload } from "@/components/builder/preview-panel/preview-panel-types";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { ModelTraceOverlay } from "@/components/builder/ModelTraceOverlay";
import { LaunchReadinessCard } from "@/components/builder/LaunchReadinessCard";
import { ProjectEnvVarsPanel } from "@/components/builder/ProjectEnvVarsPanel";
import { DeployNameDialog } from "@/components/builder/DeployNameDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DomainSearchDialog } from "@/components/builder/DomainSearchDialog";
import { DomainManager } from "@/components/builder/DomainManager";
import { GitHubExportDialog } from "@/components/builder/GitHubExportDialog";
import { ThinkingOverlay } from "@/components/builder/ThinkingOverlay";
import { TipCard } from "@/components/builder/TipCard";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { useAuth, useAuthStore } from "@/lib/auth/auth-store";
import { postPreviewDestroy } from "@/lib/builder/preview-session/api";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import {
  buildPromptSourceMessage,
  type PromptSourceMeta,
} from "@/lib/builder/prompt-builder";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import { analyzeSections } from "@/lib/builder/sectionAnalyzer";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import { saveProjectData } from "@/lib/project-client";
import { mapVersionStatusToDisplay } from "@/lib/builder/version-status-display";
import { localizeVerificationSummary } from "@/lib/builder/version-history-status-labels";
import {
  MODEL_TIER_OPTIONS,
  getPromptAssistModelLabel,
} from "@/lib/builder/defaults";
import type { ChatMessage } from "@/lib/builder/types";
import {
  readAutofixLocalStorageOnly,
  writeAutofixLocalStorage,
} from "@/lib/hooks/chat/useAutoFix";
import { useVersionStatus } from "@/lib/hooks/chat/useVersionStatus";
import { cn } from "@/lib/utils";
import { Eye, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BuilderLayout } from "./BuilderLayout";
import type { BuilderViewModel } from "./useBuilderPageController";

const CONTEXT_RECENT_MESSAGE_COUNT = 5;
const CONTEXT_MESSAGE_MAX_CHARS = 3_000;
const TIP_USER_MESSAGE_MAX_CHARS = 5_000;
const TIP_ASSISTANT_MESSAGE_MAX_CHARS = 9_000;
const TIP_CODE_MAX_CHARS = 22_000;
const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 30_000;

type TipApiResponse = {
  success?: boolean;
  tip?: string;
  error?: string;
  cost?: number;
};

type ContextMessage = {
  role: ChatMessage["role"];
  content: string;
};

function toContextMessage(message: ChatMessage, maxChars: number): ContextMessage {
  return {
    role: message.role,
    content:
      typeof message.content === "string" ? message.content.slice(0, maxChars) : "[structured]",
  };
}

function buildRecentContextMessages(messages: ChatMessage[]): ContextMessage[] {
  return messages
    .slice(-CONTEXT_RECENT_MESSAGE_COUNT)
    .map((message) => toContextMessage(message, CONTEXT_MESSAGE_MAX_CHARS));
}

function getLatestCompletedAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      !message.isStreaming &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function getLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function buildPlacementPromptMessage(
  request: VisualPlacementRequest,
  placement: PlacementSelectEventDetail,
  customization: string,
): { message: string; meta: PromptSourceMeta } {
  const built = buildPromptSourceMessage(request.source, {
    placementLabel: placement.placementLabel,
    anchorLabel: placement.anchorSection?.label ?? null,
    customization,
  });
  return {
    message: built.message,
    meta: built.meta,
  };
}

export function BuilderShellContent(vm: BuilderViewModel) {
  const isBusy = vm.isCreatingChat || vm.isAnyStreaming || vm.isTemplateLoading || vm.isPreparingPrompt;
  const isPreviewLoading =
    vm.isCreatingChat ||
    vm.previewPending ||
    vm.previewLifecycle === "recovering" ||
    (!vm.currentPreviewUrl && vm.isAnyStreaming);
  const activeVersionSummary = useMemo(() => {
    return vm.activeVersionId
      ? vm.effectiveVersionsList.find(
          (version) => version.versionId === vm.activeVersionId || version.id === vm.activeVersionId,
        ) ?? null
      : null;
  }, [vm.activeVersionId, vm.effectiveVersionsList]);
  const activeVersionIsLatest =
    !vm.activeVersionId || !vm.latestVersionId || vm.activeVersionId === vm.latestVersionId;
  // OMTAG-06 / område 6-1: version status now flows from the canonical
  // event-bus projection (`selectVersionStatus`), read client-side via
  // `useVersionStatus`, instead of being inferred from DB row flags
  // through the now-removed `resolveEngineVersionDisplayStatus`.
  // `mapVersionStatusToDisplay` derives `retrying`/`promoted` and guards
  // against false-green (degraded ≠ success). VersionHistory flipped to the
  // bus in område 6-2; the legacy resolver was removed in 6-3.
  const { status: activeVersionBusStatus } = useVersionStatus({
    chatId: vm.chatId,
    versionId: vm.activeVersionId,
    // Område 6-3 punkt 1: deterministic refetch after the post-check flow
    // completes (bumped in `runPostGenerationChecks`'s `finally`), so a late
    // `version.degraded` is read even after poll-until-stable has stopped.
    refreshNonce: vm.versionStatusNonce,
  });
  const activeVersionStatus = useMemo(() => {
    return mapVersionStatusToDisplay(activeVersionBusStatus, {
      isLatest: activeVersionIsLatest,
      releaseState: activeVersionSummary?.releaseState ?? null,
    }).status;
  }, [activeVersionBusStatus, activeVersionIsLatest, activeVersionSummary]);
  // P19 Steg 3 — transparency in follow-up base. When the user is focused
  // on an older version, the next `sendMessage` carries `engineBaseVersionId
  // = activeVersionId` (see useSendMessage.ts). Surface that decision in the
  // chat composer so the user never sends an edit thinking they are on the
  // latest. The badge prefers human-readable version numbers from the
  // effective versions list and falls back to a shortened id for rows that
  // still lack a versionNumber (e.g. brand-new rows seen before the first
  // refetch).
  const latestVersionSummary = useMemo(() => {
    if (!vm.latestVersionId) return null;
    return (
      vm.effectiveVersionsList.find(
        (version) =>
          version.versionId === vm.latestVersionId || version.id === vm.latestVersionId,
      ) ?? null
    );
  }, [vm.latestVersionId, vm.effectiveVersionsList]);
  const followUpBaseInfo = useMemo(() => {
    if (activeVersionIsLatest) return null;
    if (!vm.activeVersionId || !vm.latestVersionId) return null;
    const toDisplay = (
      summary: { versionNumber?: number | null; versionId?: string | null; id?: string | null } | null,
      fallbackId: string | null,
    ): string => {
      if (summary?.versionNumber) return `v${summary.versionNumber}`;
      const id = summary?.versionId || summary?.id || fallbackId;
      return id ? `#${id.slice(0, 6)}` : "okänd";
    };
    return {
      baseLabel: toDisplay(activeVersionSummary, vm.activeVersionId),
      latestLabel: toDisplay(latestVersionSummary, vm.latestVersionId),
    };
  }, [activeVersionIsLatest, activeVersionSummary, latestVersionSummary, vm.activeVersionId, vm.latestVersionId]);
  const sendMessage = vm.sendMessage;

  const handleComposerAiFallback = useCallback(
    async (payload: ComposerAiFallbackPayload) => {
      if (!vm.chatId) return;
      const block = getPageBlockById(payload.blockId);
      if (!block) {
        toast.error("Okänt sajblock.");
        return;
      }
      const sections = payload.homePageContent ? analyzeSections(payload.homePageContent) : [];
      const built = buildPromptSourceMessage(
        {
          kind: "page-block",
          label: block.label,
          description: block.description,
          implementationPrompt: block.implementationPrompt,
          placement: payload.placement,
          detectedSections: sections,
        },
        {
          placementLabel: payload.placementLabel,
          anchorLabel: payload.anchorSection?.label ?? null,
        },
      );
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage, vm.chatId],
  );
  const isDeployActionBusy =
    vm.isCreatingChat || vm.isAnyStreaming || vm.isDeploying || vm.isTemplateLoading;
  // A publication exists if there's a live deployment or a known hosting
  // project — either from this session or hydrated from the DB on reload. The
  // domain manager (link/verify) needs a published site; before that we only
  // offer the search dialog.
  const hasPublication = Boolean(
    vm.liveDeploymentUrl || vm.hydratedVercelProjectId || vm.lastDeployVercelProjectId,
  );
  const deployReadinessBlocker = vm.deployReadiness?.blockers[0] ?? null;
  const canDeploy = Boolean(
    vm.chatId &&
      vm.activeVersionId &&
      !isDeployActionBusy &&
      (vm.deployReadiness?.canDeploy ?? true),
  );
  const baseDeployDisabledReason = !vm.chatId
    ? "Skapa eller öppna en chat först."
    : !vm.activeVersionId
      ? "Välj eller generera en version först."
      : vm.isCreatingChat || vm.isTemplateLoading
        ? "Vänta tills chatten och versionen är redo."
        : vm.isAnyStreaming
          ? "Vänta tills den pågående generationen är klar."
          : vm.isDeploying
            ? "Publicering pågår redan."
            : deployReadinessBlocker?.detail || deployReadinessBlocker?.title || null;
  const deployDisabledReason =
    deployReadinessBlocker?.action === "env" && baseDeployDisabledReason
      ? `${baseDeployDisabledReason} Lägg till nycklarna under Projektets miljövariabler (Lansering överst i chatpanelen).`
      : baseDeployDisabledReason;
  const { hasGitHub, user: authUser } = useAuth();
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [githubExportOpen, setGithubExportOpen] = useState(false);
  const [enableAutofix, setEnableAutofix] = useState(true);
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [tipPanelOpen, setTipPanelOpen] = useState(false);
  const [tipText, setTipText] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipCost, setTipCost] = useState<number | null>(null);
  const [isTipLoading, setIsTipLoading] = useState(false);
  const previousStreamingRef = useRef(vm.isAnyStreaming);
  const lastAutoTipAssistantIdRef = useRef<string | null>(null);
  const latestTipRequestIdRef = useRef(0);
  const [pendingPlacementRequest, setPendingPlacementRequest] =
    useState<VisualPlacementRequest | null>(null);
  const [placementSelection, setPlacementSelection] =
    useState<PlacementSelectEventDetail | null>(null);
  const [placementConfirmOpen, setPlacementConfirmOpen] = useState(false);
  const [isPlacementSubmitting, setIsPlacementSubmitting] = useState(false);
  const placementResolverRef = useRef<((decision: VisualPlacementDecision) => void) | null>(null);
  const handleApproveBuildPlan = useCallback(
    async (plan: Record<string, unknown>) => {
      const built = buildPromptSourceMessage({ kind: "approved-plan", rawPlan: plan });
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage],
  );

  const requestTip = useCallback(
    async (assistantMessage: ChatMessage | null) => {
      if (!assistantMessage) {
        setTipText(null);
        setTipCost(null);
        setTipError("Inget AI-svar att hämta tips från ännu.");
        setTipPanelOpen(true);
        return;
      }

      const tipRequestId = latestTipRequestIdRef.current + 1;
      latestTipRequestIdRef.current = tipRequestId;
      setIsTipLoading(true);
      setTipError(null);
      try {
        const latestUser = getLatestUserMessage(vm.messages);
        const res = await fetch("/api/openclaw/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              page: "builder",
              projectId: vm.appProjectId,
              chatId: vm.chatId,
              activeVersionId: vm.activeVersionId,
              demoUrl: vm.currentPreviewUrl,
              uiSurfaces: [
                "vänster chatpanel",
                "Lanseringskortet",
                "previewpanelen",
                "sidchipsen under Preview",
                "Kodvy",
                "Elementregister",
                "versionspanelen till höger",
                "Projektets miljövariabler",
                "Publicera-knappen",
                "den genererade sidan/koden",
              ],
              recentMessages: buildRecentContextMessages(vm.messages),
              latestUserMessage: latestUser?.content?.slice(0, TIP_USER_MESSAGE_MAX_CHARS) || "",
              latestAssistantMessage: assistantMessage.content.slice(
                0,
                TIP_ASSISTANT_MESSAGE_MAX_CHARS,
              ),
              currentCode: vm.currentPageCode?.slice(0, TIP_CODE_MAX_CHARS) || "",
            },
          }),
        });

        const data = (await res.json().catch(() => null)) as TipApiResponse | null;
        if (latestTipRequestIdRef.current !== tipRequestId) return;

        if (!res.ok || !data?.success || typeof data.tip !== "string") {
          const message = data?.error || "Kunde inte hämta tips just nu.";
          setTipText(null);
          setTipCost(null);
          setTipError(message);
          setTipPanelOpen(true);
          return;
        }

        const trimmedTip = data.tip.trim();
        if (!trimmedTip) {
          setTipText(null);
          setTipCost(null);
          setTipError("Kunde inte hämta tips just nu.");
          setTipPanelOpen(true);
          return;
        }

        setTipText(trimmedTip);
        setTipCost(typeof data.cost === "number" ? data.cost : 2);
        setTipError(null);
        setTipPanelOpen(true);
      } catch {
        if (latestTipRequestIdRef.current !== tipRequestId) return;
        setTipText(null);
        setTipCost(null);
        setTipError("Kunde inte hämta tips just nu.");
        setTipPanelOpen(true);
      } finally {
        if (latestTipRequestIdRef.current === tipRequestId) {
          setIsTipLoading(false);
        }
      }
    },
    [
      vm.activeVersionId,
      vm.appProjectId,
      vm.chatId,
      vm.currentPreviewUrl,
      vm.currentPageCode,
      vm.messages,
    ],
  );

  const handleRefreshTip = useCallback(() => {
    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    void requestTip(latestAssistant);
  }, [requestTip, vm.messages]);

  useEffect(() => {
    if (!vm.chatId) {
      latestTipRequestIdRef.current += 1;
      setTipPanelOpen(false);
      setTipText(null);
      setTipError(null);
      setTipCost(null);
      setIsTipLoading(false);
      lastAutoTipAssistantIdRef.current = null;
    }
  }, [vm.chatId]);

  useEffect(() => {
    if (!vm.tipsEnabled) {
      latestTipRequestIdRef.current += 1;
      setIsTipLoading(false);
      setTipPanelOpen(false);
    }
  }, [vm.tipsEnabled]);

  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    previousStreamingRef.current = vm.isAnyStreaming;

    if (!vm.tipsEnabled) return;
    if (!wasStreaming || vm.isAnyStreaming) return;

    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    if (!latestAssistant) return;
    if (lastAutoTipAssistantIdRef.current === latestAssistant.id) return;

    lastAutoTipAssistantIdRef.current = latestAssistant.id;
    void requestTip(latestAssistant);
  }, [requestTip, vm.isAnyStreaming, vm.messages, vm.tipsEnabled]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const seen = new Set<string>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const imgs =
            node.tagName === "IMG"
              ? [node as HTMLImageElement]
              : Array.from(node.querySelectorAll<HTMLImageElement>("img[src]"));

          for (const img of imgs) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
            try {
              const url = new URL(src, window.location.origin);
              if (url.origin === window.location.origin) continue;
              if (seen.has(url.href)) continue;
              seen.add(url.href);

              const closestLabel =
                img.alt ||
                img.closest("[data-label]")?.getAttribute("data-label") ||
                img.closest("[aria-label]")?.getAttribute("aria-label") ||
                img.parentElement?.textContent?.trim().slice(0, 60) ||
                "(unknown)";

              console.info(
                `%c[ExtImg]%c ${closestLabel}\n${url.href}`,
                "color:#f59e0b;font-weight:bold",
                "color:inherit",
              );
            } catch { /* invalid URL */ }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const selectedModelLabel =
      MODEL_TIER_OPTIONS.find((option) => option.value === vm.selectedModelTier)?.label ??
      vm.selectedModelTier;

    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      projectId: vm.appProjectId,
      chatId: vm.chatId,
      buildMethod: vm.buildMethod,
      activeVersionId: vm.activeVersionId,
      demoUrl: vm.currentPreviewUrl,
      selectedModelTier: vm.selectedModelTier,
      selectedModelLabel,
      promptAssistModel: vm.promptAssistModel,
      promptAssistLabel: getPromptAssistModelLabel(vm.promptAssistModel),
      promptAssistDeep: vm.promptAssistDeep,
      scaffoldMode: vm.scaffoldMode,
      scaffoldId: vm.scaffoldId,
      recentMessages: buildRecentContextMessages(vm.messages),
      currentCode: vm.currentPageCode?.slice(0, OPENCLAW_CONTEXT_CODE_MAX_CHARS) || null,
      isStreaming: vm.isAnyStreaming,
    };
    return () => {
      delete window.__SITEMASKIN_CONTEXT;
    };
  }, [
    vm.appProjectId,
    vm.chatId,
    vm.buildMethod,
    vm.activeVersionId,
    vm.currentPreviewUrl,
    vm.selectedModelTier,
    vm.promptAssistModel,
    vm.promptAssistDeep,
    vm.scaffoldMode,
    vm.scaffoldId,
    vm.messages,
    vm.currentPageCode,
    vm.isAnyStreaming,
  ]);

  const resolvePlacementFlow = useCallback((decision: VisualPlacementDecision) => {
    setPendingPlacementRequest(null);
    setPlacementSelection(null);
    setPlacementConfirmOpen(false);
    const resolver = placementResolverRef.current;
    placementResolverRef.current = null;
    if (resolver) {
      resolver(decision);
    }
  }, []);

  useEffect(() => {
    return () => {
      const resolver = placementResolverRef.current;
      placementResolverRef.current = null;
      if (resolver) resolver("cancelled");
    };
  }, []);

  useEffect(() => {
    if (!pendingPlacementRequest) return;
    if (vm.chatId && vm.currentPreviewUrl) return;
    resolvePlacementFlow("cancelled");
  }, [pendingPlacementRequest, resolvePlacementFlow, vm.chatId, vm.currentPreviewUrl]);

  const handleRequestPlacement = useCallback(
    async (request: VisualPlacementRequest) => {
      if (!vm.chatId || !vm.currentPreviewUrl) return "fallback";

      const existingResolver = placementResolverRef.current;
      if (existingResolver) {
        placementResolverRef.current = null;
        existingResolver("cancelled");
      }

      setPendingPlacementRequest(request);
      setPlacementSelection(null);
      setPlacementConfirmOpen(false);

      return await new Promise<VisualPlacementDecision>((resolve) => {
        placementResolverRef.current = resolve;
      });
    },
    [vm.chatId, vm.currentPreviewUrl],
  );

  const handlePlacementComplete = useCallback(
    (detail: PlacementSelectEventDetail) => {
      if (!pendingPlacementRequest) return;
      setPlacementSelection(detail);
      setPlacementConfirmOpen(true);
    },
    [pendingPlacementRequest],
  );

  const handlePlacementCancel = useCallback(() => {
    resolvePlacementFlow("cancelled");
  }, [resolvePlacementFlow]);

  const handlePlacementConfirm = useCallback(
    async (customization: string) => {
      if (!pendingPlacementRequest || !placementSelection || !vm.chatId) {
        resolvePlacementFlow("cancelled");
        return;
      }

      setIsPlacementSubmitting(true);
      try {
        const built = buildPlacementPromptMessage(
          pendingPlacementRequest,
          placementSelection,
          customization,
        );
        await vm.sendMessage(built.message, { promptSourceMeta: built.meta });
        resolvePlacementFlow("handled");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kunde inte skicka placeringsinstruktion";
        toast.error(message);
        resolvePlacementFlow("cancelled");
      } finally {
        setIsPlacementSubmitting(false);
      }
    },
    [
      pendingPlacementRequest,
      placementSelection,
      vm,
      resolvePlacementFlow,
    ],
  );

  const pendingPlacementItem = pendingPlacementRequest
    ? {
        title:
          pendingPlacementRequest.source.displayName ||
          pendingPlacementRequest.source.registryItem.name ||
          "Block",
        description:
          pendingPlacementRequest.source.description ||
          pendingPlacementRequest.source.registryItem.description ||
          null,
      }
    : null;

  const latestPendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(vm.messages.map(toAIElementsFormat)),
    [vm.messages],
  );

  const persistPreviewOverride = useCallback(
    async (url: string | null, versionId: string | null) => {
      vm.setServerProjectPreviewOverrideUrl(url);
      vm.setServerProjectPreviewOverrideVersionId(versionId);
      if (!vm.appProjectId) return;
      try {
        await saveProjectData(vm.appProjectId, {
          meta: {
            previewOverride:
              url && versionId
                ? {
                    url,
                    versionId,
                    source: "preview",
                  }
                : null,
          },
        });
      } catch (error) {
        console.warn("[Builder] Failed to persist preview override:", error);
      }
    },
    [vm],
  );

  const handleClearPreview = useCallback(() => {
    void (async () => {
      const activeVersionId = vm.activeVersionId ?? null;
      const activePreviewSessionId = vm.activePreviewSessionId?.trim() || null;

      if (vm.chatId && activeVersionId && activePreviewSessionId) {
        const destroy = await postPreviewDestroy({
          chatId: vm.chatId,
          versionId: activeVersionId,
          previewSessionId: activePreviewSessionId,
        });
        if (!destroy || destroy.ok !== true) {
          toast.error(
            destroy?.message?.trim() || "Kunde inte stänga live-preview och frigöra VM-sessionen.",
          );
          return;
        }
      }

      vm.clearPreviewSessionState(activeVersionId);
      vm.setClearedPreviewVersionId(activeVersionId);
      vm.setCurrentPreviewUrl(null);
      void persistPreviewOverride(null, null);
      void vm.mutateVersions();
    })();
  }, [vm, persistPreviewOverride]);

  const handleVersionSelect = useCallback(
    (versionId: string, demoUrl?: string) => {
      vm.clearPreviewBuildError();
      vm.setClearedPreviewVersionId(null);
      if (vm.serverProjectPreviewOverrideVersionId === versionId) {
        void persistPreviewOverride(null, null);
      }
      vm.handleVersionSelect(versionId, demoUrl);
    },
    [vm, persistPreviewOverride],
  );

  const handleApplyAnthropicComparePreset = useCallback(() => {
    vm.setSelectedModelTier("anthropic");
  }, [
    vm,
  ]);

  useEffect(() => {
    setEnableAutofix(readAutofixLocalStorageOnly());
  }, []);

  const handleEnableAutofixChange = useCallback((next: boolean) => {
    writeAutofixLocalStorage(next);
    setEnableAutofix(next);
  }, []);

  return (
    <BuilderLayout chatId={vm.chatId} versionId={vm.activeVersionId}>
      <BuilderHeader
        selectedModelTier={vm.selectedModelTier}
        onSelectedModelTierChange={vm.setSelectedModelTier}
        onApplyAnthropicComparePreset={handleApplyAnthropicComparePreset}
        designTheme={vm.designTheme}
        onDesignThemeChange={vm.setDesignTheme}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        canUseDeepBrief={!vm.chatId}
        scaffoldMode={vm.scaffoldMode}
        scaffoldId={vm.scaffoldId}
        onScaffoldModeChange={vm.setScaffoldMode}
        onScaffoldIdChange={vm.setScaffoldId}
        customInstructions={vm.customInstructions}
        onCustomInstructionsChange={vm.setCustomInstructions}
        applyInstructionsOnce={vm.applyInstructionsOnce}
        onApplyInstructionsOnceChange={vm.setApplyInstructionsOnce}
        enableImageGenerations={vm.enableImageGenerations}
        onEnableImageGenerationsChange={vm.setEnableImageGenerations}
        enableThinking={vm.enableThinking}
        onEnableThinkingChange={vm.setEnableThinking}
        isImageGenerationsSupported={vm.isImageGenerationsSupported}
        isMediaEnabled={vm.isMediaEnabled}
        chatPrivacy={vm.chatPrivacy}
        onChatPrivacyChange={vm.setChatPrivacy}
        enableBlobMedia={vm.enableBlobMedia}
        onEnableBlobMediaChange={vm.setEnableBlobMedia}
        enableAutofix={enableAutofix}
        onEnableAutofixChange={handleEnableAutofixChange}
        showStructuredChat={vm.showStructuredChat}
        onShowStructuredChatChange={vm.setShowStructuredChat}
        tipsEnabled={vm.tipsEnabled}
        onTipsEnabledChange={vm.setTipsEnabled}
        isFigmaInputOpen={isFigmaInputOpen}
        onToggleFigmaInput={() => setIsFigmaInputOpen((value) => !value)}
        chatId={vm.chatId}
        activeVersionId={vm.activeVersionId}
        onOpenImport={() => {
          vm.setIsImportModalOpen(true);
        }}
        onExportGitHub={() => setGithubExportOpen(true)}
        onDeployProduction={vm.handleOpenDeployDialog}
        onDomainSearch={() => {
          // A publication exists if there is a live deployment or a known
          // hosting project — from the current session OR hydrated on reload.
          if (hasPublication) {
            vm.setDomainManagerOpen(true);
          } else {
            vm.setDomainSearchOpen(true);
          }
        }}
        onGoHome={vm.handleGoHome}
        onNewChat={vm.resetToNewChat}
        onSaveProject={vm.handleSaveProject}
        onCancelGeneration={vm.cancelActiveGeneration}
        isDeploying={vm.isDeploying}
        isCreatingChat={vm.isCreatingChat}
        isAnyStreaming={vm.isAnyStreaming}
        isSavingProject={vm.isSavingProject}
        canDeploy={canDeploy}
        canManageDomain={Boolean(vm.chatId && vm.activeVersionId && !isDeployActionBusy)}
        canSaveProject={Boolean(vm.chatId)}
        deploymentStatus={vm.deploymentStatus}
        deploymentUrl={vm.deploymentUrl}
        onRepublishWithFix={vm.republishWithFix}
        isRepublishRepairing={vm.isRepublishRepairing}
        liveDeploymentUrl={vm.liveDeploymentUrl}
        liveDeploymentVersionId={vm.liveDeploymentVersionId}
        deploymentHistoryHydrationFailed={vm.deploymentHistoryHydrationFailed}
        onRetryDeploymentHistory={vm.refetchDeploymentHistory}
        deployDisabledReason={deployDisabledReason}
      />
      <ModelTraceOverlay
        selectedModelTier={vm.selectedModelTier}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        enableThinking={vm.enableThinking}
        canUseDeepBrief={!vm.chatId}
      />

      {/* Mobile tab bar (visible < lg) */}
      <div className="border-border bg-background flex border-b lg:hidden" role="tablist" aria-label="Byggarvyer">
        <button
          role="tab"
          aria-selected={mobileTab === "chat"}
          aria-controls="builder-chat-panel"
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            mobileTab === "chat"
              ? "border-brand-blue text-brand-blue border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "preview"}
          aria-controls="builder-preview-panel"
          onClick={() => setMobileTab("preview")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            mobileTab === "preview"
              ? "border-brand-blue text-brand-blue border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="h-4 w-4" />
          Preview
          {vm.currentPreviewUrl && mobileTab !== "preview" && (
            <span className="bg-brand-blue h-2 w-2 rounded-full" />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          id="builder-chat-panel"
          role="tabpanel"
          className={cn(
            "border-border bg-background min-h-0 w-full flex-col border-r lg:flex lg:w-96",
            mobileTab === "chat" ? "flex" : "hidden",
          )}
        >
          <LaunchReadinessCard
            readiness={vm.deployReadiness}
            isLoading={vm.isDeployReadinessLoading}
            lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
          />
          {vm.deployReadiness?.info?.lifecycleStage === "integrations" ? (
            <ProjectEnvVarsPanel
              externalProjectId={vm.externalProjectId}
              appProjectId={vm.appProjectId}
              chatId={vm.chatId}
              activeVersionId={vm.activeVersionId}
            />
          ) : (
            <div className="border-border bg-muted/40 text-muted-foreground mx-3 mt-2 rounded-md border px-3 py-2 text-xs leading-relaxed">
              <span className="text-foreground font-medium">
                Env-variabler:
              </span>{" "}
              auto-hanterade i{" "}
              <code className="bg-background rounded px-1 py-0.5 text-[11px]">
                env.example
              </code>{" "}
              för det här projektet. Klicka{" "}
              <span className="text-foreground font-medium">&quot;Bygg integrationer&quot;</span> i
              previewen för att fylla i riktiga värden för externa
              integrationer.
            </div>
          )}
          <ThinkingOverlay isVisible={vm.isAnyStreaming} />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MessageList
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              messages={vm.messages}
              showStructuredParts={vm.showStructuredChat}
              onQuickReply={(text, options) => vm.sendMessage(text, options)}
              onApproveBuildPlan={handleApproveBuildPlan}
              quickReplyDisabled={isBusy}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
            />
            <TipCard
              open={tipPanelOpen && vm.tipsEnabled}
              isLoading={isTipLoading}
              tip={tipText}
              error={tipError}
              cost={tipCost}
              onRefresh={handleRefreshTip}
              onClose={() => setTipPanelOpen(false)}
            />
          </div>
          <ChatInterface
            chatId={vm.chatId}
            initialPrompt={vm.initialPrompt}
            onCreateChat={vm.requestCreateChat}
            onSendMessage={vm.sendMessage}
            onRequestPlacement={handleRequestPlacement}
            onPromptAssistModeReset={vm.handlePromptAssistModeReset}
            isFigmaInputOpen={isFigmaInputOpen}
            onFigmaInputOpenChange={setIsFigmaInputOpen}
            isBusy={isBusy}
            isPreparingPrompt={vm.isPreparingPrompt}
            mediaEnabled={vm.mediaEnabled}
            continuePlanMode={Boolean(latestPendingReply?.planMode)}
            followUpBaseInfo={followUpBaseInfo}
          />
          <DeployNameDialog
            open={vm.deployNameDialogOpen}
            deployName={vm.deployNameInput}
            deployNameError={vm.deployNameError}
            isDeploying={vm.isDeploying}
            isSaving={false}
            projectId={vm.appProjectId ?? null}
            onDeployNameChange={(value) => {
              vm.setDeployNameInput(value);
              if (vm.deployNameError) vm.setDeployNameError(null);
            }}
            onCancel={() => vm.setDeployNameDialogOpen(false)}
            onConfirm={vm.handleConfirmDeploy}
          />

          <AlertDialog
            open={vm.templateSwitchDialog !== null}
            onOpenChange={(open) => {
              if (!open) vm.cancelTemplateSwitchDialog();
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {vm.templateSwitchDialog?.kind === "new-chat"
                    ? "Starta ny chat från template?"
                    : "Avbryta pågående generering?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {vm.templateSwitchDialog?.kind === "new-chat"
                    ? "Du har redan en aktiv chat. En ny chat startas från vald template och nuvarande konversation finns kvar i historiken."
                    : "Generering pågår just nu. Vill du avbryta och starta från mallen istället?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Avbryt</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={() => vm.confirmTemplateSwitchDialog()}>
                  Fortsätt
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <DomainSearchDialog
            open={vm.domainSearchOpen}
            query={vm.domainQuery}
            results={vm.domainResults}
            isSearching={vm.isDomainSearching}
            onQueryChange={vm.setDomainQuery}
            onSearch={vm.handleDomainSearch}
            onClose={() => vm.setDomainSearchOpen(false)}
          />

          <DomainManager
            open={vm.domainManagerOpen}
            onClose={() => vm.setDomainManagerOpen(false)}
            chatId={vm.chatId}
            deploymentId={vm.activeDeploymentId ?? vm.liveDeploymentId}
          />

          <GitHubExportDialog
            open={githubExportOpen}
            onClose={() => setGithubExportOpen(false)}
            chatId={vm.chatId}
            versionId={vm.activeVersionId}
            hasGitHub={hasGitHub}
            isAuthenticated={vm.isAuthenticated}
            suggestedRepoName={vm.appProjectName ?? null}
            githubUsername={authUser?.github_username ?? null}
          />
        </div>

        <div
          id="builder-preview-panel"
          role="tabpanel"
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            mobileTab === "preview" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PreviewPanel
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              previewUrl={vm.currentPreviewUrl}
              alternatePreviewUrls={vm.activeVersionAlternatePreview}
              previewBuildError={vm.previewBuildError}
              previewProdBuild={vm.previewProdBuild}
              previewPending={vm.previewPending}
              activePreviewSessionId={vm.activePreviewSessionId}
              previewLifecycle={vm.previewLifecycle}
              activeVersionStatus={activeVersionStatus}
              activeVersionSummary={localizeVerificationSummary(
                activeVersionSummary?.verificationSummary ?? null,
              )}
              activeVersionIsLatest={activeVersionIsLatest}
              activeVersionRepairPassIndex={activeVersionBusStatus?.repairPassIndex ?? 0}
              onPreviewSessionSuspect={vm.handlePreviewSessionSuspect}
              onForcePreviewResync={() => vm.forcePreviewResync()}
              versionMismatchPayload={vm.versionMismatchPayload}
              onNavigatePreviewUrl={(url) => {
                vm.setCurrentPreviewUrl(url);
                vm.bumpPreviewRefreshToken();
              }}
              isLoading={isPreviewLoading}
              imageGenerationsEnabled={vm.enableImageGenerations}
              imageGenerationsSupported={vm.isImageGenerationsSupported}
              isBlobConfigured={vm.isMediaEnabled}
              awaitingInput={vm.isAwaitingInput}
              awaitingInputQuestion={latestPendingReply?.question ?? null}
              awaitingInputOptions={latestPendingReply?.options ?? []}
              onClear={handleClearPreview}
              onFixPreview={vm.handleFixPreview}
              versionlessAborted={vm.versionlessAborted}
              onRestartGeneration={vm.handleRestartGeneration}
              onFilesSaved={vm.handleFilesSaved}
              refreshToken={vm.previewRefreshToken}
              placementMode={Boolean(pendingPlacementRequest)}
              pendingPlacementItem={pendingPlacementItem}
              onPlacementComplete={handlePlacementComplete}
              onComposerAiFallback={handleComposerAiFallback}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              isBusy={isBusy}
              onF3MissingEnv={(payload) => {
                // finalize-design returns 412 while the user is still in F2.
                // `ProjectEnvVarsPanel` only mounts in F3, so instead we open
                // the "Dossiers" popover (mounted in the preview chrome in both
                // F2 and F3) with the missing keys highlighted. This is
                // F2-mute-safe: the popover only opens because the user just
                // clicked "Bygg integrationer" — it is not a system-initiated
                // env prompt. From there the user fills the keys and re-runs
                // the build via the popover's retry CTA.
                openDossiersPanel(
                  payload.missingByIntegration.flatMap((entry) => entry.missing),
                );
              }}
              onF3Ready={(payload) => {
                // Auto-kick the F3 ("Bygg integrationer") generation as soon
                // as `/finalize-design` greenlights the F2 version. The
                // server reads `meta.lifecycleStage` + `meta.parentVersionId`
                // from this send and forks a new engine_versions row with
                // `lifecycle_stage = "integrations"` and `parent_version_id`
                // set to the F2 version we just finalized.
                void vm.sendMessage(
                  "Bygg integrationer nu utifrån den finaliserade designversionen.",
                  {
                    lifecycleStageOverride: "integrations",
                    parentVersionIdOverride: payload.parentVersionId,
                    engineBaseVersionIdOverride: payload.parentVersionId,
                  },
                );
              }}
            />
          </div>
          <div
            className={cn(
              "border-border bg-background hidden h-full flex-col border-l transition-[width] duration-200 lg:flex",
              vm.isVersionPanelCollapsed ? "lg:w-10" : "lg:w-80",
            )}
          >
            <VersionHistory
              chatId={vm.chatId}
              selectedVersionId={vm.activeVersionId}
              activePreviewSessionId={vm.activePreviewSessionId}
              onVersionSelect={handleVersionSelect}
              onPreviewResync={(versionId) => vm.forcePreviewResync(versionId)}
              isCollapsed={vm.isVersionPanelCollapsed}
              onToggleCollapse={vm.handleToggleVersionPanel}
              versions={vm.effectiveVersionsList}
              mutateVersions={vm.mutateVersions}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
            />
          </div>
        </div>
      </div>

      <PlacementConfirmDialog
        key={`${pendingPlacementItem?.title}-${placementSelection?.placementLabel}`}
        open={placementConfirmOpen && Boolean(pendingPlacementRequest) && Boolean(placementSelection)}
        elementName={pendingPlacementItem?.title || "Element"}
        elementDescription={pendingPlacementItem?.description}
        placementLabel={placementSelection?.placementLabel || "Vald placering"}
        onConfirm={handlePlacementConfirm}
        onCancel={handlePlacementCancel}
        isSubmitting={isPlacementSubmitting}
      />

      <InitFromRepoModal
        isOpen={vm.isImportModalOpen}
        onClose={() => vm.setIsImportModalOpen(false)}
        onSuccess={(newChatId, _v0ProjectInternalId) => {
          vm.setChatId(newChatId);
          if (vm.appProjectId) {
            vm.applyAppProjectId(vm.appProjectId, { chatId: newChatId });
          } else {
            const params = new URLSearchParams(vm.searchParams.toString());
            params.set("chatId", newChatId);
            vm.router.replace(`/builder?${params.toString()}`);
          }
          vm.setMessages([]);
          vm.setCurrentPreviewUrl(null);
        }}
      />

      <RequireAuthModal
        isOpen={Boolean(vm.authModalReason)}
        onClose={() => {
          const freshlyAuthed = useAuthStore.getState().user !== null;
          if (vm.authModalReason === "builder" && !freshlyAuthed) {
            vm.router.push("/");
          }
          vm.setAuthModalReason(null);
        }}
        reason={vm.authModalReason ?? "builder"}
      />
    </BuilderLayout>
  );
}
