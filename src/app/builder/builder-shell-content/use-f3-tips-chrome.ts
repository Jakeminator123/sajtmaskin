import {
  F3_REQUIREMENTS_EVENT,
  F3_STATUS_EVENT,
  openDossiersPanel,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  readF3RequirementsDetail,
  readF3StatusDetail,
  readProjectEnvVarsUpdatedDetail,
  subtractSavedKeysFromF3Requirements,
} from "@/lib/builder/project-env-events";
import type {
  F3BuilderStatus,
  F3MissingIntegration,
} from "@/components/builder/F3RequirementsSurface";
import { compressAssistantCodeBlocks } from "@/lib/builder/openclaw-context-messages";
import { buildPromptSourceMessage } from "@/lib/builder/prompt-builder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/builder/types";
import type { BuilderViewModel } from "../useBuilderPageController";
import {
  TIP_ASSISTANT_MESSAGE_MAX_CHARS,
  TIP_CODE_MAX_CHARS,
  TIP_USER_MESSAGE_MAX_CHARS,
  type TipApiResponse,
  buildRecentContextMessages,
  getLatestCompletedAssistantMessage,
  getLatestUserMessage,
} from "./context-helpers";

export function useShellF3TipsChrome(vm: BuilderViewModel, sendMessage: BuilderViewModel["sendMessage"]) {
  const [f3Requirements, setF3Requirements] = useState<{
    parentVersionId: string;
    projectId?: string | null;
    requestStartedAt?: number;
    missingByIntegration: F3MissingIntegration[];
  } | null>(null);
  const [f3Status, setF3Status] = useState<F3BuilderStatus | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");

  // (Prompt-prefill-lyssnaren togs bort 2026-07-31: Byggval-reglagen skriver
  // inte längre i chattens input, och exempel-chipsen försvann med #673.)
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
              latestAssistantMessage: compressAssistantCodeBlocks(assistantMessage.content).slice(
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

  // Same drift rule for the status row: a verdict describes one version, so it
  // must not linger over another one the user selected afterwards — its
  // "Visa diagnostik" link would then open a different version's log (bugbot on
  // #639). Outcomes with no version of their own (e.g. "no version yet") are
  // kept until the chat changes.
  useEffect(() => {
    setF3Status((current) =>
      current?.versionId && vm.activeVersionId && current.versionId !== vm.activeVersionId
        ? null
        : current,
    );
  }, [vm.activeVersionId]);

  // The effect above only runs when the ACTIVE version changes. A late status
  // event for another version (e.g. a slow ReleaseGate verdict landing after
  // the user switched back to an older version) would otherwise render on top
  // of the wrong version until the next switch. Gate at render time instead of
  // dropping the event on arrival: a verdict for a version that is activated a
  // moment later (the fresh-build lane from #639) becomes visible as soon as
  // `vm.activeVersionId` catches up.
  const visibleF3Status =
    f3Status?.versionId && vm.activeVersionId && f3Status.versionId !== vm.activeVersionId
      ? null
      : f3Status;

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

  // The chat-stream lane runs its own nested finalize (409
  // `f3_deterministic_release_required`) and has no `onStatus` callback, so its
  // ReleaseGate verdict arrives as an event. Without this the row — and its
  // diagnostics link — only ever appeared for the preview-button lane (bugbot
  // on #639).
  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = readF3StatusDetail(event);
      if (!detail) return;
      if (detail.chatId && detail.chatId !== vm.chatId) return;
      setF3Status({
        tone: detail.tone,
        title: detail.title,
        description: detail.description,
        versionId: detail.versionId ?? null,
      });
    };
    window.addEventListener(F3_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(F3_STATUS_EVENT, handleStatus);
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
  return {
    f3Requirements,
    setF3Requirements,
    f3Status,
    setF3Status,
    visibleF3Status,
    visibleF3Requirements,
    mobileTab,
    setMobileTab,
    githubExportOpen,
    setGithubExportOpen,
    enableAutofix,
    setEnableAutofix,
    isFigmaInputOpen,
    setIsFigmaInputOpen,
    tipPanelOpen,
    setTipPanelOpen,
    tipText,
    tipError,
    tipCost,
    isTipLoading,
    handleApproveBuildPlan,
    handleRefreshTip,
  };
}
