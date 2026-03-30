"use client";

import { useEffect, useRef } from "react";
import { postSandboxHeartbeat } from "@/lib/builder/preview-session";
import { isSandboxPreviewUrl } from "@/lib/gen/preview";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

export function usePreviewHeartbeat(params: {
  chatId: string | null;
  versionId: string | null;
  demoUrl: string | null;
  activeSandboxId: string | null | undefined;
  previewLifecycle: PreviewLifecycleState | undefined;
  onSessionSuspect?: () => void;
}) {
  const {
    chatId,
    versionId,
    demoUrl,
    activeSandboxId,
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
    if (!chatId || !versionId || !activeSandboxId?.trim()) return;
    if (!demoUrl || !isSandboxPreviewUrl(demoUrl)) return;
    const allowHeartbeat =
      previewLifecycle === "live" ||
      (previewLifecycle === undefined && isSandboxPreviewUrl(demoUrl));
    if (!allowHeartbeat) return;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const data = await postSandboxHeartbeat({
        chatId,
        versionId,
        sandboxId: activeSandboxId.trim(),
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
  }, [chatId, versionId, activeSandboxId, demoUrl, previewLifecycle, onSessionSuspect]);
}
