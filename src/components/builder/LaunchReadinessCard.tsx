"use client";

import { AlertCircle, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatReadiness, ChatReadinessItem } from "@/lib/chat-readiness";
import {
  deployReadinessBadgeClassName,
  envKeysForReadinessItem,
  formatDeployReadinessStatusLabel,
} from "@/lib/builder/deploy-readiness-ui";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openProjectEnvVarsPanel } from "@/lib/builder/project-env-events";
import { cn } from "@/lib/utils";

type Props = {
  readiness: ChatReadiness | null;
  isLoading?: boolean;
  /**
   * F2 vs F3 lifecycle gate. The "Öppna miljövariabler" action targets a
   * panel that only mounts in F3 — hide it during F2.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
};

function renderItem(
  item: ChatReadinessItem,
  envKeys: string[],
  isIntegrations: boolean,
) {
  const isWarning = item.severity === "warning";
  return (
    <div
      key={item.id}
      className={cn(
        "rounded-md border px-2.5 py-2",
        isWarning
          ? "border-border/40 bg-muted/30"
          : "border-border/60 bg-background/40",
      )}
    >
      <div
        className={cn(
          "text-[11px] font-medium",
          isWarning ? "text-muted-foreground" : "text-foreground",
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
          onClick={() => openProjectEnvVarsPanel(envKeys)}
        >
          Öppna miljövariabler
        </Button>
      ) : null}
    </div>
  );
}

export function LaunchReadinessCard({
  readiness,
  isLoading = false,
  lifecycleStage = null,
}: Props) {
  if (!readiness && !isLoading) {
    return null;
  }

  const isIntegrations = lifecycleStage === "integrations";

  const badge =
    readiness != null
      ? {
          label: formatDeployReadinessStatusLabel(readiness),
          className: deployReadinessBadgeClassName(readiness),
        }
      : null;

  return (
    <div className="border-border/70 bg-muted/10 border-b px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLoading && !readiness ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : readiness?.status === "blocked" ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : readiness?.status === "warning" ? (
            <TriangleAlert className="h-4 w-4 text-amber-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          <span className="font-medium text-gray-200">Lansering</span>
        </div>
        {badge ? (
          <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
            {badge.label}
          </Badge>
        ) : null}
      </div>

      {isLoading && !readiness ? (
        <div className="mt-2 text-[11px] text-muted-foreground">Kontrollerar publiceringsstatus...</div>
      ) : readiness ? (
        <div className="mt-2 space-y-2">
          {readiness.blockers.map((item) =>
            renderItem(
              item,
              envKeysForReadinessItem(item, readiness.info),
              isIntegrations,
            ),
          )}
          {readiness.warnings.map((item) =>
            renderItem(
              item,
              envKeysForReadinessItem(item, readiness.info),
              isIntegrations,
            ),
          )}

          {readiness.info.lifecycleStatus ? (
            <div className="text-[11px] text-muted-foreground">
              Versionsstatus: <span className="text-foreground">{readiness.info.lifecycleStatus}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
