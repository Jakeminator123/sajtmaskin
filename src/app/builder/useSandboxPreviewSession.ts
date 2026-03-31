"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import { fetchSandboxStatus } from "@/lib/builder/preview-session/api";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { isSandboxPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";

export type UseSandboxPreviewSessionParams = {
  chatId: string | null;
  activeVersionId: string | null;
  currentPreviewUrl: string | null;
  activeSandboxMeta: { sandboxId: string; versionId: string } | null;
  setCurrentPreviewUrl: (url: string) => void;
  bumpPreviewRefreshToken: () => void;
  setSandboxPreviewRecovering: (v: boolean) => void;
  sandboxBootstrapDoneKeysRef: MutableRefObject<Set<string>>;
  setForcedSandboxRestartKey: (key: string | null) => void;
  setSandboxBootstrapRetryNonce: Dispatch<SetStateAction<number>>;
};

/**
 * Server-driven sandbox session checks: status fetch, URL resync, recover bootstrap.
 */
export function useSandboxPreviewSession(params: UseSandboxPreviewSessionParams) {
  const {
    chatId,
    activeVersionId,
    currentPreviewUrl,
    activeSandboxMeta,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setSandboxPreviewRecovering,
    sandboxBootstrapDoneKeysRef,
    setForcedSandboxRestartKey,
    setSandboxBootstrapRetryNonce,
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

    const statusPayload = await fetchSandboxStatus({
      chatId,
      versionId,
      sandboxId: activeSandboxMeta?.sandboxId ?? null,
    });
    if (!statusPayload) return;

    if (statusPayload.status === "running") {
      const serverUrl = statusPayload.sandboxUrl?.trim() ?? "";
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
      setSandboxPreviewRecovering(false);
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

    setSandboxPreviewRecovering(true);
    const key = `${chatId}:${versionId}`;
    sandboxBootstrapDoneKeysRef.current.delete(key);
    setForcedSandboxRestartKey(key);
    setSandboxBootstrapRetryNonce((n) => n + 1);
  }, [
    chatId,
    activeVersionId,
    activeSandboxMeta,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setSandboxPreviewRecovering,
    sandboxBootstrapDoneKeysRef,
    setForcedSandboxRestartKey,
    setSandboxBootstrapRetryNonce,
  ]);

  const resetRecoverAttempts = useCallback(() => {
    previewRecoverAttemptsRef.current = 0;
  }, []);

  return { handlePreviewSessionSuspect, resetRecoverAttempts };
}
