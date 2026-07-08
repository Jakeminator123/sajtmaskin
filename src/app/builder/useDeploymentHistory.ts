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
export function useDeploymentHistory(chatId: string | null) {
  const [deployments, setDeployments] = useState<DeploymentHistoryRow[]>([]);
  const [project, setProject] = useState<DeploymentHistoryProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      if (!chatId) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/v0/deployments?chatId=${encodeURIComponent(chatId)}`, {
          signal,
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          deployments?: DeploymentHistoryRow[];
          project?: DeploymentHistoryProject | null;
        } | null;
        if (signal?.aborted) return;
        setDeployments(Array.isArray(data?.deployments) ? data!.deployments : []);
        setProject(data?.project ?? null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("builder", "Failed to load deployment history", error);
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
      return;
    }
    const controller = new AbortController();
    void fetchHistory(controller.signal);
    return () => controller.abort();
  }, [chatId, fetchHistory]);

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

  return { deployments, project, liveDeployment, isLoading, refetch };
}
