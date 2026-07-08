"use client";

import { useEffect, useRef } from "react";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";

/**
 * Fire-and-forget project-thumbnail refresh: when the builder has a LIVE
 * tier-2 preview URL for a project, ask the server to screenshot it and
 * persist it as `app_projects.thumbnail_path` (shown in "Mina projekt").
 *
 * - Waits a few seconds after the preview URL appears so the generated site
 *   has settled (fonts/images) before the screenshot.
 * - Sends at most once per (project, previewUrl) pair per mount — a new
 *   version with a new preview URL refreshes the thumbnail, re-renders don't.
 * - Never surfaces errors: the thumbnail is cosmetic and must not disturb
 *   the builder flow.
 */
const CAPTURE_DELAY_MS = 8_000;

export function useProjectThumbnail(args: {
  appProjectId: string | null;
  previewUrl: string | null;
}) {
  const { appProjectId, previewUrl } = args;
  const sentKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!appProjectId || !previewUrl) return;
    if (!isTier2LivePreviewUrl(previewUrl)) return;
    const key = `${appProjectId}:${previewUrl}`;
    if (sentKeysRef.current.has(key)) return;

    const timer = setTimeout(() => {
      sentKeysRef.current.add(key);
      void fetch(`/api/projects/${encodeURIComponent(appProjectId)}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewUrl }),
      }).catch(() => undefined);
    }, CAPTURE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [appProjectId, previewUrl]);
}
