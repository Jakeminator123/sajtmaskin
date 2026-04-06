"use client";

import { useEffect, useRef } from "react";
import { postPreviewHeartbeat } from "@/lib/builder/preview-session/api";
import { isSandboxPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

export function usePreviewHeartbeat(params: {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  activePreviewSessionId: string | null | undefined;
  previewLifecycle: PreviewLifecycleState | undefined;
  onSessionSuspect?: () => void;
}) {
  const {
    chatId,
    versionId,
    previewUrl,
    activePreviewSessionId,
    previewLifecycle,
    onSessionSuspect,
  } = params;

  const viewerIdRef = useRef<string | null>(null);
  if (typeof window !== "undefined" && !viewerIdRef.current) {
    viewerIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `viewer_${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (!chatId || !versionId || !activePreviewSessionId?.trim()) return;
    if (!previewUrl || !isSandboxPreviewUrl(previewUrl)) return;
    const allowHeartbeat =
      previewLifecycle === "live" ||
      (previewLifecycle === undefined && isSandboxPreviewUrl(previewUrl));
    if (!allowHeartbeat) return;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const data = await postPreviewHeartbeat({
        chatId,
        versionId,
        previewSessionId: activePreviewSessionId.trim(),
        viewerId: viewerIdRef.current ?? "unknown",
      });
      if (
        data &&
        data.ok === false &&
        (data.reason === "no_session" || data.reason === "session_mismatch")
      ) {
        onSessionSuspect?.();
      }
    };

    const id = window.setInterval(tick, 25_000);
    void tick();
    return () => window.clearInterval(id);
  }, [chatId, versionId, activePreviewSessionId, previewUrl, previewLifecycle, onSessionSuspect]);
}
