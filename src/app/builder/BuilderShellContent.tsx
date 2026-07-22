"use client";

import { ChatInterface } from "@/components/builder/ChatInterface";
import { getLatestPendingReply as getLatestPendingReplyFromTooling } from "@/components/builder/BuilderMessageTooling";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { MessageList } from "@/components/builder/MessageList";
import { PreviewPanel } from "@/components/builder/preview-panel/PreviewPanel";
import type { ComposerAiFallbackPayload } from "@/components/builder/preview-panel/preview-panel-types";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { ModelTraceOverlay } from "@/components/builder/ModelTraceOverlay";
import { LaunchReadinessCard } from "@/components/builder/LaunchReadinessCard";
import {
  F3RequirementsSurface,
  F3StatusSurface,
  type F3BuilderStatus,
  type F3MissingIntegration,
} from "@/components/builder/F3RequirementsSurface";
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
import {
  dispatchVersionStatusRefreshed,
  F3_REQUIREMENTS_EVENT,
  openDossiersPanel,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  readF3RequirementsDetail,
  readProjectEnvVarsUpdatedDetail,
  requestF3Rebuild,
  subtractSavedKeysFromF3Requirements,
} from "@/lib/builder/project-env-events";
import { buildAddDossierMessage } from "@/lib/builder/dossier-id-request";
import { buildPromptSourceMessage } from "@/lib/builder/prompt-builder";
import {
  buildShadcnInsertMessage,
  type ShadcnInsertSelection,
} from "@/lib/builder/shadcn-insert";
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

  // Byggblock-panelen (PreviewPanelDossiers) refetchar sin "inkopplade"-lista
  // på versionId-byte + popover-open + env-var-sparning, men INTE när en ny
  // version landar medan popovern redan är öppen (t.ex. mitt i en generation).
  // `versionStatusNonce` bumpas när en generations post-check-flöde är klart
  // (`runPostGenerationChecks`), så vi speglar den ändringen som ett fönster-
  // event i stället för att tråda nonce genom hela preview-panel-kedjan.
  const isFirstVersionStatusNonceRef = useRef(true);
  useEffect(() => {
    if (isFirstVersionStatusNonceRef.current) {
      isFirstVersionStatusNonceRef.current = false;
      return;
    }
    dispatchVersionStatusRefreshed();
  }, [vm.versionStatusNonce]);

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
  // Ö1-paritet (A#12): medan readiness laddar (SWR initial load) vet vi inte
  // om servern skulle 409:a — håll knappen disablad i stället för att
  // fail-open:a mot `?? true` och låta klicket sluta i ett obegripligt fel.
  const isDeployReadinessPending = vm.isDeployReadinessLoading && !vm.deployReadiness;
  const canDeploy = Boolean(
    vm.chatId &&
      vm.activeVersionId &&
      !isDeployActionBusy &&
      !isDeployReadinessPending &&
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
            : isDeployReadinessPending
              ? "Kontrollerar publiceringsstatus…"
              : deployReadinessBlocker?.detail || deployReadinessBlocker?.title || null;
  const deployDisabledReason =
    deployReadinessBlocker?.action === "env" && baseDeployDisabledReason
      ? `${baseDeployDisabledReason} Lägg till nycklarna under Projektets miljövariabler (Lansering överst i chatpanelen).`
      : baseDeployDisabledReason;
  const { hasGitHub, user: authUser } = useAuth();
  const [f3Requirements, setF3Requirements] = useState<{
    parentVersionId: string;
    projectId?: string | null;
    requestStartedAt?: number;
    missingByIntegration: F3MissingIntegration[];
  } | null>(null);
  const [f3Status, setF3Status] = useState<F3BuilderStatus | null>(null);
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

  // A 412 payload belongs to the exact F2 version the user tried to finalize.
  // Keep it visible until that base changes; F3 status updates stay alongside
  // the requirements rather than replacing them.
  useEffect(() => {
    setF3Requirements((current) =>
      current &&
      vm.activeVersionId &&
      current.parentVersionId !== vm.activeVersionId
        ? null
        : current,
    );
  }, [vm.activeVersionId]);

  useEffect(() => {
    setF3Requirements(null);
    setF3Status(null);
  }, [vm.chatId]);

  useEffect(() => {
    const handleRequirements = (event: Event) => {
      const detail = readF3RequirementsDetail(event);
      if (!detail) return;
      // Chat correlation (Bugbot on this diff): a late 412 from a PREVIOUS
      // chat's stream must not surface another project's missing keys here.
      if (detail.chatId && detail.chatId !== vm.chatId) return;
      setF3Requirements(detail);
      setF3Status(null);
      // Owner decision 2026-07-13: a 412 also focuses the affected dossier in
      // the Byggblock popover (pure UI action — the server's
      // missingByIntegration stays the source of truth for the key scope).
      openDossiersPanel(detail.missingByIntegration.flatMap((entry) => entry.missing));
    };
    window.addEventListener(F3_REQUIREMENTS_EVENT, handleRequirements);
    return () =>
      window.removeEventListener(F3_REQUIREMENTS_EVENT, handleRequirements);
  }, [vm.chatId]);

  // Keys saved anywhere (Byggblock inline inputs, kravytan, env-panelen)
  // reconcile the DISPLAYED 412 payload. The server's original key scope in
  // `f3Requirements` is never mutated — saves accumulate (timestamped) in
  // `f3SavedEnvKeys` and the visible surface is derived by subtraction. A
  // delete removes the key again, so the requirement honestly reappears
  // (Codex P2 + Bugbot follow-ups on #525). Server-verdict precedence: when
  // a NEW 412 lands, saves made BEFORE that request started are pruned —
  // the server already saw them and still says the key is missing — while
  // saves made DURING the in-flight request are kept.
  const [f3SavedEnvKeys, setF3SavedEnvKeys] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const handleEnvUpdated = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      if (!detail || !detail.envKeys || detail.envKeys.length === 0) return;
      if (detail.chatId && detail.chatId !== vm.chatId) return;
      const keys = detail.envKeys.map((key) => key.trim().toUpperCase());
      const now = Date.now();
      setF3SavedEnvKeys((current) => {
        const next = new Map(current);
        for (const key of keys) {
          if (detail.action === "deleted") next.delete(key);
          else next.set(key, now);
        }
        return next;
      });
      // Deleting a key OUTSIDE the 412's missing-scope (Codex P1 on #525):
      // that key may have been the reason its integration was satisfied at
      // verdict time, and the client cannot re-add keys to a server-owned
      // scope — the whole verdict is stale. Drop the surface; the next
      // "Bygg integrationer" attempt fetches a fresh 412 with the correct
      // scope (the server gate itself was never bypassable, #517).
      if (detail.action === "deleted") {
        setF3Requirements((current) => {
          if (!current) return current;
          const scope = new Set(
            current.missingByIntegration.flatMap((entry) =>
              entry.missing.map((key) => key.trim().toUpperCase()),
            ),
          );
          const deletedOutsideScope = keys.some((key) => !scope.has(key));
          return deletedOutsideScope ? null : current;
        });
      }
    };
    window.addEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handleEnvUpdated);
    return () =>
      window.removeEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handleEnvUpdated);
  }, [vm.chatId]);
  useEffect(() => {
    setF3SavedEnvKeys(new Map());
  }, [vm.chatId]);
  // Prune on each new 412: entries older than the request start are stale —
  // the server verdict supersedes them (a retry that still 412s must re-show
  // those keys). No `requestStartedAt` → the verdict supersedes everything.
  useEffect(() => {
    if (!f3Requirements) return;
    const cutoff = f3Requirements.requestStartedAt ?? Number.POSITIVE_INFINITY;
    setF3SavedEnvKeys((current) => {
      let changed = false;
      const next = new Map<string, number>();
      for (const [key, savedAt] of current) {
        if (savedAt >= cutoff) next.set(key, savedAt);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [f3Requirements]);
  const visibleF3Requirements = useMemo(
    () =>
      subtractSavedKeysFromF3Requirements(f3Requirements, Array.from(f3SavedEnvKeys.keys())),
    [f3Requirements, f3SavedEnvKeys],
  );

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

  const latestPendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(vm.messages.map(toAIElementsFormat)),
    [vm.messages],
  );

  // Katalogval i Byggblock-panelen skickar via vm.sendMessage, som ABORTAR en
  // pågående stream. Ett val mitt i en generation skulle alltså döda den, och
  // ett val medan en fråga väntar skulle tyst avfärda frågan. Disable:a
  // katalograderna i båda lägena (panelen visar en kort hint).
  const catalogPickDisabled = isBusy || Boolean(latestPendingReply);
  // Färsk spegling av upptaget-läget så en async-sändare kan omkontrollera det
  // EFTER ett await (closure-fångat `catalogPickDisabled` hinner bli inaktuellt).
  // Tilldelas i render-kroppen (inte i useEffect): en await-continuation kör
  // som microtask direkt när promiset löser och kan hinna FÖRE effect-flushen —
  // render-tilldelningen gör att refen alltid speglar senaste committade värdet.
  const catalogPickDisabledRef = useRef(catalogPickDisabled);
  catalogPickDisabledRef.current = catalogPickDisabled;
  // Färsk spegling av aktiv chatt av samma skäl: en insättning som awaitat
  // registry-hydreringen får inte skicka till en chatt användaren lämnat.
  const activeChatIdRef = useRef(vm.chatId);
  activeChatIdRef.current = vm.chatId;

  // Insättnings-lane v1 ("Lägg till"-ytan, Fas 2): valt registry-kort →
  // välformat prompt (`shadcn-insert.ts`, hämtar registry-kod best-effort) →
  // BEFINTLIGA sendMessage-vägen → own-engine genererar + verifierar
  // (RenderGate) → ny version + preview. Aldrig rå filpatch. Fel re-throwas
  // så panelens kort ALDRIG visar "skickad" för en misslyckad insättning.
  // Global in-flight-spärr: kortens egna guards är per-komponent, så parallella
  // val från Bläddra + Beskriv (t.ex. via tabbyte mitt i registry-fetchen, innan
  // isBusy hunnit bli true) skulle annars kunna nå sendMessage båda två — den
  // andra aborterar då den förstas stream.
  const shadcnInsertInFlightRef = useRef(false);
  const handleShadcnItemInsert = useCallback(
    async (selection: ShadcnInsertSelection) => {
      if (!vm.chatId) {
        toast.error("Öppna eller skapa en chat först.");
        throw new Error("no active chat");
      }
      // Samma gate som dossier-katalogvalen (`catalogPickDisabled`): sendMessage
      // ABORTAR en pågående stream, och ett val medan en fråga väntar skulle
      // tyst avfärda frågan. Kasta så kortet aldrig markeras "skickat".
      if (catalogPickDisabled) {
        toast.error(
          isBusy
            ? "Vänta tills den pågående genereringen är klar."
            : "Svara på frågan i chatten innan du lägger till block.",
        );
        throw new Error("builder busy or awaiting reply");
      }
      if (shadcnInsertInFlightRef.current) {
        toast.error("En insättning pågår redan — vänta tills den är klar.");
        throw new Error("shadcn insert already in flight");
      }
      const entryChatId = vm.chatId;
      shadcnInsertInFlightRef.current = true;
      try {
        const built = await buildShadcnInsertMessage(selection);
        // Omkontroller efter registry-fetchen (upp till 8 s): closure-fångat
        // state lästes vid entry och kan ha hunnit bli inaktuellt.
        // (1) Chattbyte: skicka aldrig till en chatt användaren lämnat.
        if (activeChatIdRef.current !== entryChatId) {
          toast.error("Chatten byttes under insättningen — försök igen från den nya chatten.");
          throw new Error("active chat changed during insert build");
        }
        // (2) Upptaget-läge: sendMessage skulle aborta en pågående stream, och
        // ett val medan en fråga väntar skulle tyst avfärda frågan — kasta i
        // stället (kortet markeras aldrig skickat). Dossier-katalogen bygger
        // meddelandet synkront och har inte det här fönstret.
        if (catalogPickDisabledRef.current) {
          toast.error("Chatten är upptagen — vänta tills den är redo och försök igen.");
          throw new Error("builder became busy during insert build");
        }
        try {
          await sendMessage(built.message, { promptSourceMeta: built.meta });
        } catch (err) {
          toast.error("Kunde inte skicka blocket till own-engine.");
          throw err;
        }
      } finally {
        shadcnInsertInFlightRef.current = false;
      }
    },
    [sendMessage, vm.chatId, catalogPickDisabled, isBusy],
  );

  const handleRequestDossier = useCallback(
    (payload: { id: string; label: string }) => {
      const id = payload.id.trim();
      const label = payload.label.trim();
      if (!id || !label) return;
      // Sista försvarslinje utöver panelens disabled-rader: skicka aldrig om
      // buildern är upptagen (aborterar aktiv stream) — droppa hellre klicket.
      if (isBusy) return;
      void sendMessage(buildAddDossierMessage({ id, label }));
    },
    [sendMessage, isBusy],
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
        deploymentInspectorUrl={vm.deploymentInspectorUrl}
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
          {visibleF3Requirements ? (
            <F3RequirementsSurface
              projectId={visibleF3Requirements.projectId ?? vm.appProjectId}
              chatId={vm.chatId}
              versionId={visibleF3Requirements.parentVersionId}
              missingByIntegration={visibleF3Requirements.missingByIntegration}
              onRetry={() =>
                requestF3Rebuild(visibleF3Requirements.parentVersionId)
              }
            />
          ) : null}
          {f3Status ? <F3StatusSurface status={f3Status} /> : null}
          {/* Ägarbeslut 2026-07-22: ProjectEnvVarsPanel är borttagen — Byggblock-
              popovern (PreviewPanelDossiers) är den enda env-ytan i både F2 och F3. */}
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
              isStreaming={vm.isAnyStreaming}
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
            onPromptAssistModeReset={vm.handlePromptAssistModeReset}
            isFigmaInputOpen={isFigmaInputOpen}
            onFigmaInputOpenChange={setIsFigmaInputOpen}
            isBusy={isBusy}
            isPreparingPrompt={vm.isPreparingPrompt}
            mediaEnabled={vm.mediaEnabled}
            continuePlanMode={Boolean(latestPendingReply?.planMode)}
            designTheme={vm.designTheme}
            onDesignThemeChange={vm.setDesignTheme}
            isConfigLocked={vm.isAnyStreaming}
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
              onComposerAiFallback={handleComposerAiFallback}
              onShadcnItemInsert={handleShadcnItemInsert}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              isBusy={isBusy}
              onRequestDossier={handleRequestDossier}
              catalogPickDisabled={catalogPickDisabled}
              onF3MissingEnv={(payload) => {
                // The 412's group/key scope is owned by finalize-design — the
                // client never re-detects keys. Besides the persistent
                // requirements surface, focus the affected dossier in the
                // Byggblock popover (owner decision 2026-07-13). Chat
                // correlation: a slow finalize-response from a previous chat
                // must not repopulate the surface after a chat switch.
                if (payload.chatId && payload.chatId !== vm.chatId) return;
                setF3Requirements(payload);
                setF3Status(null);
                openDossiersPanel(
                  payload.missingByIntegration.flatMap((entry) => entry.missing),
                );
              }}
              onF3Status={(status) => {
                setF3Status(status);
              }}
              onF3Ready={(payload) => {
                // Auto-kick the F3 ("Bygg integrationer") generation as soon
                // as `/finalize-design` greenlights the F2 version. The
                // server reads `meta.lifecycleStage` + `meta.parentVersionId`
                // from this send and forks a new engine_versions row with
                // `lifecycle_stage = "integrations"` and `parent_version_id`
                // set to the F2 version we just finalized.
                setF3Requirements(null);
                void vm.sendMessage(
                  "Bygg integrationer nu utifrån den finaliserade designversionen.",
                  {
                    lifecycleStageOverride: "integrations",
                    parentVersionIdOverride: payload.parentVersionId,
                    engineBaseVersionIdOverride: payload.parentVersionId,
                  },
                );
              }}
              onF3ReleaseSettled={vm.handleDeterministicF3Settled}
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
