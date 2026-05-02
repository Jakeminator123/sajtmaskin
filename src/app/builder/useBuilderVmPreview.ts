"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import {
  parseRetryAfterMs,
  PREVIEW_BOOTSTRAP_RETRY_FALLBACK_MS,
  shouldRetryPreviewBootstrapFetch,
} from "@/lib/builder/preview-bootstrap-retry";
import {
  PROJECT_ENV_VARS_UPDATED_EVENT,
  readProjectEnvVarsUpdatedDetail,
} from "@/lib/builder/project-env-events";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import type { PreviewSessionPostApiJson } from "@/lib/gen/preview/preview-contract";
import type { PreviewProdBuildPayload } from "@/lib/hooks/chat/types";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { ChatData, VersionSummary } from "./useBuilderDerivedState";
import { versionSummaryHasPreview } from "./builder-page-preview-helpers";

function isLegacyMappedChatRecord(chat: unknown): boolean {
  const c = chat as { v0ChatId?: string } | null | undefined;
  return Boolean(c?.v0ChatId);
}

export function hasMatchingPreviewSessionMeta(
  meta: { previewSessionId: string; versionId: string } | null | undefined,
  versionId: string | null | undefined,
): boolean {
  return Boolean(
    versionId?.trim() &&
      meta?.versionId === versionId &&
      meta.previewSessionId.trim(),
  );
}

export type UseBuilderVmPreviewParams = {
  isAuthenticated: boolean;
  chatId: string | null;
  appProjectId: string | null;
  activeVersionId: string | null;
  effectiveVersionsList: VersionSummary[];
  chat: ChatData | null | undefined;
  isAnyStreamingEarly: boolean;
  isChatLoading: boolean;
  currentPreviewUrl: string | null;
  setCurrentPreviewUrl: (url: string | null) => void;
  bumpPreviewRefreshToken: () => void;
  mutateChat: () => void;
  mutateVersions: () => void;
  isShimOrMissingPreviewUrl: (url: string | null | undefined) => boolean;
  onBootstrapRecoverSucceeded?: () => void;
};

/**
 * Tier-2 VM-preview bootstrap (`/preview-session` contract), fel/prod-build state,
 * env-restart och session-meta.
 */
