"use client";

import { useMemo, useRef } from "react";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { resolveAlternatePreviewUrls } from "@/lib/gen/preview/preview-url-classifier";
import type { VersionSummary } from "../useBuilderDerivedState";
import { versionSummaryHasPreview } from "../builder-page-preview-helpers";

type Params = {
  selectedVersionId: string | null;
  latestVersionId: string | null;
  activeVersionId: string | null;
  effectiveVersionsList: VersionSummary[];
};

/**
 * Render-time refs and memos describing the active version: the live-preview
 * URL it exposes and whether it is a terminally failed version without one.
 */
export function useBuilderActiveVersionInfo({
  selectedVersionId,
  latestVersionId,
  activeVersionId,
  effectiveVersionsList,
}: Params) {
  const selectedVersionIdRef = useRef<string | null>(null);
  const latestVersionIdRef = useRef<string | null>(null);
  /* eslint-disable react-hooks/refs -- keep latest ids for async deploy callbacks without rebinding handlers */
  selectedVersionIdRef.current = selectedVersionId;
  latestVersionIdRef.current = latestVersionId;
  /* eslint-enable react-hooks/refs */

  /** Active live-preview URL for the version. */
  const activeVersionAlternatePreview = useMemo(() => {
    const vid = activeVersionId;
    if (!vid) return { storedLivePreviewUrl: null as string | null };
    const v = effectiveVersionsList.find((x) => (x.versionId || x.id) === vid);
    if (!v) return { storedLivePreviewUrl: null };
    return resolveAlternatePreviewUrls({
      storedLivePreviewUrl: v.previewUrl,
    });
  }, [activeVersionId, effectiveVersionsList]);

  const activeVersionFailedWithoutPreviewUrl = useMemo(() => {
    const vid = activeVersionId;
    if (!vid) return false;
    const activeVersion = effectiveVersionsList.find(
      (version) => (version.versionId || version.id) === vid,
    );
    if (!activeVersion) return false;
    // `allowFailed: true` krävs (VADE, PR #381): utan den short-circuitar
    // versionSummaryHasPreview till false för ALLA failade versioner
    // (canExposeEnginePreview-gaten), så en failad version MED egen
    // previewUrl skulle feldetekteras som "utan preview" och få resyncen
    // undertryckt — den ska tvärtom få resynca till sin egen session.
    return (
      resolveEngineVersionLifecycleStatus(activeVersion) === "failed" &&
      !versionSummaryHasPreview(activeVersion, { allowFailed: true })
    );
  }, [activeVersionId, effectiveVersionsList]);

  return {
    selectedVersionIdRef,
    latestVersionIdRef,
    activeVersionAlternatePreview,
    activeVersionFailedWithoutPreviewUrl,
  };
}
