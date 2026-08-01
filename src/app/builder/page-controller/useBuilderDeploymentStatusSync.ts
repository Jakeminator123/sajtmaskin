"use client";

import { useEffect, useRef } from "react";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";
import type { DeploymentHistoryRow } from "../useDeploymentHistory";

type Params = {
  activeDeploymentId: string | null;
  setActiveDeploymentId: (id: string | null) => void;
  latestFailedDeployment: DeploymentHistoryRow | null;
  refetchDeploymentHistory: () => void;
};

/**
 * Deployment status SSE plus the two hydration effects that keep the header's
 * publish state correct across reloads and after an in-session deploy.
 */
export function useBuilderDeploymentStatusSync({
  activeDeploymentId,
  setActiveDeploymentId,
  latestFailedDeployment,
  refetchDeploymentHistory,
}: Params) {
  const deploymentStatus = useDeploymentStatus(activeDeploymentId);

  // BB#deploy3/A#5: felstate + "Publicera om med fix" överlever sidladdning.
  // `activeDeploymentId` sattes tidigare bara av POST-deployen i samma session,
  // så efter reload försvann headerns felstate/byggloggslänk och repair-knappen
  // no-op:ade trots att den failade deployment-raden finns kvar i DB. Hydrera
  // från historiken när den NYASTE raden är terminal `error` — SSE-endpointen
  // skickar terminal-snapshotten direkt och stänger, så ingen poll startar.
  const failedDeploymentHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!latestFailedDeployment) return;
    if (activeDeploymentId) return;
    if (failedDeploymentHydratedRef.current === latestFailedDeployment.id) return;
    failedDeploymentHydratedRef.current = latestFailedDeployment.id;
    setActiveDeploymentId(latestFailedDeployment.id);
  }, [latestFailedDeployment, activeDeploymentId, setActiveDeploymentId]);

  // After an in-session deploy completes (SSE "ready"), refetch the history so
  // the hydrated live deployment (URL + versionId) becomes the source of truth
  // and the header settles on the correct "Publicerad"/"Publicera ändringar".
  const deployReadyRefetchedRef = useRef(false);
  useEffect(() => {
    if (deploymentStatus.status !== "ready") {
      deployReadyRefetchedRef.current = false;
      return;
    }
    if (deployReadyRefetchedRef.current) return;
    deployReadyRefetchedRef.current = true;
    refetchDeploymentHistory();
  }, [deploymentStatus.status, refetchDeploymentHistory]);

  return deploymentStatus;
}
