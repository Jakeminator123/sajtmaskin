"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronRight, Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  describeDossierStatus,
  describeEnvKeyValueState,
  type DossierOverviewEntry,
  type DossierOverviewResponse,
  type DossierStatusDescriptor,
} from "@/lib/builder/dossier-overview";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  dispatchProjectEnvVarsUpdated,
  readDossiersPanelOpenDetail,
  requestF3Rebuild,
} from "@/lib/builder/project-env-events";
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
 * they have been built into the active version. Data is lazily fetched from
 * `GET /api/engine/chats/[chatId]/dossiers` when the popover opens (and
 * re-fetched when the active version changes or after a save).
 *
 * It is also the canonical env-key entry point: when integrations still need
 * real values, the top section lets the user fill the missing keys inline
 * (persisted via `POST /api/v0/projects/[projectId]/env-vars`) and then re-run
 * "Bygg integrationer" via the retry CTA. Mounted in the preview chrome in both
 * F2 and F3, so it can be opened after a finalize-design 412 while still in F2
 * without breaking F2-mute (it only opens on explicit user action).
 */
export function PreviewPanelDossiers({
  chatId,
  versionId,
  lifecycleStage,
  className,
}: PreviewPanelDossiersProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DossierOverviewResponse | null>(null);
  // Identity (`chatId::versionId`) the held `data` was fetched for, so we can
  // ignore it when the builder switches chat/version while the popover holds
  // an older response.
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Keys the popover was asked to highlight (e.g. after a finalize-design 412
  // or from an integration chat card). Non-empty also flags "opened to collect
  // missing keys", which enables the "Bygg integrationer igen" retry CTA.
  const [highlightKeys, setHighlightKeys] = useState<string[]>([]);
  const [openedForMissing, setOpenedForMissing] = useState(false);
  // Draft values for the inline missing-key inputs, keyed by env-var name.
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const overviewKey = `${chatId}::${versionId ?? ""}`;

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
        setDataKey(`${chatId}::${versionId ?? ""}`);
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

  // Fire-and-forget refetch used after saving keys (outside the open effect's
  // lifecycle). Guarded downstream by the `dataKey === overviewKey` identity
  // check, so a late response for a stale context is ignored.
  const refetch = useCallback(() => {
    const controller = new AbortController();
    void load(controller.signal);
  }, [load]);

  // Let other builder surfaces (finalize-design 412 handler, integration chat
  // cards) open this popover and highlight the keys that still need values.
  useEffect(() => {
    const handler = (event: Event) => {
      const { envKeys } = readDossiersPanelOpenDetail(event);
      setHighlightKeys(envKeys);
      setOpenedForMissing(envKeys.length > 0);
      setOpen(true);
    };
    window.addEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    return () => window.removeEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setHighlightKeys([]);
      setOpenedForMissing(false);
      setValues({});
      setSaveError(null);
    }
  }, []);

  // Only trust data whose identity matches the current chat/version. On a
  // mismatch (chat/version changed) we render the loading state instead of a
  // stale context's dossiers until the in-flight refetch resolves.
  const freshData = data && dataKey === overviewKey ? data : null;
  const hardDossiers = freshData?.dossiers.filter((d) => d.requiresF3) ?? [];
  const softDossiers = freshData?.dossiers.filter((d) => !d.requiresF3) ?? [];
  const stage =
    freshData?.lifecycleStage ?? (lifecycleStage === "integrations" ? "integrations" : "design");
  const count = freshData?.counts.total ?? null;

  // Flat, de-duplicated list of env keys that still need a real value: the
  // union of every hard dossier's `missingKeys` plus any highlighted key not
  // already covered (so a 412's keys always get an input even if detection
  // differs). This is the primary "fill me" surface at the top of the popover.
  const missingEntries = useMemo(() => {
    const map = new Map<
      string,
      { key: string; dossierLabel: string; enforcement: DossierOverviewEntry["envVars"][number]["enforcement"] }
    >();
    // Keys the fresh data already reports as satisfied (real value stored), so a
    // highlighted key that has since been filled is not re-injected below (which
    // would keep the "fill me" block open forever and block the retry CTA).
    const satisfiedKeys = new Set<string>();
    for (const dossier of freshData?.dossiers ?? []) {
      for (const env of dossier.envVars) {
        if (env.hasRealValue) satisfiedKeys.add(env.key);
      }
      for (const key of dossier.missingKeys) {
        if (map.has(key)) continue;
        const env = dossier.envVars.find((e) => e.key === key);
        map.set(key, {
          key,
          dossierLabel: dossier.label,
          enforcement: env?.enforcement ?? "build",
        });
      }
    }
    for (const key of highlightKeys) {
      if (!map.has(key) && !satisfiedKeys.has(key)) {
        map.set(key, { key, dossierLabel: "Integration", enforcement: "build" });
      }
    }
    return [...map.values()];
  }, [freshData, highlightKeys]);

  const projectId = freshData?.projectId ?? null;
  const canSave = Boolean(projectId);
  const filledCount = missingEntries.filter(
    (entry) => (values[entry.key] ?? "").trim().length > 0,
  ).length;
  // Show the retry CTA once the popover was opened to collect keys and nothing
  // is missing anymore (all keys got real values), as long as there is at least
  // one heavy integration to build. Gated to F2: the rebuild event is only
  // listened for by `PreviewPanelF3Trigger`, which is unmounted in F3
  // (`lifecycleStage === "integrations"`), so a retry button there would be a
  // no-op. In F3 the keys are saved and the normal readiness flow takes over.
  const showRetry =
    openedForMissing &&
    Boolean(freshData) &&
    missingEntries.length === 0 &&
    (freshData?.counts.hard ?? 0) > 0 &&
    stage !== "integrations";

  const handleSaveMissing = useCallback(async () => {
    if (!projectId) return;
    const vars = missingEntries
      .map((entry) => ({ key: entry.key, value: (values[entry.key] ?? "").trim() }))
      .filter((entry) => entry.value.length > 0)
      .map((entry) => ({ key: entry.key, value: entry.value, sensitive: true }));
    if (vars.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars, upsert: true }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const savedKeys = vars.map((entry) => entry.key);
      dispatchProjectEnvVarsUpdated({
        projectId,
        chatId,
        versionId,
        envKeys: savedKeys,
      });
      setValues({});
      // Drop just-saved keys from the highlight set so an orphan highlight key
      // (one not present in any dossier's envVars, hence never reflected by the
      // refetch) does not keep the "fill me" block open after it is saved.
      setHighlightKeys((prev) => prev.filter((key) => !savedKeys.includes(key)));
      refetch();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? `Kunde inte spara nycklar: ${err.message}`
          : "Kunde inte spara nycklar.",
      );
    } finally {
      setSaving(false);
    }
  }, [projectId, missingEntries, values, chatId, versionId, refetch]);

  const handleRetryBuild = useCallback(() => {
    handleOpenChange(false);
    requestF3Rebuild();
  }, [handleOpenChange]);

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
                  {entry.envVars.map((env) => {
                    const valueState = describeEnvKeyValueState(env);
                    return (
                      <li key={env.key} className="flex flex-wrap items-center gap-1.5">
                        <code className="rounded bg-gray-800/60 px-1 py-0.5 text-[10px] text-gray-200">
                          {env.key}
                        </code>
                        <span className="text-[10px] text-gray-500">
                          {ENFORCEMENT_LABEL[env.enforcement]}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[9px]", TONE_BADGE_CLASS[valueState.tone])}
                          title={valueState.hint}
                        >
                          {valueState.label}
                        </Badge>
                      </li>
                    );
                  })}
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
    <Popover open={open} onOpenChange={handleOpenChange}>
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
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
            Dossiers
            {loading && freshData ? (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
            ) : null}
          </span>
          {freshData ? (
            <span className="text-[10px] text-gray-500">
              {freshData.counts.hard} hård · {freshData.counts.soft} mjuk
            </span>
          ) : null}
        </div>

        {missingEntries.length > 0 ? (
          <div className="space-y-2 border-b border-gray-800 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="text-[11px] font-semibold text-amber-200">
              Fyll i nödvändiga nycklar
            </p>
            <p className="text-[10px] text-gray-400">
              Riktiga värden krävs innan integrationerna kan byggas (F3). De sparas
              krypterat för projektet.
            </p>
            <ul className="space-y-2">
              {missingEntries.map((entry) => (
                <li key={entry.key} className="space-y-1">
                  <label className="flex items-center justify-between gap-2">
                    <code className="truncate rounded bg-gray-800/60 px-1 py-0.5 text-[10px] text-gray-100">
                      {entry.key}
                    </code>
                    <span className="shrink-0 text-[9px] text-gray-500">{entry.dossierLabel}</span>
                  </label>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={values[entry.key] ?? ""}
                    disabled={!canSave || saving}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [entry.key]: event.target.value }))
                    }
                    placeholder={canSave ? "Klistra in riktigt värde" : "Inget projekt kopplat än"}
                    className="h-7 border-gray-700 bg-gray-900 text-[11px] text-gray-100"
                  />
                </li>
              ))}
            </ul>
            {saveError ? <p className="text-[10px] text-rose-300">{saveError}</p> : null}
            {!canSave ? (
              <p className="text-[10px] text-gray-500">
                Nycklar kan sparas när projektet har kopplats (skapa/spara en version först).
              </p>
            ) : null}
            <Button
              size="sm"
              onClick={handleSaveMissing}
              disabled={!canSave || saving || filledCount === 0}
              className="h-7 w-full text-[11px]"
            >
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {filledCount > 0
                ? `Spara ${filledCount} ${filledCount === 1 ? "nyckel" : "nycklar"}`
                : "Spara nycklar"}
            </Button>
          </div>
        ) : null}

        {showRetry ? (
          <div className="space-y-2 border-b border-gray-800 bg-emerald-500/[0.06] px-3 py-2.5">
            <p className="text-[11px] font-medium text-emerald-200">
              Alla nödvändiga nycklar är ifyllda.
            </p>
            <Button
              size="sm"
              onClick={handleRetryBuild}
              className="h-7 w-full bg-violet-600 text-[11px] text-white hover:bg-violet-500"
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              Bygg integrationer igen
            </Button>
          </div>
        ) : null}

        <div className="max-h-[420px] overflow-y-auto p-2">
          {loading && !freshData ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Läser dossier-status…
            </div>
          ) : error ? (
            <p className="px-1 py-3 text-[11px] text-rose-300">{error}</p>
          ) : freshData && freshData.dossiers.length === 0 ? (
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

          {freshData && !freshData.versionFilesAvailable ? (
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
