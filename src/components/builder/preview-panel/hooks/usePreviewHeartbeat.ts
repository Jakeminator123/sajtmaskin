"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  postPreviewHeartbeat,
  postPreviewHibernate,
} from "@/lib/builder/preview-session/api";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

// Tid som tab får vara dold innan klienten begär hibernation av VM:en.
// 60s var aggressivt under utveckling: ett kort tabbsbyte triggade
// hibernation → cold-boot (upp till 10 min) när användaren kom tillbaka.
// Default höjt till 10 min. Override via NEXT_PUBLIC_PREVIEW_HIBERNATE_DELAY_MS
// så prod kan vara striktare om vi vill spara VM-resurser.
const HIDDEN_HIBERNATE_DELAY_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_PREVIEW_HIBERNATE_DELAY_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
})();

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (viewerIdRef.current) return;
    viewerIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `viewer_${Math.random().toString(36).slice(2)}`;
  }, []);

  const clearHiddenHibernateTimer = () => {
    if (hiddenHibernateTimerRef.current !== null) {
      window.clearTimeout(hiddenHibernateTimerRef.current);
      hiddenHibernateTimerRef.current = null;
    }
  };

  const sendHeartbeat = useCallback(async () => {
    const resolvedPreviewSessionId = previewSessionId?.trim();
    if (!chatId || !versionId || !resolvedPreviewSessionId) return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;
    // Heartbeat must keep firing even when the tab is hidden — long F3 builds
    // (tab switched away) were TTL-ing out of preview-session because we
    // skipped the POST here. Heartbeat is a cheap fire-and-forget; hibernation
    // is still triggered separately after HIDDEN_HIBERNATE_DELAY_MS below.
    const data = await postPreviewHeartbeat({
      chatId,
      versionId,
      previewSessionId: resolvedPreviewSessionId,
      viewerId: viewerIdRef.current ?? "unknown",
    });
    if (
      data &&
      data.ok === false &&
      (data.reason === "no_session" || data.reason === "session_mismatch")
    ) {
      onSessionSuspect?.();
    }
  }, [chatId, versionId, previewSessionId, previewUrl, onSessionSuspect]);

  useEffect(() => {
    if (!chatId || !versionId || !previewSessionId?.trim()) return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;
    const allowHeartbeat =
      previewLifecycle === "live" ||
      (previewLifecycle === undefined && isTier2LivePreviewUrl(previewUrl));
    if (!allowHeartbeat) return;

    const id = window.setInterval(sendHeartbeat, 25_000);
    return () => window.clearInterval(id);
  }, [chatId, versionId, activePreviewSessionId, previewUrl, previewSessionId, previewLifecycle, sendHeartbeat]);

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
        void sendHeartbeat();
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
  }, [chatId, versionId, activePreviewSessionId, previewUrl, previewSessionId, sendHeartbeat]);
}
