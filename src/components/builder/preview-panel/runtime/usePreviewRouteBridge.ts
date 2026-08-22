"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  isSameTier2PreviewSession,
  isTier2LivePreviewUrl,
} from "@/lib/gen/preview/preview-url-classifier";
import { extractTier2AppRoute } from "../pages/preview-route-helpers";

export const PREVIEW_ROUTE_BRIDGE_MESSAGE = "sajtmaskin:preview:route-change";
export const PREVIEW_ROUTE_BRIDGE_SOURCE = "sajtmaskin-preview-host";

type ObservedRoute = {
  identityKey: string;
  route: string;
};

function bridgeIdentityKey(
  previewUrl: string,
  previewSessionId: string,
  versionId: string,
  viewerId: string,
): string | null {
  const session = previewSessionId.trim();
  const version = versionId.trim();
  const viewer = viewerId.trim();
  if (!session || !version || !viewer) return null;
  if (session.length > 256 || version.length > 256 || viewer.length > 256) return null;
  return `${previewUrl}\n${session}\n${version}\n${viewer}`;
}

function expectedOrigin(previewUrl: string): string | null {
  try {
    return new URL(previewUrl, window.location.origin).origin;
  } catch {
    return null;
  }
}

function observedRouteFromHref(previewUrl: string, href: unknown): string | null {
  if (typeof href !== "string" || href.length === 0 || href.length > 4096) return null;
  try {
    const current = new URL(previewUrl, window.location.origin);
    const reported = new URL(href, current.origin);
    if (reported.origin !== current.origin) return null;
    if (!isSameTier2PreviewSession(current.toString(), reported.toString())) return null;
    return extractTier2AppRoute(reported.pathname);
  } catch {
    return null;
  }
}

/**
 * Receives route changes from preview-host's always-on document bootstrap.
 *
 * The observed route is intentionally presentation-only. Writing it back to
 * `previewUrl` would rewrite the iframe `src` and turn a completed client-side
 * navigation into a second, full document load.
 */
export function usePreviewRouteBridge(options: {
  previewUrl: string | null;
  versionId: string | null;
  activePreviewSessionId: string | null;
  viewerId: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}): string | null {
  const { previewUrl, versionId, activePreviewSessionId, viewerId, iframeRef } = options;
  const identityKey = useMemo(() => {
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return null;
    if (!activePreviewSessionId || !versionId || !viewerId) return null;
    return bridgeIdentityKey(previewUrl, activePreviewSessionId, versionId, viewerId);
  }, [activePreviewSessionId, previewUrl, versionId, viewerId]);
  const [observed, setObserved] = useState<ObservedRoute | null>(null);

  useEffect(() => {
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl) || !viewerId?.trim()) return;
    const allowedOrigin = expectedOrigin(previewUrl);
    if (!allowedOrigin) return;
    const expectedViewerId = viewerId.trim();
    const activeSessionId = activePreviewSessionId?.trim() || null;
    const activeVersionId = versionId?.trim() || null;

    const handler = (event: MessageEvent) => {
      const child = iframeRef.current?.contentWindow;
      if (!child || event.source !== child) return;
      // Tier-2 previews always have a concrete origin. Unlike the inspector's
      // legacy shim compatibility, an opaque/null origin is never accepted.
      if (event.origin !== allowedOrigin) return;
      const data = event.data as {
        type?: unknown;
        source?: unknown;
        payload?: {
          href?: unknown;
          previewSessionId?: unknown;
          versionId?: unknown;
          viewerId?: unknown;
        };
      } | null;
      if (
        !data ||
        data.type !== PREVIEW_ROUTE_BRIDGE_MESSAGE ||
        data.source !== PREVIEW_ROUTE_BRIDGE_SOURCE
      ) {
        return;
      }
      const payload = data.payload;
      if (payload?.viewerId !== expectedViewerId) return;
      if (typeof payload.previewSessionId !== "string" || typeof payload.versionId !== "string") {
        return;
      }
      const reportedSessionId = payload.previewSessionId.trim();
      const reportedVersionId = payload.versionId.trim();
      // When metadata has hydrated, reject mismatches immediately. Before it
      // arrives we may retain a candidate, but it remains invisible until the
      // active identity later matches exactly.
      if (activeSessionId && reportedSessionId !== activeSessionId) return;
      if (activeVersionId && reportedVersionId !== activeVersionId) return;
      const reportedIdentityKey = bridgeIdentityKey(
        previewUrl,
        reportedSessionId,
        reportedVersionId,
        expectedViewerId,
      );
      if (!reportedIdentityKey) return;
      const route = observedRouteFromHref(previewUrl, payload.href);
      if (!route) return;
      setObserved((current) =>
        current?.identityKey === reportedIdentityKey && current.route === route
          ? current
          : { identityKey: reportedIdentityKey, route },
      );
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activePreviewSessionId, iframeRef, previewUrl, versionId, viewerId]);

  return observed?.identityKey === identityKey ? observed.route : null;
}
