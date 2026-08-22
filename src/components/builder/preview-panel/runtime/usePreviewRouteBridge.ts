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
    const sessionId = activePreviewSessionId?.trim();
    const activeVersionId = versionId?.trim();
    const activeViewerId = viewerId?.trim();
    if (!sessionId || !activeVersionId || !activeViewerId) return null;
    return `${previewUrl}\n${sessionId}\n${activeVersionId}\n${activeViewerId}`;
  }, [activePreviewSessionId, previewUrl, versionId, viewerId]);
  const [observed, setObserved] = useState<ObservedRoute | null>(null);

  useEffect(() => {
    if (!identityKey || !previewUrl || !versionId || !activePreviewSessionId || !viewerId) return;
    const allowedOrigin = expectedOrigin(previewUrl);
    if (!allowedOrigin) return;
    const expectedSessionId = activePreviewSessionId.trim();
    const expectedVersionId = versionId.trim();
    const expectedViewerId = viewerId.trim();

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
      if (
        payload?.previewSessionId !== expectedSessionId ||
        payload.versionId !== expectedVersionId ||
        payload.viewerId !== expectedViewerId
      ) {
        return;
      }
      const route = observedRouteFromHref(previewUrl, payload.href);
      if (!route) return;
      setObserved((current) =>
        current?.identityKey === identityKey && current.route === route
          ? current
          : { identityKey, route },
      );
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activePreviewSessionId, identityKey, iframeRef, previewUrl, versionId, viewerId]);

  return observed?.identityKey === identityKey ? observed.route : null;
}
