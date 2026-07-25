"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, FileText, MessageSquare, Pause, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminResource } from "../../lib/use-admin-resource";
import { DataState, RefreshButton, SectionCard, StatCard, TechnicalDetails } from "../ui-bits";
import type { FrontlogEntry, FrontlogsPayload } from "../types";

interface PromptLog {
  id: string;
  event: string;
  appProjectId: string | null;
  chatId: string | null;
  promptOriginal: string | null;
  promptFormatted: string | null;
  systemPrompt: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  modelTier: string | null;
  createdAt: string | null;
}

const AUTO_REFRESH_MS = 5000;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("sv-SE");
}

/** Token totals for the selected run — the numbers the old /logg page showed. */
function summarizeTokens(entries: FrontlogEntry[]) {
  return entries.reduce(
    (acc, entry) => {
      const usage = entry.data.tokenUsage as Record<string, unknown> | undefined;
      acc.prompt += readNumber(entry.data.promptTokens) ?? readNumber(usage?.prompt) ?? 0;
      acc.completion +=
        readNumber(entry.data.completionTokens) ?? readNumber(usage?.completion) ?? 0;
      return acc;
    },
    { prompt: 0, completion: 0 },
  );
}

/**
 * Runtime + prompt logs in one place.
 *
 * Replaces both the old `Frontloggar` admin tab and the standalone `/log` +
 * `/logg` pages, which rendered the same `dev-log-reader` data twice (one via the
 * admin-gated `/api/admin/frontlogs`, one via the dev-only `/api/dev-log`).
 */
