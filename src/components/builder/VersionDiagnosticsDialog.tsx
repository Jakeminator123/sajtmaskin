"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, KeyRound, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview-diagnostics";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type VersionDiagnosticsLog = {
  id: string;
  level: "info" | "warning" | "error" | string;
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
};

type DiagnosticsSummary = {
  total: number;
  byLevel?: {
    info?: number;
    warning?: number;
    error?: number;
  };
  byCategory?: Record<string, number>;
  latestPreviewCode?: string | null;
  latestPreviewStage?: string | null;
};

type DiagnosticsResponse = {
  success?: boolean;
  logs?: VersionDiagnosticsLog[];
  summary?: DiagnosticsSummary;
  error?: string;
};

type Props = {
  chatId: string | null;
  versionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function openProjectEnvVarsPanel() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail: {} }));
}

function levelBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "error") return "destructive";
  if (level === "warning") return "secondary";
  return "outline";
}

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function VersionDiagnosticsDialog({ chatId, versionId, open, onOpenChange }: Props) {
  const [logs, setLogs] = useState<VersionDiagnosticsLog[]>([]);
  const [summary, setSummary] = useState<DiagnosticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open || !chatId || !versionId) return;

    let isActive = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as DiagnosticsResponse | null;
        if (!response.ok) {
          throw new Error(data?.error || `Failed to load diagnostics (HTTP ${response.status})`);
        }
        if (!isActive) return;
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
        setSummary(data?.summary ?? null);
      } catch (loadError) {
        if (!isActive) return;
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setLogs([]);
        setSummary(null);
        setError(loadError instanceof Error ? loadError.message : "Kunde inte ladda diagnostik");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [open, chatId, versionId, reloadToken]);

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, VersionDiagnosticsLog[]>();
    for (const log of logs) {
      const key = typeof log.category === "string" && log.category.trim() ? log.category.trim() : "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(log);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [logs]);

  const latestPreviewDescription = useMemo(
    () => describePreviewDiagnosticCode(summary?.latestPreviewCode ?? null),
    [summary?.latestPreviewCode],
  );

  const canAutoFix = logs.some((log) => log.level === "error" || log.level === "warning");

  const handleAutoFix = () => {
    if (!chatId || !versionId) return;
    const reasons = Array.from(
      new Set(
        logs
          .filter((log) => log.level === "error" || log.level === "warning")
          .slice(0, 5)
          .map((log) => log.message.trim())
          .filter(Boolean),
      ),
    );
    dispatchAutoFixEvent({
      chatId,
      versionId,
      reasons: reasons.length > 0 ? reasons : ["diagnostic issue"],
      meta: { source: "version-diagnostics" },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Versionsdiagnostik</DialogTitle>
          <DialogDescription>
            Samlar verifiering, previewfel och andra loggar för den valda versionen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Loggar: {summary?.total ?? logs.length}</Badge>
          <Badge variant="outline">Fel: {summary?.byLevel?.error ?? 0}</Badge>
          <Badge variant="outline">Varningar: {summary?.byLevel?.warning ?? 0}</Badge>
          <Badge variant="outline">Info: {summary?.byLevel?.info ?? 0}</Badge>
          {summary?.latestPreviewCode ? (
            <Badge variant="secondary">Preview-kod: {summary.latestPreviewCode}</Badge>
          ) : null}
          {summary?.latestPreviewStage ? (
            <Badge variant="outline">Preview-steg: {summary.latestPreviewStage}</Badge>
          ) : null}
        </div>

        {latestPreviewDescription ? (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-100">
            Senaste preview-diagnos: {latestPreviewDescription}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openProjectEnvVarsPanel}>
            <KeyRound className="mr-1 h-4 w-4" />
            Miljövariabler
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={isLoading}
          >
            <RefreshCw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />
            Ladda om
          </Button>
          <Button size="sm" onClick={handleAutoFix} disabled={!canAutoFix}>
            <Wrench className="mr-1 h-4 w-4" />
            Kör autofix
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh] rounded-md border">
          <div className="space-y-3 p-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar diagnostik...
              </div>
            ) : error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : groupedLogs.length === 0 ? (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
                Inga sparade fel eller varningar för den här versionen ännu.
              </div>
            ) : (
              groupedLogs.map(([category, entries]) => (
                <div key={category} className="rounded-md border border-border/70 bg-background/40">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                    <div className="font-medium">{category}</div>
                    <Badge variant="outline">{entries.length}</Badge>
                  </div>
                  <div className="space-y-2 p-3">
                    {entries.map((log) => (
                      <div key={log.id} className="rounded-md border border-border/50 bg-background/60 p-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={levelBadgeVariant(log.level)}>{log.level}</Badge>
                          {formatTimestamp(log.created_at) ? (
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(log.created_at)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-foreground">{log.message}</div>
                        {log.meta ? (
                          <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-muted-foreground">
                            {JSON.stringify(log.meta, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {!isLoading && !error && logs.some((log) => log.level === "error") ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Den här versionen har fel loggade. Kör autofix om du vill skicka en reparationsprompt
                    baserad på de senaste problemen.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
