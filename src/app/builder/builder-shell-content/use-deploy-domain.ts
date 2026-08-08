import { useAuth } from "@/lib/auth/auth-store";
import { useEffect } from "react";
import type { BuilderViewModel } from "../useBuilderPageController";

export function useShellDeployDomain(vm: BuilderViewModel) {
  const isDeployActionBusy =
    vm.isCreatingChat || vm.isAnyStreaming || vm.isDeploying || vm.isTemplateLoading;
  // A publication exists if there's a live deployment or a known hosting
  // project — either from this session or hydrated from the DB on reload. The
  // domain manager (link/verify) needs a published site; before that we only
  // offer the search dialog.
  const hasPublication = Boolean(
    vm.liveDeploymentUrl || vm.hydratedVercelProjectId || vm.lastDeployVercelProjectId,
  );

  // Returning from Stripe after a domain purchase. The redirect lands on the
  // builder with `?domainOrder=…`; without this the customer would come back
  // to an ordinary builder view with no sign that a charge just happened, and
  // the outcome (registered / refunded) is only knowable by polling the order.
  // Runs as an effect rather than lazy initial state so SSR and hydration
  // agree on the closed dialog.
  const setDomainManagerOpen = vm.setDomainManagerOpen;
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("domainOrder")) {
      setDomainManagerOpen(true);
    }
  }, [setDomainManagerOpen]);

  const deployReadinessBlocker = vm.deployReadiness?.blockers[0] ?? null;
  // Ö1-paritet (A#12): medan readiness laddar (SWR initial load) vet vi inte
  // om servern skulle 409:a — håll knappen disablad i stället för att
  // fail-open:a mot `?? true` och låta klicket sluta i ett obegripligt fel.
  const isDeployReadinessPending = vm.isDeployReadinessLoading && !vm.deployReadiness;
  const canDeploy = Boolean(
    vm.chatId &&
      vm.activeVersionId &&
      !isDeployActionBusy &&
      !isDeployReadinessPending &&
      (vm.deployReadiness?.canDeploy ?? true),
  );
  const baseDeployDisabledReason = !vm.chatId
    ? "Skapa eller öppna en chat först."
    : !vm.activeVersionId
      ? "Välj eller generera en version först."
      : vm.isCreatingChat || vm.isTemplateLoading
        ? "Vänta tills chatten och versionen är redo."
        : vm.isAnyStreaming
          ? "Vänta tills den pågående generationen är klar."
          : vm.isDeploying
            ? "Publicering pågår redan."
            : isDeployReadinessPending
              ? "Kontrollerar publiceringsstatus…"
              : deployReadinessBlocker?.detail || deployReadinessBlocker?.title || null;
  const deployDisabledReason =
    deployReadinessBlocker?.action === "env" && baseDeployDisabledReason
      ? `${baseDeployDisabledReason} Lägg till nycklarna under Projektets miljövariabler (Lansering överst i chatpanelen).`
      : baseDeployDisabledReason;
  const { hasGitHub, user: authUser } = useAuth();
  return {
    isDeployActionBusy,
    hasPublication,
    canDeploy,
    deployDisabledReason,
    deployReadinessBlocker,
    hasGitHub,
    authUser,
  };
}
