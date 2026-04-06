"use client";

import { useEffect, useRef } from "react";
import {
  postPreviewHeartbeat,
  postPreviewHibernate,
} from "@/lib/builder/preview-session/api";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
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
  const hibernateRequestedRef = useRef(false);
  if (typeof window !== "undefined" && !viewerIdRef.current) {
    viewerIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `viewer_${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (!chatId || !versionId || !activePreviewSessionId?.trim()) return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;
    const allowHeartbeat =
      previewLifecycle === "live" ||
      (previewLifecycle === undefined && isTier2LivePreviewUrl(previewUrl));
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

  useEffect(() => {
    if (!chatId || !versionId || !activePreviewSessionId?.trim()) return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;

    const requestHibernate = () => {
      if (hibernateRequestedRef.current) return;
      hibernateRequestedRef.current = true;
      void postPreviewHibernate({
        chatId,
        versionId,
        previewSessionId: activePreviewSessionId.trim(),
        keepalive: true,
      }).finally(() => {
        window.setTimeout(() => {
          hibernateRequestedRef.current = false;
        }, 1000);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        requestHibernate();
      }
    };

    const handlePageHide = () => {
      requestHibernate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [chatId, versionId, activePreviewSessionId, previewUrl]);
}
