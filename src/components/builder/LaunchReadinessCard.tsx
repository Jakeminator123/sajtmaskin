"use client";

import { AlertCircle, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatReadiness, ChatReadinessItem } from "@/lib/chat-readiness";
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

function statusBadge(readiness: ChatReadiness) {
  if (readiness.status === "blocked") {
    return {
      label: `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? "" : "are"}`,
      className: "border-red-500/30 bg-red-500/10 text-red-200",
    };
  }

  if (readiness.status === "warning") {
    return {
      label: `${readiness.warnings.length} varning${readiness.warnings.length === 1 ? "" : "ar"}`,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    label: "Redo att publicera",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  };
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
  if (!readiness && !isLoading) {
    return null;
  }

  const badge = readiness ? statusBadge(readiness) : null;

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
          <span className="font-medium text-gray-200">Launch readiness</span>
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
          {readiness.status === "ready" ? (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-100">
              Aktiv version ser redo ut att publicera. Fortsätt gärna med en sista preview-koll.
            </div>
          ) : null}

          {readiness.blockers.map((item) => renderItem(item, readiness.info.missingEnvKeys))}
          {readiness.warnings.map((item) => renderItem(item, readiness.info.missingEnvKeys))}

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