export function useBuilderVmPreview(params: UseBuilderVmPreviewParams) {
  const {
    isAuthenticated,
    chatId,
    appProjectId,
    activeVersionId,
    effectiveVersionsList,
    chat,
    isAnyStreamingEarly,
    isChatLoading,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    mutateChat,
    mutateVersions,
    isShimOrMissingPreviewUrl,
    onBootstrapRecoverSucceeded,
  } = params;

  const [previewBuildError, setPreviewBuildError] = useState<{
    stage: string;
    message: string;
  } | null>(null);
  const [previewProdBuild, setPreviewProdBuild] = useState<PreviewProdBuildPayload | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [activePreviewSessionMeta, setActivePreviewSessionMeta] = useState<{
    previewSessionId: string;
    versionId: string;
  } | null>(null);
  const [previewSessionRecovering, setPreviewSessionRecovering] = useState(false);
  const previewBootstrapGenRef = useRef(0);
  const previewBootstrapDoneKeysRef = useRef<Set<string>>(new Set());
  const [previewBootstrapRetryNonce, setPreviewBootstrapRetryNonce] = useState(0);
  const previewBootstrapTransientAttemptsRef = useRef<Map<string, number>>(new Map());
  // Pending transient-retry timeouts so we can cancel them on cleanup
  // (chat/version switch, unmount). See scheduleTransientRetry below.
  const pendingRetryTimeoutsRef = useRef<number[]>([]);
  const [forcedPreviewRestartKey, setForcedPreviewRestartKey] = useState<string | null>(null);
  const lastPreviewBootstrapSyncAtRef = useRef(0);

  const onPreviewSessionMeta = useCallback(
    (meta: { previewSessionId: string; versionId: string | null } | null) => {
      if (!meta?.previewSessionId?.trim() || !meta.versionId?.trim()) return;
      const vid = meta.versionId.trim();
      setActivePreviewSessionMeta({
        previewSessionId: meta.previewSessionId.trim(),
        versionId: vid,
      });
      if (chatId && vid) {
        previewBootstrapDoneKeysRef.current.add(`${chatId}:${vid}`);
      }
    },
    [chatId],
  );

  const clearPreviewBuildError = useCallback(() => {
    setPreviewBuildError(null);
    setPreviewProdBuild(null);
    setPreviewPending(false);
  }, []);

  const resetPreviewForNewChat = useCallback(() => {
    setPreviewBuildError(null);
    setPreviewProdBuild(null);
    setPreviewPending(false);
  }, []);

  const clearPreviewSessionState = useCallback((versionId?: string | null) => {
    const key =
      chatId && versionId?.trim()
        ? `${chatId}:${versionId.trim()}`
        : null;
    if (key) {
      previewBootstrapDoneKeysRef.current.delete(key);
      previewBootstrapTransientAttemptsRef.current.delete(key);
      setForcedPreviewRestartKey((current) => (current === key ? null : current));
    }
    setActivePreviewSessionMeta(null);
    setPreviewBuildError(null);
    setPreviewProdBuild(null);
    setPreviewPending(false);
    setPreviewSessionRecovering(false);
  }, [chatId]);

  const syncServerStateAfterPreviewBootstrap = useCallback(() => {
    const now = Date.now();
    if (now - lastPreviewBootstrapSyncAtRef.current < 15_000) {
      return;
    }
    lastPreviewBootstrapSyncAtRef.current = now;
    void mutateChat();
    void mutateVersions();
  }, [mutateChat, mutateVersions]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      if (!detail) return;
      if (!appProjectId || detail.projectId !== appProjectId) return;
      if (!chatId || !activeVersionId) return;
      if (detail.chatId && detail.chatId !== chatId) return;
      if (detail.versionId && detail.versionId !== activeVersionId) return;
      const key = `${chatId}:${activeVersionId}`;
      previewBootstrapDoneKeysRef.current.delete(key);
      previewBootstrapTransientAttemptsRef.current.delete(key);
      setForcedPreviewRestartKey(key);
      setPreviewBuildError(null);
      setPreviewProdBuild(null);
      setPreviewBootstrapRetryNonce((value) => value + 1);
      toast.message("Miljövariabler sparade", {
        description: "Startar om live-preview för att ladda om VM-previewn med nya värden.",
        duration: 6000,
      });
    };

    window.addEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler as EventListener);
    };
  }, [appProjectId, chatId, activeVersionId]);

  useEffect(() => {
    previewBootstrapDoneKeysRef.current.clear();
    previewBootstrapTransientAttemptsRef.current.clear();
    const resetTimer = window.setTimeout(() => {
      setPreviewBootstrapRetryNonce(0);
      setForcedPreviewRestartKey(null);
      setActivePreviewSessionMeta(null);
      setPreviewSessionRecovering(false);
    }, 0);
    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [chatId]);

  useEffect(() => {
    if (!activePreviewSessionMeta || !activeVersionId) return;
    if (activePreviewSessionMeta.versionId !== activeVersionId) {
      /* eslint-disable react-hooks/set-state-in-effect -- drop stale session meta when version changes */
      setActivePreviewSessionMeta(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [activePreviewSessionMeta, activeVersionId]);

  useEffect(() => {
    const gen = ++previewBootstrapGenRef.current;

    if (!isAuthenticated || !chatId || !activeVersionId) return;
    if (isChatLoading || !chat) return;
    if (isAnyStreamingEarly) return;
    if (isLegacyMappedChatRecord(chat)) return;

    const key = `${chatId}:${activeVersionId}`;
    const isForcedRestart = forcedPreviewRestartKey === key;
    const hasMatchingSession = hasMatchingPreviewSessionMeta(
      activePreviewSessionMeta,
      activeVersionId,
    );
    if (previewBootstrapDoneKeysRef.current.has(key) && !isForcedRestart) return;

    if (!isForcedRestart && hasMatchingSession) {
      previewBootstrapDoneKeysRef.current.add(key);
      return;
    }

    const activeMatch = effectiveVersionsList.find(
      (v) => (v.versionId || v.id) === activeVersionId,
    );
    if (!activeMatch) return;
    if (!canExposeEnginePreview(activeMatch) && !isForcedRestart) {
      previewBootstrapDoneKeysRef.current.add(key);
      return;
    }
    if (
      versionSummaryHasPreview(activeMatch, { allowFailed: isForcedRestart }) &&
      hasMatchingSession
    ) {
      if (!isForcedRestart) return;
    }

    if (!isShimOrMissingPreviewUrl(currentPreviewUrl) && !isForcedRestart && hasMatchingSession) {
      previewBootstrapDoneKeysRef.current.add(key);
      queueMicrotask(() => setPreviewPending(false));
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const tid = window.setTimeout(() => {
      void (async () => {
        if (cancelled || previewBootstrapGenRef.current !== gen) return;

        const finishBootstrapFailure = (failure?: {
          stage?: string | null;
          message?: string | null;
        }) => {
          previewBootstrapDoneKeysRef.current.add(key);
          previewBootstrapTransientAttemptsRef.current.delete(key);
          if (isForcedRestart) {
            setForcedPreviewRestartKey((current) => (current === key ? null : current));
          }
          setPreviewBuildError({
            stage: failure?.stage?.trim() || "preview-start",
            message:
              failure?.message?.trim() ||
              "Live-preview kunde inte starta i VM-previewn.",
          });
          setPreviewProdBuild(null);
          setPreviewPending(false);
          if (isForcedRestart) setPreviewSessionRecovering(false);
        };

        const scheduleTransientRetry = (
          delayMs: number,
          finalFailure?: { stage?: string | null; message?: string | null },
        ) => {
          const prev = previewBootstrapTransientAttemptsRef.current.get(key) ?? 0;
          const next = prev + 1;
          previewBootstrapTransientAttemptsRef.current.set(key, next);
          if (next <= 4) {
            // Track the timeout id so the effect cleanup can clear it.
            // Without this, a chat/version switch leaves stale retries
            // pending which then bump previewBootstrapRetryNonce and
            // trigger spurious effect re-runs against the old version.
            // Discovered in Wave 5 race-condition audit.
            const retryId = window.setTimeout(() => {
              if (cancelled || previewBootstrapGenRef.current !== gen) return;
              setPreviewBootstrapRetryNonce((n) => n + 1);
            }, delayMs);
            pendingRetryTimeoutsRef.current.push(retryId);
          } else {
            finishBootstrapFailure(
              finalFailure ?? {
                stage: "preview-start",
                message: "Live-preview kunde inte starta efter flera försök.",
              },
            );
          }
        };

        try {
          setPreviewPending(true);
          const res = await fetch(`${engineChatBaseUrl(chatId)}/preview-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              versionId: activeVersionId,
              forceRestart: isForcedRestart,
            }),
            signal: ac.signal,
          });
          const data = (await res.json().catch(() => null)) as PreviewSessionPostApiJson | null;
          if (cancelled || previewBootstrapGenRef.current !== gen) return;

          if (res.status === 503) {
            if (
              process.env.NODE_ENV === "development" &&
              data?.code === "preview_session_disabled" &&
              typeof data.hint === "string" &&
              data.hint.trim()
            ) {
              toast.message("VM-preview ej konfigurerad", {
                description: data.hint.trim(),
                duration: 14_000,
              });
            }
            if (data?.code === "preview_session_disabled") {
              const persistedHint =
                typeof data.hint === "string" && data.hint.trim().length > 0
                  ? data.hint.trim()
                  : typeof data.message === "string" && data.message.trim().length > 0
                    ? data.message.trim()
                    : "VM-preview är inte konfigurerad i den här miljön.";
              setPreviewBuildError({
                stage: "preview_session_disabled",
                message: persistedHint,
              });
              setPreviewProdBuild(null);
              setPreviewPending(false);
              if (isForcedRestart) setPreviewSessionRecovering(false);
              return;
            }
          }

          const serverSaysNoRetry = data?.retryable === false;
          const responseLooksFailed = !data || !data.ok;
          const shouldRetryBootstrap =
            !serverSaysNoRetry &&
            responseLooksFailed &&
            shouldRetryPreviewBootstrapFetch({
              httpStatus: res.status,
              retryable: data?.retryable,
            });
          if (shouldRetryBootstrap) {
            scheduleTransientRetry(
              parseRetryAfterMs(res.headers, PREVIEW_BOOTSTRAP_RETRY_FALLBACK_MS),
              {
                stage: data?.stage ?? "preview-start",
                message: data?.message ?? "Live-preview kunde inte starta i VM-previewn.",
              },
            );
            return;
          }

          if (!data?.ok) {
            finishBootstrapFailure({
              stage: data?.stage ?? "preview-start",
              message: data?.message ?? "Live-preview kunde inte starta i VM-previewn.",
            });
            return;
          }

          if (typeof data.previewUrl !== "string" || !data.previewUrl.trim()) {
            finishBootstrapFailure({
              stage: data?.stage ?? "preview-start",
              message: "Previewn startade men returnerade ingen preview-URL.",
            });
            return;
          }

          previewBootstrapDoneKeysRef.current.add(key);
          previewBootstrapTransientAttemptsRef.current.delete(key);
          if (isForcedRestart) {
            setForcedPreviewRestartKey((current) => (current === key ? null : current));
          }
          setPreviewBuildError(null);
          setPreviewPending(false);
          setPreviewSessionRecovering(false);
          onBootstrapRecoverSucceeded?.();
          setCurrentPreviewUrl(data.previewUrl.trim());
          bumpPreviewRefreshToken();
          const activeVid = activeVersionId;
          if (
            activeVid &&
            typeof data.previewSessionId === "string" &&
            data.previewSessionId.trim()
          ) {
            setActivePreviewSessionMeta({
              previewSessionId: data.previewSessionId.trim(),
              versionId: activeVid,
            });
          }
          if (typeof data.prodBuildVerified === "boolean") {
            setPreviewProdBuild({
              verified: data.prodBuildVerified,
              logSnippet:
                !data.prodBuildVerified && typeof data.prodBuildLogSnippet === "string"
                  ? data.prodBuildLogSnippet
                  : undefined,
            });
          } else {
            setPreviewProdBuild(null);
          }
          if (isForcedRestart) {
            logPreviewLifecycleTelemetry({
              kind: "recover",
              phase: "succeeded",
              chatId,
              ...(activeVersionId ? { versionId: activeVersionId } : {}),
            });
          }
          syncServerStateAfterPreviewBootstrap();
        } catch (err) {
          if (cancelled || previewBootstrapGenRef.current !== gen) return;
          if (err instanceof Error && err.name === "AbortError") return;
          scheduleTransientRetry(PREVIEW_BOOTSTRAP_RETRY_FALLBACK_MS, {
            stage: "preview-start",
            message:
              err instanceof Error && err.message.trim()
                ? err.message.trim()
                : "Live-preview kunde inte starta i VM-previewn.",
          });
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(tid);
      // Cancel any pending transient retries so they don't fire against
      // a stale chat/version. (See scheduleTransientRetry above.)
      for (const id of pendingRetryTimeoutsRef.current) {
        clearTimeout(id);
      }
      pendingRetryTimeoutsRef.current = [];
    };
  }, [
    isAuthenticated,
    chatId,
    activeVersionId,
    activePreviewSessionMeta,
    effectiveVersionsList,
    chat,
    isAnyStreamingEarly,
    isChatLoading,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    setPreviewPending,
    bumpPreviewRefreshToken,
    mutateChat,
    mutateVersions,
    syncServerStateAfterPreviewBootstrap,
    forcedPreviewRestartKey,
    previewBootstrapRetryNonce,
    isShimOrMissingPreviewUrl,
    onBootstrapRecoverSucceeded,
  ]);

  return {
    previewBuildError,
    previewProdBuild,
    previewPending,
    previewSessionRecovering,
    setPreviewSessionRecovering,
    activePreviewSessionMeta,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewSessionMeta,
    clearPreviewBuildError,
    clearPreviewSessionState,
    resetPreviewForNewChat,
    previewBootstrapDoneKeysRef,
    forcedPreviewRestartKey,
    setForcedPreviewRestartKey,
    previewBootstrapRetryNonce,
    setPreviewBootstrapRetryNonce,
  };
}
