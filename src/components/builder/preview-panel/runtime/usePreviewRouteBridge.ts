"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  /** Frame loads counted when the report arrived (see `frameLoadCount`). */
  loadCount: number;
};

function bridgeIdentityKey(
  previewUrl: string,
  previewSessionId: string,
  versionId: string,
  viewerId: string,
  lifecycleToken: string,
): string | null {
  const session = previewSessionId.trim();
  const version = versionId.trim();
  const viewer = viewerId.trim();
  if (!session || !version || !viewer) return null;
  if (session.length > 256 || version.length > 256 || viewer.length > 256) return null;
  // The host's report carries no lifecycle token, so the key uses the
  // builder's current one: a new lifecycle on the same session id (restart)
  // invalidates the old report until the restarted site reports again.
  return `${previewUrl}\n${session}\n${version}\n${viewer}\n${lifecycleToken}`;
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
  /** Builder's lifecycle token for the session (part of the identity). */
  lifecycleToken?: string | null;
  /**
   * Number of iframe `load` events so far. The host's bootstrap reports while
   * its document parses, before that document's `load`. A report older than
   * the previous load belongs to a document that has since been replaced (for
   * example by the host's start page after a restart), so it stops counting.
   * Omitted: reports never expire by load (previous behaviour).
   */
  frameLoadCount?: number;
}): string | null {
  const { previewUrl, versionId, activePreviewSessionId, viewerId, iframeRef } = options;
  const lifecycleToken = options.lifecycleToken?.trim() ?? "";
  const frameLoadCount = options.frameLoadCount;
  const identityKey = useMemo(() => {
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return null;
    if (!activePreviewSessionId || !versionId || !viewerId) return null;
    return bridgeIdentityKey(previewUrl, activePreviewSessionId, versionId, viewerId, lifecycleToken);
  }, [activePreviewSessionId, previewUrl, versionId, viewerId, lifecycleToken]);
  const [observed, setObserved] = useState<ObservedRoute | null>(null);
  const loadCountRef = useRef(frameLoadCount ?? 0);
  useLayoutEffect(() => {
    loadCountRef.current = frameLoadCount ?? 0;
  }, [frameLoadCount]);

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
        lifecycleToken,
      );
      if (!reportedIdentityKey) return;
      const route = observedRouteFromHref(previewUrl, payload.href);
      if (!route) return;
      const loadCount = loadCountRef.current;
      setObserved((current) =>
        current?.identityKey === reportedIdentityKey &&
        current.route === route &&
        current.loadCount === loadCount
          ? current
          : { identityKey: reportedIdentityKey, route, loadCount },
      );
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activePreviewSessionId, iframeRef, previewUrl, versionId, viewerId, lifecycleToken]);

  if (!observed || observed.identityKey !== identityKey) return null;
  if (frameLoadCount !== undefined && observed.loadCount < frameLoadCount - 1) return null;
  return observed.route;
}
