"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resolveReadinessCategoryFromSeverity,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import {
  deployReadinessBadgeClassName,
  envKeysForReadinessItem,
  formatDeployReadinessStatusLabel,
} from "@/lib/builder/deploy-readiness-ui";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { cn } from "@/lib/utils";

type Props = {
  readiness: ChatReadiness | null;
  isLoading?: boolean;
  /**
   * F2 vs F3 lifecycle gate. The "Öppna miljövariabler" action targets a
   * panel that only mounts in F3 — hide it during F2.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
  /**
   * Del F1: har chatten NÅGON version alls? Härleds ur `effectiveVersionsList`
   * (inte `vm.versions`, som är tom medan versions-SWR:en laddar en chat som
   * redan har en `latestVersion` — det skulle gömma det handlingsbara
   * "ingen vald"-fallet under laddning). Default `true` = failar mot att VISA.
   */
  hasAnyVersion?: boolean;
};

function resolveItemCategory(item: ChatReadinessItem): "blocker" | "advisory" {
  return item.category ?? resolveReadinessCategoryFromSeverity(item.severity);
}

function renderItem(
  item: ChatReadinessItem,
  envKeys: string[],
  isIntegrations: boolean,
) {
  const isAdvisory = resolveItemCategory(item) === "advisory";
  return (
    <div
      key={item.id}
      className={cn(
        "rounded-md border px-2.5 py-2",
        isAdvisory
          ? "border-border/40 bg-muted/30"
          : "border-border/60 bg-background/40",
      )}
    >
      <div
        className={cn(
          "text-[11px] font-medium",
          isAdvisory ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {item.title}
      </div>
      {item.detail ? <div className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</div> : null}
      {item.action === "env" && isIntegrations ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-[11px]"
          onClick={() => openDossiersPanel(envKeys)}
        >
          Öppna miljövariabler
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Del F1: göm kortet HELT bara i det tomma projektet — `no-version` ensam,
 * inga varningar, och chatten har ingen version alls. `no-version` med
 * versioner ("välj en i listan") är handlingsbart och behålls som kollapsad rad.
 */
function isEmptyProjectNoVersion(
  readiness: ChatReadiness,
  hasAnyVersion: boolean,
): boolean {
  return (
    !hasAnyVersion &&
    readiness.warnings.length === 0 &&
    readiness.blockers.length === 1 &&
    readiness.blockers[0]?.id === "no-version"
  );
}

export function LaunchReadinessCard({
  readiness,
  isLoading = false,
  lifecycleStage = null,
  hasAnyVersion = true,
}: Props) {
  // Del F2: kollapsad rad är default — badgen bär signalen, detaljerna fälls ut.
  const [isExpanded, setIsExpanded] = useState(false);

  // B2: show only when something needs attention. At `ready` the Publicera
  // button carries the positive signal — keep the preview area clear.
  if (readiness?.status === "ready") {
    return null;
  }
  if (!readiness && !isLoading) {
    return null;
  }
  // Del F1: tomt projekt → dölj helt (inget handlingsvärde i det tomma läget).
  if (readiness && isEmptyProjectNoVersion(readiness, hasAnyVersion)) {
    return null;
  }

  const isIntegrations = lifecycleStage === "integrations";
  const readinessItems =
    readiness != null ? [...readiness.blockers, ...readiness.warnings] : [];
  const blockingItems = readinessItems.filter(
    (item) => resolveItemCategory(item) === "blocker",
  );
  const advisoryItems = readinessItems.filter(
    (item) => resolveItemCategory(item) === "advisory",
  );

  const badge =
    readiness != null
      ? {
          label: formatDeployReadinessStatusLabel(readiness),
          className: deployReadinessBadgeClassName(readiness),
        }
      : null;

  const statusIcon =
    isLoading && !readiness ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : readiness?.status === "blocked" ? (
      <AlertCircle className="h-4 w-4 text-red-400" />
    ) : (
      <TriangleAlert className="h-4 w-4 text-amber-400" />
    );

  return (
    <div className="border-border/70 bg-muted/10 border-b px-3 py-2 text-xs">
      {/* Del F2: diskret rad (ikon + badge + Visa/Dölj), expanderbar till dagens
          innehåll. Rubrikerna "Lansering"/"Blockerar publicering" behövs inte i
          kollapsat läge — badgen bär signalen. Mönster lånat från F3StatusSurface. */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label="Publiceringsstatus"
        title="Publiceringsstatus — visa spärrar och rekommendationer"
        className="hover:text-foreground flex w-full items-center justify-between gap-2 text-left transition-colors"
      >
        <span className="flex items-center gap-2">
          {statusIcon}
          {badge ? (
            <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
              {badge.label}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Kontrollerar publiceringsstatus…</span>
          )}
        </span>
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
          {isExpanded ? "Dölj" : "Visa"}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {isExpanded ? (
        isLoading && !readiness ? (
          <div className="mt-2 text-[11px] text-muted-foreground">Kontrollerar publiceringsstatus...</div>
        ) : readiness ? (
          <div className="mt-2 space-y-2">
            {blockingItems.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-red-200">Blockerar publicering</div>
                {blockingItems.map((item) =>
                  renderItem(
                    item,
                    envKeysForReadinessItem(item, readiness.info),
                    isIntegrations,
                  ),
                )}
              </div>
            ) : null}

            {advisoryItems.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-amber-200">
                  Rekommendationer — blockerar inte
                </div>
                {advisoryItems.map((item) =>
                  renderItem(
                    item,
                    envKeysForReadinessItem(item, readiness.info),
                    isIntegrations,
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null
      ) : null}
    </div>
  );
}
