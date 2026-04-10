"use client";

import { useEffect, useRef } from "react";
import {
  postPreviewHeartbeat,
  postPreviewHibernate,
} from "@/lib/builder/preview-session/api";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

const HIDDEN_HIBERNATE_DELAY_MS = 60_000;

export function usePreviewHeartbeat(params: {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  activeSandboxId?: string | null | undefined;
  activePreviewSessionId?: string | null | undefined;
  previewLifecycle: PreviewLifecycleState | undefined;
  onSessionSuspect?: () => void;
}) {
  const {
    chatId,
    versionId,
    previewUrl,
    activeSandboxId,
    activePreviewSessionId,
    previewLifecycle,
    onSessionSuspect,
  } = params;
  const previewSessionId = activePreviewSessionId ?? activeSandboxId;

  const viewerIdRef = useRef<string | null>(null);
  const hibernateRequestedRef = useRef(false);
  const hiddenHibernateTimerRef = useRef<number | null>(null);
  if (typeof window !== "undefined" && !viewerIdRef.current) {
    viewerIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `viewer_${Math.random().toString(36).slice(2)}`;
  }

  const clearHiddenHibernateTimer = () => {
    if (hiddenHibernateTimerRef.current !== null) {
      window.clearTimeout(hiddenHibernateTimerRef.current);
      hiddenHibernateTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!chatId || !versionId || !previewSessionId?.trim()) return;
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
        previewSessionId: previewSessionId.trim(),
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
    return () => window.clearInterval(id);
  }, [chatId, versionId, previewSessionId, previewUrl, previewLifecycle, onSessionSuspect]);

  useEffect(() => {
    if (!chatId || !versionId || !previewSessionId?.trim()) return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;

    const requestHibernate = () => {
      if (hibernateRequestedRef.current) return;
      hibernateRequestedRef.current = true;
      void postPreviewHibernate({
        chatId,
        versionId,
        previewSessionId: previewSessionId.trim(),
        keepalive: true,
      }).finally(() => {
        window.setTimeout(() => {
          hibernateRequestedRef.current = false;
        }, 1000);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearHiddenHibernateTimer();
        hiddenHibernateTimerRef.current = window.setTimeout(() => {
          requestHibernate();
        }, HIDDEN_HIBERNATE_DELAY_MS);
      } else {
        clearHiddenHibernateTimer();
      }
    };

    const handlePageHide = () => {
      clearHiddenHibernateTimer();
      requestHibernate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      clearHiddenHibernateTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [chatId, versionId, previewSessionId, previewUrl]);
}