export function LoggarSection() {
  const [slug, setSlug] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const params = new URLSearchParams({ limit: "150" });
  if (slug) params.set("slug", slug);

  const runtime = useAdminResource<FrontlogsPayload>(`/api/admin/frontlogs?${params.toString()}`, {
    errorMessage: "Kunde inte hämta körningsloggen",
  });
  const prompts = useAdminResource<PromptLog[], { logs: PromptLog[] }>(
    "/api/admin/prompt-logs?limit=20",
    {
      select: (json) => json.logs ?? [],
      errorMessage: "Kunde inte hämta promptloggen",
    },
  );

  // `reload` is stable per URL (useCallback in useAdminResource), so the polling
  // interval is only re-created when the toggle or the queried run changes.
  const reloadRuntime = runtime.reload;
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void reloadRuntime();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, reloadRuntime]);

  const runtimeData = runtime.data;
  const entries = useMemo(() => runtimeData?.entries ?? [], [runtimeData]);
  const tokens = useMemo(() => summarizeTokens(entries), [entries]);
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of entries) {
      const type = readString(entry.data.type);
      if (type) types.add(type);
    }
    return types.size;
  }, [entries]);

  return (
    <Tabs defaultValue="runtime" className="space-y-4">
      <TabsList>
        <TabsTrigger value="runtime" className="gap-2">
          <Activity className="h-4 w-4" />
          Körning
        </TabsTrigger>
        <TabsTrigger value="prompts" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Promptar
        </TabsTrigger>
      </TabsList>

      <TabsContent value="runtime" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={autoRefresh ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setAutoRefresh((current) => !current)}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoRefresh ? "Uppdaterar automatiskt" : "Uppdatera automatiskt"}
          </Button>
          <RefreshButton onClick={() => void runtime.reload()} loading={runtime.loading} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Händelser" value={runtime.data?.entryCount ?? 0} />
          <StatCard label="Eventtyper" value={eventTypes} />
          <StatCard label="Prompt-tokens" value={tokens.prompt} />
          <StatCard label="Svars-tokens" value={tokens.completion} />
        </div>

        {(runtime.data?.slugs?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={slug === null ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSlug(null)}
            >
              Alla körningar
            </Button>
            {(runtime.data?.slugs ?? []).map((item) => (
              <Button
                key={item}
                variant={slug === item ? "secondary" : "ghost"}
                size="sm"
                className="h-7 font-mono text-xs"
                onClick={() => setSlug(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        )}

        {runtime.data?.note && (
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertTitle>Ingen logg hittad</AlertTitle>
            <AlertDescription>{runtime.data.note}</AlertDescription>
          </Alert>
        )}

        <DataState
          loading={runtime.loading && !runtime.data}
          error={runtime.error}
          isEmpty={entries.length === 0}
          onRetry={() => void runtime.reload()}
          emptyTitle="Inga händelser"
          emptyDescription="Kör ett bygge så fylls loggen. I molnmiljön skrivs den normalt inte."
          emptyIcon={Activity}
          skeletonRows={4}
        >
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const type = readString(entry.data.type) || "okänd händelse";
              const message = readString(entry.data.message);
              const model =
                readString(entry.data.modelId) ||
                readString(entry.data.model) ||
                readString(entry.data.modelTier);
              const chatId = readString(entry.data.chatId);
              const durationMs = readNumber(entry.data.durationMs);
              return (
                <div
                  key={`${entry.ts}-${entry.target}-${index}`}
                  className="border-border bg-card/50 rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{entry.target}</Badge>
                    <Badge variant="secondary">{type}</Badge>
                    {entry.slug && (
                      <Badge variant="outline" className="font-mono">
                        {entry.slug}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{formatWhen(entry.ts)}</span>
                    {model && <span className="text-muted-foreground">modell: {model}</span>}
                    {durationMs !== null && (
                      <span className="text-muted-foreground">{durationMs} ms</span>
                    )}
                    {chatId && (
                      <span className="text-muted-foreground font-mono">chatt: {chatId}</span>
                    )}
                  </div>
                  {message && <p className="mt-2 text-sm whitespace-pre-wrap">{message}</p>}
                  <div className="mt-2">
                    <TechnicalDetails summary="Visa rådata">
                      <pre className="bg-muted/40 max-h-80 overflow-auto rounded-md p-3 text-xs">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    </TechnicalDetails>
                  </div>
                </div>
              );
            })}
          </div>
        </DataState>
      </TabsContent>

      <TabsContent value="prompts" className="space-y-4">
        <SectionCard
          title="Senaste promptarna"
          description="De 20 senaste sparade promptarna med modell och byggsätt."
          icon={MessageSquare}
          action={<RefreshButton onClick={() => void prompts.reload()} loading={prompts.loading} />}
        >
          <DataState
            loading={prompts.loading && !prompts.data}
            error={prompts.error}
            isEmpty={!prompts.data?.length}
            onRetry={() => void prompts.reload()}
            emptyTitle="Inga promptar sparade"
            emptyDescription="Promptloggen fylls när någon bygger en sajt."
            emptyIcon={MessageSquare}
          >
            <div className="space-y-2">
              {(prompts.data ?? []).map((log) => (
                <div key={log.id} className="border-border bg-card/50 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">{log.event}</Badge>
                    {log.modelTier && <Badge variant="outline">{log.modelTier}</Badge>}
                    {log.buildMethod && <Badge variant="outline">{log.buildMethod}</Badge>}
                    {log.buildIntent && <Badge variant="outline">{log.buildIntent}</Badge>}
                    <span className="text-muted-foreground">{formatWhen(log.createdAt)}</span>
                  </div>
                  {log.promptOriginal && (
                    <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap">
                      {log.promptOriginal}
                    </p>
                  )}
                  <div className="mt-2">
                    <TechnicalDetails summary="Visa promptdetaljer">
                      <div className="space-y-3">
                        {[
                          { label: "Användarens prompt", value: log.promptOriginal },
                          { label: "Bearbetad prompt", value: log.promptFormatted },
                          { label: "Systemprompt", value: log.systemPrompt },
                        ].map((block) => (
                          <div key={block.label}>
                            <p className="text-muted-foreground mb-1 text-xs">{block.label}</p>
                            <pre className="bg-muted/40 max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                              {block.value || "—"}
                            </pre>
                          </div>
                        ))}
                        <p className="text-muted-foreground text-xs">
                          Chatt: <span className="font-mono">{log.chatId || "—"}</span> · Projekt:{" "}
                          <span className="font-mono">{log.appProjectId || "—"}</span>
                        </p>
                      </div>
                    </TechnicalDetails>
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </SectionCard>
      </TabsContent>
    </Tabs>
  );
}
