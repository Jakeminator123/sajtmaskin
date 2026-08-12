"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ChevronDown, Globe, Loader2, Rocket, Wrench } from "lucide-react";

type DeploymentStatus = "pending" | "building" | "ready" | "error" | "cancelled" | null;

type PublishState =
  | { kind: "building" }
  | { kind: "published"; liveHref: string }
  | {
      kind: "publish";
      hasUnpublishedChanges: boolean;
      label: "Publicera" | "Publicera ändringar";
      tooltip: string | null;
    };

export function resolveBuilderPublishState(input: {
  activeVersionId: string | null;
  canDeploy: boolean;
  deployDisabledReason?: string | null;
  deploymentStatus?: DeploymentStatus;
  deploymentUrl?: string | null;
  liveDeploymentUrl?: string | null;
  liveDeploymentVersionId?: string | null;
}): PublishState {
  if (input.deploymentStatus === "building") {
    return { kind: "building" };
  }

  // An in-session SSE success is newer than hydrated history until the
  // post-deploy refetch lands. Otherwise a republish could open the old URL.
  const sessionReadyUrl =
    input.deploymentStatus === "ready" && input.deploymentUrl ? input.deploymentUrl : null;
  const resolvedLiveUrl = sessionReadyUrl ?? input.liveDeploymentUrl;
  const resolvedLiveVersionId =
    sessionReadyUrl && sessionReadyUrl !== input.liveDeploymentUrl
      ? input.activeVersionId
      : input.liveDeploymentUrl
        ? (input.liveDeploymentVersionId ?? null)
        : sessionReadyUrl
          ? input.activeVersionId
          : null;
  const liveHref = resolvedLiveUrl
    ? resolvedLiveUrl.startsWith("http")
      ? resolvedLiveUrl
      : `https://${resolvedLiveUrl}`
    : null;
  const hasLive = Boolean(liveHref);

  // Never claim that live and active are in sync without a known live
  // version. A missing active version only represents the loading window.
  const liveMatchesActive =
    hasLive &&
    Boolean(resolvedLiveVersionId) &&
    (!input.activeVersionId || resolvedLiveVersionId === input.activeVersionId);

  if (liveHref && liveMatchesActive) {
    return { kind: "published", liveHref };
  }

  const hasUnpublishedChanges = hasLive && !liveMatchesActive;
  return {
    kind: "publish",
    hasUnpublishedChanges,
    label: hasUnpublishedChanges ? "Publicera ändringar" : "Publicera",
    tooltip: !input.canDeploy
      ? (input.deployDisabledReason ?? null)
      : hasUnpublishedChanges
        ? "Du har ändringar som inte är publicerade ännu. Publicera för att uppdatera den live-sajten."
        : null,
  };
}

export function BuilderPublishControl(props: {
  activeVersionId: string | null;
  canDeploy: boolean;
  canManageDomain: boolean;
  deployDisabledReason?: string | null;
  deploymentHistoryHydrationFailed?: boolean;
  deploymentInspectorUrl?: string | null;
  deploymentStatus?: DeploymentStatus;
  deploymentUrl?: string | null;
  isBusy: boolean;
  isDeploying: boolean;
  isRepublishRepairing?: boolean;
  liveDeploymentUrl?: string | null;
  liveDeploymentVersionId?: string | null;
  onDeployProduction: () => void;
  onDomainSearch: () => void;
  onRepublishWithFix?: () => void;
  onRetryDeploymentHistory?: () => void;
}) {
  const publishState = resolveBuilderPublishState(props);

  const domainMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={props.isBusy}
          aria-label="Fler publiceringsval: domän"
          title="Domän och publiceringsval"
          className="px-2"
        >
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Publicering</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!props.canManageDomain || props.isBusy}
          onSelect={(event) => {
            event.preventDefault();
            props.onDomainSearch();
          }}
        >
          <Globe className="mr-2 h-4 w-4" />
          Hantera domän
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {props.deploymentHistoryHydrationFailed ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/60 text-amber-600 dark:text-amber-400"
                onClick={() => props.onRetryDeploymentHistory?.()}
                aria-label="Kunde inte hämta publiceringsstatus"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Status</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-xs">
              <p>
                Kunde inte hämta publiceringsstatus efter omladdning. Publiceringsknappen kan visa
                fel läge tills du försöker igen.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {props.deploymentStatus === "error" ? (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Publiceringen misslyckades
            </span>
            {props.deploymentInspectorUrl ? (
              <a
                href={props.deploymentInspectorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
              >
                Visa byggloggar
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.deploymentStatus === "error" && props.onRepublishWithFix ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500 text-red-600 dark:text-red-400"
                onClick={props.onRepublishWithFix}
                disabled={props.isBusy || props.isRepublishRepairing}
              >
                {props.isRepublishRepairing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Publicera om med fix</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-xs">
              <p>
                Publiceringen misslyckades i bygget. Kör en automatisk fix mot den failade versionen
                — granska och acceptera reparationen, publicera sedan om.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {publishState.kind === "building" ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled aria-label="Bygger publiceringen">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Bygger...</span>
          </Button>
          {domainMenu}
        </div>
      ) : publishState.kind === "published" ? (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="border-green-500 text-green-600"
            onClick={() => window.open(publishState.liveHref, "_blank", "noopener,noreferrer")}
            aria-label="Publicerad — öppna den live-publicerade sajten i ny flik"
            title="Öppna den publicerade sajten"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Publicerad</span>
          </Button>
          {domainMenu}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    onClick={props.onDeployProduction}
                    disabled={!props.canDeploy || props.isBusy || props.isDeploying}
                    className="relative"
                    aria-label={publishState.label}
                  >
                    {props.isDeploying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{publishState.label}</span>
                    {publishState.hasUnpublishedChanges ? (
                      <span
                        className="ring-background absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2"
                        aria-hidden
                      />
                    ) : null}
                  </Button>
                </span>
              </TooltipTrigger>
              {publishState.tooltip ? (
                <TooltipContent side="bottom" className="max-w-sm text-xs">
                  <p>{publishState.tooltip}</p>
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
          {domainMenu}
        </div>
      )}
    </>
  );
}
