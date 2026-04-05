"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import {
  parseRetryAfterMs,
  SANDBOX_BOOTSTRAP_RETRY_FALLBACK_MS,
  shouldRetrySandboxBootstrapFetch,
} from "@/lib/builder/sandbox-bootstrap-retry";
import {
  PROJECT_ENV_VARS_UPDATED_EVENT,
  readProjectEnvVarsUpdatedDetail,
} from "@/lib/builder/project-env-events";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import type { SandboxPreviewPostApiJson } from "@/lib/gen/preview/preview-contract";
import type { SandboxProdBuildPayload } from "@/lib/hooks/chat/types";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { ChatData, VersionSummary } from "./useBuilderDerivedState";
import { versionSummaryHasSandbox } from "./builder-page-preview-helpers";

function isLegacyMappedChatRecord(chat: unknown): boolean {
  const c = chat as { v0ChatId?: string } | null | undefined;
  return Boolean(c?.v0ChatId);
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
 * Tier-2 VM-preview bootstrap (legacy `/sandbox-preview` contract), fel/prod-build state,
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

  const [sandboxBuildError, setSandboxBuildError] = useState<{
    stage: string;
    message: string;
  } | null>(null);
  const [sandboxProdBuild, setSandboxProdBuild] = useState<SandboxProdBuildPayload | null>(null);
  const [sandboxPending, setSandboxPending] = useState(false);
  const [activeSandboxMeta, setActiveSandboxMeta] = useState<{
    sandboxId: string;
    versionId: string;
  } | null>(null);
  const [sandboxPreviewRecovering, setSandboxPreviewRecovering] = useState(false);
  const sandboxBootstrapGenRef = useRef(0);
  const sandboxBootstrapDoneKeysRef = useRef<Set<string>>(new Set());
  const [sandboxBootstrapRetryNonce, setSandboxBootstrapRetryNonce] = useState(0);
  const sandboxBootstrapTransientAttemptsRef = useRef<Map<string, number>>(new Map());
  const [forcedSandboxRestartKey, setForcedSandboxRestartKey] = useState<string | null>(null);

  const onSandboxSessionMeta = useCallback(
    (meta: { sandboxId: string; versionId: string | null } | null) => {
      if (!meta?.sandboxId?.trim() || !meta.versionId?.trim()) return;
      const vid = meta.versionId.trim();
      setActiveSandboxMeta({
        sandboxId: meta.sandboxId.trim(),
        versionId: vid,
      });
      if (chatId && vid) {
        sandboxBootstrapDoneKeysRef.current.add(`${chatId}:${vid}`);
      }
    },
    [chatId],
  );

  const clearSandboxBuildError = useCallback(() => {
    setSandboxBuildError(null);
    setSandboxProdBuild(null);
    setSandboxPending(false);
  }, []);

  const resetSandboxForNewChat = useCallback(() => {
    setSandboxBuildError(null);
    setSandboxProdBuild(null);
    setSandboxPending(false);
  }, []);

  const clearSandboxSessionState = useCallback((versionId?: string | null) => {
    const key =
      chatId && versionId?.trim()
        ? `${chatId}:${versionId.trim()}`
        : null;
    if (key) {
      sandboxBootstrapDoneKeysRef.current.delete(key);
      sandboxBootstrapTransientAttemptsRef.current.delete(key);
      setForcedSandboxRestartKey((current) => (current === key ? null : current));
    }
    setActiveSandboxMeta(null);
    setSandboxBuildError(null);
    setSandboxProdBuild(null);
    setSandboxPending(false);
    setSandboxPreviewRecovering(false);
  }, [chatId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      if (!detail) return;
      if (!appProjectId || detail.projectId !== appProjectId) return;
      if (!chatId || !activeVersionId) return;
      if (detail.chatId && detail.chatId !== chatId) return;
      if (detail.versionId && detail.versionId !== activeVersionId) return;
      const key = `${chatId}:${activeVersionId}`;
      sandboxBootstrapDoneKeysRef.current.delete(key);
      sandboxBootstrapTransientAttemptsRef.current.delete(key);
      setForcedSandboxRestartKey(key);
      setSandboxBuildError(null);
      setSandboxProdBuild(null);
      setSandboxBootstrapRetryNonce((value) => value + 1);
      toast.message("Miljövariabler sparade", {
        description: "Startar om live-preview för att ladda om sandbox med nya värden.",
        duration: 6000,
      });
    };

    window.addEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler as EventListener);
    };
  }, [appProjectId, chatId, activeVersionId]);

  useEffect(() => {
    sandboxBootstrapDoneKeysRef.current.clear();
    sandboxBootstrapTransientAttemptsRef.current.clear();
    const resetTimer = window.setTimeout(() => {
      setSandboxBootstrapRetryNonce(0);
      setForcedSandboxRestartKey(null);
      setActiveSandboxMeta(null);
      setSandboxPreviewRecovering(false);
    }, 0);
    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [chatId]);

  useEffect(() => {
    if (!activeSandboxMeta || !activeVersionId) return;
    if (activeSandboxMeta.versionId !== activeVersionId) {
      setActiveSandboxMeta(null);
    }
  }, [activeSandboxMeta, activeVersionId]);

  useEffect(() => {
    const gen = ++sandboxBootstrapGenRef.current;

    if (!isAuthenticated || !chatId || !activeVersionId) return;
    if (isChatLoading || !chat) return;
    if (isAnyStreamingEarly) return;
    if (isLegacyMappedChatRecord(chat)) return;

    const key = `${chatId}:${activeVersionId}`;
    const isForcedRestart = forcedSandboxRestartKey === key;
    if (sandboxBootstrapDoneKeysRef.current.has(key) && !isForcedRestart) return;

    if (
      !isForcedRestart &&
      activeSandboxMeta?.versionId === activeVersionId &&
      activeSandboxMeta.sandboxId
    ) {
      sandboxBootstrapDoneKeysRef.current.add(key);
      return;
    }

    const activeMatch = effectiveVersionsList.find(
      (v) => (v.versionId || v.id) === activeVersionId,
    );
    if (!activeMatch) return;
    if (!canExposeEnginePreview(activeMatch) && !isForcedRestart) {
      sandboxBootstrapDoneKeysRef.current.add(key);
      return;
    }
    if (versionSummaryHasSandbox(activeMatch, { allowFailed: isForcedRestart })) {
      if (!isForcedRestart) return;
    }

    if (!isShimOrMissingPreviewUrl(currentPreviewUrl) && !isForcedRestart) {
      sandboxBootstrapDoneKeysRef.current.add(key);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const tid = window.setTimeout(() => {
      void (async () => {
        if (cancelled || sandboxBootstrapGenRef.current !== gen) return;

        const finishBootstrapFailure = (failure?: {
          stage?: string | null;
          message?: string | null;
        }) => {
          sandboxBootstrapDoneKeysRef.current.add(key);
          sandboxBootstrapTransientAttemptsRef.current.delete(key);
          if (isForcedRestart) {
            setForcedSandboxRestartKey((current) => (current === key ? null : current));
          }
          setSandboxBuildError({
            stage: failure?.stage?.trim() || "sandbox-create",
            message:
              failure?.message?.trim() ||
              "Live-preview kunde inte starta i VM-previewn.",
          });
          setSandboxProdBuild(null);
          setSandboxPending(false);
          if (isForcedRestart) setSandboxPreviewRecovering(false);
        };

        const scheduleTransientRetry = (
          delayMs: number,
          finalFailure?: { stage?: string | null; message?: string | null },
        ) => {
          const prev = sandboxBootstrapTransientAttemptsRef.current.get(key) ?? 0;
          const next = prev + 1;
          sandboxBootstrapTransientAttemptsRef.current.set(key, next);
          if (next <= 4) {
            window.setTimeout(() => {
              setSandboxBootstrapRetryNonce((n) => n + 1);
            }, delayMs);
          } else {
            finishBootstrapFailure(
              finalFailure ?? {
                stage: "sandbox-create",
                message: "Live-preview kunde inte starta efter flera försök.",
              },
            );
          }
        };

        try {
          setSandboxPending(true);
          const res = await fetch(`${engineChatBaseUrl(chatId)}/sandbox-preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              versionId: activeVersionId,
              forceRestart: isForcedRestart,
            }),
            signal: ac.signal,
          });
          const data = (await res.json().catch(() => null)) as SandboxPreviewPostApiJson | null;
          if (cancelled || sandboxBootstrapGenRef.current !== gen) return;

          if (res.status === 503) {
            if (
              process.env.NODE_ENV === "development" &&
              data?.code === "sandbox_disabled" &&
              typeof data.hint === "string" &&
              data.hint.trim()
            ) {
              toast.message("Sandbox ej konfigurerad", {
                description: data.hint.trim(),
                duration: 14_000,
              });
            }
            if (data?.code === "sandbox_disabled") {
              const persistedHint =
                typeof data.hint === "string" && data.hint.trim().length > 0
                  ? data.hint.trim()
                  : typeof data.message === "string" && data.message.trim().length > 0
                    ? data.message.trim()
                    : "Sandbox är inte konfigurerad i den här miljön.";
              setSandboxBuildError({
                stage: "sandbox_disabled",
                message: persistedHint,
              });
              setSandboxProdBuild(null);
              setSandboxPending(false);
              if (isForcedRestart) setSandboxPreviewRecovering(false);
              return;
            }
          }

          const serverSaysNoRetry = data?.retryable === false;
          const responseLooksFailed = !data || !data.ok;
          const shouldRetryBootstrap =
            !serverSaysNoRetry &&
            responseLooksFailed &&
            shouldRetrySandboxBootstrapFetch({
              httpStatus: res.status,
              retryable: data?.retryable,
            });
          if (shouldRetryBootstrap) {
            scheduleTransientRetry(
              parseRetryAfterMs(res.headers, SANDBOX_BOOTSTRAP_RETRY_FALLBACK_MS),
              {
                stage: data?.stage ?? "sandbox-create",
                message: data?.message ?? "Live-preview kunde inte starta i VM-previewn.",
              },
            );
            return;
          }

          if (!data?.ok) {
            finishBootstrapFailure({
              stage: data?.stage ?? "sandbox-create",
              message: data?.message ?? "Live-preview kunde inte starta i VM-previewn.",
            });
            return;
          }

          if (typeof data.sandboxUrl !== "string" || !data.sandboxUrl.trim()) {
            finishBootstrapFailure({
              stage: data?.stage ?? "sandbox-create",
              message: "Previewn startade men returnerade ingen preview-URL.",
            });
            return;
          }

          sandboxBootstrapDoneKeysRef.current.add(key);
          sandboxBootstrapTransientAttemptsRef.current.delete(key);
          if (isForcedRestart) {
            setForcedSandboxRestartKey((current) => (current === key ? null : current));
          }
          setSandboxBuildError(null);
          setSandboxPending(false);
          setSandboxPreviewRecovering(false);
          onBootstrapRecoverSucceeded?.();
          setCurrentPreviewUrl(data.sandboxUrl.trim());
          bumpPreviewRefreshToken();
          const activeVid = activeVersionId;
          if (activeVid && typeof data.sandboxId === "string" && data.sandboxId.trim()) {
            setActiveSandboxMeta({
              sandboxId: data.sandboxId.trim(),
              versionId: activeVid,
            });
          }
          if (typeof data.prodBuildVerified === "boolean") {
            setSandboxProdBuild({
              verified: data.prodBuildVerified,
              logSnippet:
                !data.prodBuildVerified && typeof data.prodBuildLogSnippet === "string"
                  ? data.prodBuildLogSnippet
                  : undefined,
            });
          } else {
            setSandboxProdBuild(null);
          }
          if (isForcedRestart) {
            logSandboxLifecycleTelemetry({
              kind: "recover",
              phase: "succeeded",
              chatId,
              ...(activeVersionId ? { versionId: activeVersionId } : {}),
            });
          }
          void mutateChat();
          void mutateVersions();
        } catch (err) {
          if (cancelled || sandboxBootstrapGenRef.current !== gen) return;
          if (err instanceof Error && err.name === "AbortError") return;
          scheduleTransientRetry(SANDBOX_BOOTSTRAP_RETRY_FALLBACK_MS, {
            stage: "sandbox-create",
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
    };
  }, [
    isAuthenticated,
    chatId,
    activeVersionId,
    activeSandboxMeta,
    effectiveVersionsList,
    chat,
    isAnyStreamingEarly,
    isChatLoading,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    setSandboxPending,
    bumpPreviewRefreshToken,
    mutateChat,
    mutateVersions,
    forcedSandboxRestartKey,
    sandboxBootstrapRetryNonce,
    isShimOrMissingPreviewUrl,
    onBootstrapRecoverSucceeded,
  ]);

  return {
    sandboxBuildError,
    sandboxProdBuild,
    sandboxPending,
    sandboxPreviewRecovering,
    setSandboxPreviewRecovering,
    activeSandboxMeta,
    setSandboxBuildError,
    setSandboxProdBuild,
    setSandboxPending,
    onSandboxSessionMeta,
    clearSandboxBuildError,
    clearSandboxSessionState,
    resetSandboxForNewChat,
    sandboxBootstrapDoneKeysRef,
    forcedSandboxRestartKey,
    setForcedSandboxRestartKey,
    sandboxBootstrapRetryNonce,
    setSandboxBootstrapRetryNonce,
  };
}
