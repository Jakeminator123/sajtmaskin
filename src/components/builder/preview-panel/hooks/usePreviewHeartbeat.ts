"use client";

import { useEffect, useRef } from "react";
import { postPreviewHeartbeat } from "@/lib/builder/preview-session/api";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

export function usePreviewHeartbeat(params: {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  activeSandboxId: string | null | undefined;
  previewLifecycle: PreviewLifecycleState | undefined;
  onSessionSuspect?: () => void;
}) {
  const {
    chatId,
    versionId,
    previewUrl,
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
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;
    const allowHeartbeat =
      previewLifecycle === "live" ||
      (previewLifecycle === undefined && isTier2LivePreviewUrl(previewUrl));
    if (!allowHeartbeat) return;

    const tick = async () => {
      const data = await postPreviewHeartbeat({
        chatId,
        versionId,
        previewSessionId: activeSandboxId.trim(),
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

    const id = window.setInterval(tick, 20_000);
    void tick();
    return () => window.clearInterval(id);
  }, [chatId, versionId, activeSandboxId, previewUrl, previewLifecycle, onSessionSuspect]);
}
