"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { isSandboxPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";

export type UsePreviewSessionParams = {
  chatId: string | null;
  activeVersionId: string | null;
  currentPreviewUrl: string | null;
  activePreviewSessionMeta: { previewSessionId: string; versionId: string } | null;
  setCurrentPreviewUrl: (url: string) => void;
  bumpPreviewRefreshToken: () => void;
  setPreviewSessionRecovering: (v: boolean) => void;
  previewBootstrapDoneKeysRef: MutableRefObject<Set<string>>;
  setForcedPreviewRestartKey: (key: string | null) => void;
  setPreviewBootstrapRetryNonce: Dispatch<SetStateAction<number>>;
};

/**
 * Server-driven preview session checks: status fetch, URL resync, recover bootstrap.
 */
export function usePreviewSession(params: UsePreviewSessionParams) {
  const {
    chatId,
    activeVersionId,
    currentPreviewUrl,
    activePreviewSessionMeta,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce,
  } = params;

  const lastPreviewRecoverAtRef = useRef(0);
  const previewRecoverAttemptsRef = useRef(0);

  useEffect(() => {
    previewRecoverAttemptsRef.current = 0;
    lastPreviewRecoverAtRef.current = 0;
  }, [chatId]);

  const handlePreviewSessionSuspect = useCallback(async () => {
    const versionId = activeVersionId;
    if (!chatId || !versionId) return;
    const demo = normalizePreviewUrl(currentPreviewUrl);
    if (!demo || !isSandboxPreviewUrl(demo)) return;

    const now = Date.now();
    if (now - lastPreviewRecoverAtRef.current < 12_000) return;
    lastPreviewRecoverAtRef.current = now;

    const statusPayload = await fetchPreviewStatus({
      chatId,
      versionId,
      previewSessionId: activePreviewSessionMeta?.previewSessionId ?? null,
    });
    if (!statusPayload) return;

    if (statusPayload.status === "running") {
      const serverUrl = statusPayload.previewUrl?.trim() ?? "";
      if (serverUrl) {
        const cur = normalizePreviewUrl(currentPreviewUrl);
        const next = normalizePreviewUrl(serverUrl);
        if (next && next !== cur) {
          logSandboxLifecycleTelemetry({
            kind: "sandbox_url_resync",
            chatId,
            versionId,
            detail: "status_running_mismatch",
          });
          setCurrentPreviewUrl(serverUrl);
          bumpPreviewRefreshToken();
        }
      }
      return;
    }

    if (previewRecoverAttemptsRef.current >= 5) {
      logSandboxLifecycleTelemetry({
        kind: "recover",
        phase: "failed",
        chatId,
        versionId,
        detail: "max_attempts",
      });
      setPreviewSessionRecovering(false);
      return;
    }
    previewRecoverAttemptsRef.current += 1;

    logSandboxLifecycleTelemetry({
      kind: "recover",
      phase: "started",
      chatId,
      versionId,
      detail: statusPayload.status,
    });

    setPreviewSessionRecovering(true);
    const key = `${chatId}:${versionId}`;
    previewBootstrapDoneKeysRef.current.delete(key);
    setForcedPreviewRestartKey(key);
    setPreviewBootstrapRetryNonce((n) => n + 1);
  }, [
    chatId,
    activeVersionId,
    activePreviewSessionMeta,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce,
  ]);

  const resetRecoverAttempts = useCallback(() => {
    previewRecoverAttemptsRef.current = 0;
  }, []);

  return { handlePreviewSessionSuspect, resetRecoverAttempts };
}
