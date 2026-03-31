"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatReadiness, ChatReadinessItem } from "@/lib/chat-readiness";
import {
  deployReadinessBadgeClassName,
  formatDeployReadinessStatusLabel,
} from "@/lib/builder/deploy-readiness-ui";
import { cn } from "@/lib/utils";

type Props = {
  readiness: ChatReadiness | null;
  isLoading?: boolean;
};

function openProjectEnvVarsPanel(envKeys?: string[]) {
  if (typeof window === "undefined") return;
  const payload = envKeys?.length ? { envKeys } : {};
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail: payload }));
}

function renderItem(item: ChatReadinessItem, missingEnvKeys: string[]) {
  return (
    <div key={item.id} className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="text-foreground text-[11px] font-medium">{item.title}</div>
      {item.detail ? <div className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</div> : null}
      {item.action === "env" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-[11px]"
          onClick={() => openProjectEnvVarsPanel(missingEnvKeys)}
        >
          Öppna miljövariabler
        </Button>
      ) : null}
    </div>
  );
}

export function LaunchReadinessCard({ readiness, isLoading = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!readiness && !isLoading) return null;

  const badge =
    readiness != null
      ? {
          label: formatDeployReadinessStatusLabel(readiness),
          className: deployReadinessBadgeClassName(readiness),
        }
      : null;

  const StatusIcon = isLoading && !readiness
    ? () => <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    : readiness?.status === "blocked"
      ? () => <AlertCircle className="h-3.5 w-3.5 text-red-400" />
      : readiness?.status === "warning"
        ? () => <TriangleAlert className="h-3.5 w-3.5 text-amber-400" />
        : () => <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;

  return (
    <div className="border-border/70 border-b text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <StatusIcon />
          <span className="font-medium text-foreground">Lansering</span>
          {badge && (
            <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
              {badge.label}
            </Badge>
          )}
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          {isLoading && !readiness ? (
            <div className="text-[11px] text-muted-foreground">Kontrollerar...</div>
          ) : readiness ? (
            <div className="space-y-2">
              {readiness.blockers.map((item) => renderItem(item, readiness.info.missingEnvKeys))}
              {readiness.warnings.map((item) => renderItem(item, readiness.info.missingEnvKeys))}
              {readiness.info.lifecycleStatus ? (
                <div className="text-[11px] text-muted-foreground">
                  Status: <span className="text-foreground">{readiness.info.lifecycleStatus}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
