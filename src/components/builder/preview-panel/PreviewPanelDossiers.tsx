"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  describeDossierStatus,
  type DossierOverviewEntry,
  type DossierOverviewResponse,
  type DossierStatusDescriptor,
} from "@/lib/builder/dossier-overview";
import { cn } from "@/lib/utils";

export interface PreviewPanelDossiersProps {
  chatId: string;
  versionId: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  className?: string;
}

const TONE_BADGE_CLASS: Record<DossierStatusDescriptor["tone"], string> = {
  neutral: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  muted: "border-gray-600/50 bg-gray-500/10 text-gray-300",
};

const ENFORCEMENT_LABEL: Record<
  DossierOverviewEntry["envVars"][number]["enforcement"],
  string
> = {
  build: "krävs",
  "feature-runtime": "vid användning",
  "warn-only": "valfri",
};

/**
 * Toolbar "Dossiers" popover: shows which reusable building blocks are wired
 * into the current build and — for the heavier (hard) integrations — whether
 * they have been built into the active version. Informational only; the data
 * is lazily fetched from `GET /api/engine/chats/[chatId]/dossiers` when the
 * popover first opens (and re-fetched when the active version changes).
 */
export function PreviewPanelDossiers({
  chatId,
  versionId,
  lifecycleStage,
  className,
}: PreviewPanelDossiersProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DossierOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const url = versionId
          ? `${engineChatBaseUrl(chatId)}/dossiers?versionId=${encodeURIComponent(versionId)}`
          : `${engineChatBaseUrl(chatId)}/dossiers`;
        const res = await fetch(url, { signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as DossierOverviewResponse;
        setData(json);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? `Kunde inte hämta dossiers: ${err.message}`
            : "Kunde inte hämta dossiers.",
        );
      } finally {
        setLoading(false);
      }
    },
    [chatId, versionId],
  );

  // Fetch whenever the popover opens (and whenever chatId/versionId change
  // while open, since `load` is memoized on them). Refetching on every open
  // keeps env-key readiness fresh — e.g. after the user saves keys in
  // ProjectEnvVarsPanel without a new version — and prevents a previous
  // chat's dossiers from lingering when the builder switches chat.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [open, load]);

  const hardDossiers = data?.dossiers.filter((d) => d.requiresF3) ?? [];
  const softDossiers = data?.dossiers.filter((d) => !d.requiresF3) ?? [];
  const stage = data?.lifecycleStage ?? (lifecycleStage === "integrations" ? "integrations" : "design");
  const count = data?.counts.total ?? null;

  const renderRow = (entry: DossierOverviewEntry) => {
    const descriptor = describeDossierStatus(entry.status, stage);
    const isExpanded = expandedId === entry.id;
    return (
      <li key={entry.id} className="rounded-md border border-gray-800 bg-black/20">
        <button
          type="button"
          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-800/40"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-gray-100">
              {entry.label}
            </span>
            <span className="block truncate text-[10px] text-gray-500">
              {entry.capability}
            </span>
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px]", TONE_BADGE_CLASS[descriptor.tone])}
            title={descriptor.hint}
          >
            {descriptor.label}
          </Badge>
        </button>
        {isExpanded ? (
          <div className="space-y-2 border-t border-gray-800 px-2.5 py-2 text-[11px] text-gray-300">
            <p className="text-gray-400">{entry.summary}</p>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-500">
              <span className="rounded bg-gray-800/60 px-1.5 py-0.5">
                {entry.class === "hard" ? "Hård (kräver nycklar)" : "Mjuk (självförsörjande)"}
              </span>
              <span className="rounded bg-gray-800/60 px-1.5 py-0.5">
                Komplexitet: {entry.complexity}
              </span>
            </div>
            {entry.missingKeys.length > 0 ? (
              <p className="text-amber-300">
                Saknar riktiga värden: {entry.missingKeys.join(", ")}
              </p>
            ) : null}
            {entry.envVars.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-gray-400">Env-nycklar</p>
                <ul className="space-y-1">
                  {entry.envVars.map((env) => (
                    <li key={env.key} className="flex items-start gap-1.5">
                      <code className="rounded bg-gray-800/60 px-1 py-0.5 text-[10px] text-gray-200">
                        {env.key}
                      </code>
                      <span className="text-[10px] text-gray-500">
                        {ENFORCEMENT_LABEL[env.enforcement]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {entry.dependencies.length > 0 ? (
              <p className="text-[10px] text-gray-500">
                npm: {entry.dependencies.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="Visa inkopplade dossiers (byggblock) och integrationsstatus"
          className={cn("text-gray-400 hover:text-white", className)}
        >
          <Boxes className="mr-1 h-4 w-4" />
          Dossiers
          {count !== null && count > 0 ? (
            <Badge
              variant="outline"
              className="ml-1.5 border-gray-600/50 bg-gray-500/10 text-[10px] text-gray-200"
            >
              {count}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-gray-800 bg-gray-950 p-0 text-gray-200"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
          <span className="text-[12px] font-semibold text-white">Dossiers</span>
          {data ? (
            <span className="text-[10px] text-gray-500">
              {data.counts.hard} hård · {data.counts.soft} mjuk
            </span>
          ) : null}
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {loading && !data ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Läser dossier-status…
            </div>
          ) : error ? (
            <p className="px-1 py-3 text-[11px] text-rose-300">{error}</p>
          ) : data && data.dossiers.length === 0 ? (
            <p className="px-1 py-3 text-[11px] text-gray-400">
              Inga dossiers är inkopplade i den här versionen.
            </p>
          ) : (
            <div className="space-y-3">
              {hardDossiers.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                    Tunga integrationer
                  </p>
                  <ul className="space-y-1.5">{hardDossiers.map(renderRow)}</ul>
                </div>
              ) : null}
              {softDossiers.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                    Inkopplade byggblock
                  </p>
                  <ul className="space-y-1.5">{softDossiers.map(renderRow)}</ul>
                </div>
              ) : null}
            </div>
          )}

          {data && !data.versionFilesAvailable ? (
            <p className="mt-2 border-t border-gray-800 px-1 pt-2 text-[10px] text-gray-500">
              Byggstatus kunde inte läsas (versionens filer saknas) — hård-status
              visas som ej byggd tills filerna finns.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
