"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { debugLog } from "@/lib/utils/debug";

/**
 * One row from `GET /api/v0/deployments?chatId=`. Field names mirror the
 * server contract (kept verbatim — these are API/DB identifiers, not
 * user-facing copy).
 */
export type DeploymentHistoryRow = {
  id: string;
  chatId: string | null;
  versionId: string | null;
  status: string | null;
  url: string | null;
  inspectorUrl: string | null;
  vercelDeploymentId: string | null;
  vercelProjectId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Top-level `project` block on the deployments GET response. */
export type DeploymentHistoryProject = {
  vercelProjectId: string | null;
  vercelProjectName: string | null;
};

/** The newest ready deployment, treated as the currently live site. */
export type LiveDeployment = {
  deploymentId: string;
  url: string | null;
  versionId: string | null;
  vercelProjectId: string | null;
};

/**
 * Hydrates the builder's publish state from the server on mount. Without this,
 * the header only knows a site is published within the same session that ran
 * the deploy — after a reload the "Publicerad"/"Publicera ändringar" states are
 * lost. Fetches the deployment list once per chat and derives the live
 * deployment (newest row with status "ready") plus the hosting project meta.
 */
/** Max automatic retries after a failed hydration fetch (transient 5xx/network). */
const MAX_HYDRATION_RETRIES = 2;
const RETRY_DELAY_MS = 4000;

export function useDeploymentHistory(chatId: string | null) {
  const [deployments, setDeployments] = useState<DeploymentHistoryRow[]>([]);
  const [project, setProject] = useState<DeploymentHistoryProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      if (!chatId) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/v0/deployments?chatId=${encodeURIComponent(chatId)}`, {
          signal,
        });
        if (!res.ok) {
          // A transient failure here would otherwise silently drop the
          // "Publicerad"/"Publicera ändringar" state after a reload — surface
          // it so the retry effect below can re-attempt.
          throw new Error(`Deployment history fetch failed (HTTP ${res.status})`);
        }
        const data = (await res.json().catch(() => null)) as {
          deployments?: DeploymentHistoryRow[];
          project?: DeploymentHistoryProject | null;
        } | null;
        if (signal?.aborted) return;
        setDeployments(Array.isArray(data?.deployments) ? data!.deployments : []);
        setProject(data?.project ?? null);
        setLoadError(false);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("builder", "Failed to load deployment history", error);
        if (!signal?.aborted) setLoadError(true);
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [chatId],
  );

  useEffect(() => {
    if (!chatId) {
      setDeployments([]);
      setProject(null);
      setLoadError(false);
      return;
    }
    const controller = new AbortController();
    void fetchHistory(controller.signal);
    return () => controller.abort();
  }, [chatId, fetchHistory]);

  // Bounded auto-retry on failure. `retryToken` doubles as the attempt count;
  // it resets when the chat changes (new fetchHistory identity → effect above
  // re-runs and clears state via the success path).
  useEffect(() => {
    if (!loadError || retryToken >= MAX_HYDRATION_RETRIES) return;
    const timer = setTimeout(() => {
      setRetryToken((n) => n + 1);
      setLoadError(false);
      void fetchHistory();
    }, RETRY_DELAY_MS * (retryToken + 1));
    return () => clearTimeout(timer);
  }, [loadError, retryToken, fetchHistory]);

  useEffect(() => {
    setRetryToken(0);
  }, [chatId]);

  const refetch = useCallback(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const liveDeployment = useMemo<LiveDeployment | null>(() => {
    // The list is sorted newest-first, so the first ready row is the live one.
    const ready = deployments.find((d) => String(d.status) === "ready" && Boolean(d.url));
    if (!ready) return null;
    return {
      deploymentId: ready.id,
      url: ready.url,
      versionId: ready.versionId,
      vercelProjectId: ready.vercelProjectId,
    };
  }, [deployments]);

  // BB#deploy3/A#5: den senaste publiceringen om den slutade i `error`.
  // Bara den NYASTE raden räknas — finns en nyare ready/pending-rad är felet
  // historik och ska inte återuppväckas efter en sidladdning.
  const latestFailedDeployment = useMemo<DeploymentHistoryRow | null>(() => {
    const newest = deployments[0];
    if (!newest || String(newest.status) !== "error") return null;
    return newest;
  }, [deployments]);

  const hydrationFailed = loadError && retryToken >= MAX_HYDRATION_RETRIES;

  return {
    deployments,
    project,
    liveDeployment,
    latestFailedDeployment,
    isLoading,
    loadError,
    hydrationFailed,
    refetch,
  };
}
