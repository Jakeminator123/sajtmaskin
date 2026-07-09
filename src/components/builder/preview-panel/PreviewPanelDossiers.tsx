"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronRight, Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  describeDossierStatus,
  describeEnvKeyValueState,
  type DossierOverviewEntry,
  type DossierOverviewResponse,
  type DossierStatusDescriptor,
} from "@/lib/builder/dossier-overview";
import type { DossierCatalogEntry, DossierCatalogResponse } from "@/lib/builder/dossier-catalog";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  VERSION_STATUS_REFRESHED_EVENT,
  dispatchProjectEnvVarsUpdated,
  openProjectEnvVarsPanel,
  readDossiersPanelOpenDetail,
  readProjectEnvVarsUpdatedDetail,
  requestF3Rebuild,
} from "@/lib/builder/project-env-events";
import {
  DOSSIER_GROUP_ORDER,
  resolveDossierGroup,
} from "@/lib/builder/dossier-groups";
import { cn } from "@/lib/utils";

export interface PreviewPanelDossiersProps {
  chatId: string;
  versionId: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  className?: string;
  /**
   * Called when the user picks a dossier from the "Bläddra katalog"-tab.
   * Threaded from `BuilderShellContent` down to `vm.sendMessage` so picking
   * a catalog row sends `"Lägg till byggblocket <label>"` through the
   * existing chat flow instead of a separate mutation path. When absent
   * (e.g. this component rendered without the callback wired up), catalog
   * rows are shown but not selectable.
   */
  onRequestDossier?: (label: string) => void;
}

type PanelTab = "wired" | "catalog";

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
 * Toolbar "Byggblock" popover: shows which reusable building blocks are wired
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
  onRequestDossier,
}: PreviewPanelDossiersProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("wired");
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

  // Tracks the single in-flight request so a newer load (e.g. a post-save
  // refetch) aborts an earlier one. Without this, a slow initial load could
  // resolve last and overwrite fresher post-save data (resurrecting keys and
  // hiding the retry CTA).
  const abortRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
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
      if (signal.aborted) return;
      setData(json);
      setDataKey(`${chatId}::${versionId ?? ""}`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(
        err instanceof Error
          ? `Kunde inte hämta byggblock: ${err.message}`
          : "Kunde inte hämta byggblock.",
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [chatId, versionId]);

  // Fetch on mount (so the attention badge can reflect missing keys BEFORE the
  // popover is opened — dossiers-hub-primary) and whenever the popover opens or
  // chatId/versionId change (since `load` is memoized on them). `load` aborts
  // any in-flight request, so overlapping triggers collapse to the freshest
  // response. Refetching on open keeps env-key readiness fresh — e.g. after the
  // user saves keys in ProjectEnvVarsPanel without a new version. No polling.
  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [open, load]);

  // Fire-and-forget refetch used after saving keys (outside the open effect's
  // lifecycle). `load` aborts any in-flight request first, so the freshest
  // response always wins.
  const refetch = useCallback(() => {
    void load();
  }, [load]);

  // Keep the attention badge fresh without polling: refetch when env vars are
  // saved anywhere in the builder (the missing-key set may have just cleared).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      // Refetch when the update targets this chat, or carries no chat scope.
      if (!detail || !detail.chatId || detail.chatId === chatId) {
        void load();
      }
    };
    window.addEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handler);
  }, [chatId, load]);

  // Keep the "Inkopplade"-list fresh when a NEW version lands while the
  // popover is already open (e.g. mid-generation). The panel otherwise only
  // refetches on versionId-change/open/env-save — none of which fire for a
  // version that finishes streaming while the popover stays open.
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener(VERSION_STATUS_REFRESHED_EVENT, handler);
    return () => window.removeEventListener(VERSION_STATUS_REFRESHED_EVENT, handler);
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

  // Reset transient missing-key UI whenever the active chat/version changes, so
  // keys highlighted for one context can't linger (and be saved against the
  // next chat's projectId, or trigger the retry CTA for the wrong chat) if the
  // builder switches while the popover stays open.
  useEffect(() => {
    setHighlightKeys([]);
    setOpenedForMissing(false);
    setValues({});
    setSaveError(null);
    setExpandedId(null);
  }, [chatId, versionId]);

  // Full dossier CATALOG ("Bläddra katalog"-tab) — static registry data, so
  // it is fetched once (per mount) and cached in state across popover opens
  // instead of refetching every time like the per-version "Inkopplade" list.
  const [catalogData, setCatalogData] = useState<DossierCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/dossiers/catalog");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DossierCatalogResponse;
      setCatalogData(json);
    } catch (err) {
      setCatalogError(
        err instanceof Error
          ? `Kunde inte hämta katalogen: ${err.message}`
          : "Kunde inte hämta katalogen.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!open || catalogData || catalogLoading) return;
    void loadCatalog();
  }, [open, catalogData, catalogLoading, loadCatalog]);

  // Only trust data whose identity matches the current chat/version. On a
  // mismatch (chat/version changed) we render the loading state instead of a
  // stale context's dossiers until the in-flight refetch resolves.
  const freshData = data && dataKey === overviewKey ? data : null;
  const stage =
    freshData?.lifecycleStage ?? (lifecycleStage === "integrations" ? "integrations" : "design");
  const count = freshData?.counts.total ?? null;

  // Nothing wired yet: default the popover straight to "Bläddra katalog"
  // instead of an empty "Inkopplade"-tab, once per chat/version context.
  // Never fights a manual tab switch afterwards.
  const hasAutoSwitchedTabRef = useRef(false);
  useEffect(() => {
    hasAutoSwitchedTabRef.current = false;
  }, [chatId, versionId]);
  useEffect(() => {
    if (hasAutoSwitchedTabRef.current || !freshData) return;
    hasAutoSwitchedTabRef.current = true;
    if (freshData.counts.total === 0) setActiveTab("catalog");
  }, [freshData]);

  const handleSelectCatalogDossier = useCallback(
    (entry: DossierCatalogEntry) => {
      if (!onRequestDossier) return;
      onRequestDossier(entry.label);
      handleOpenChange(false);
    },
    [onRequestDossier, handleOpenChange],
  );

  // Attention badge (dossiers-hub-primary): any hard (F3) dossier that still
  // misses real env keys. Drives the amber dot on the toolbar button so the
  // user is nudged to the popover without a chat popup.
  const needsAttention = (freshData?.dossiers ?? []).some(
    (dossier) => dossier.requiresF3 && dossier.missingKeys.length > 0,
  );

  // Capability groups (dossiers-capability-groups): bucket rows by their
  // EXISTING capability via a presentation-only map (no new taxonomy). Ordered
  // groups; empty groups are dropped. Hard/soft stays a per-row badge.
  const groupedDossiers = useMemo(() => {
    const dossiers = freshData?.dossiers ?? [];
    return DOSSIER_GROUP_ORDER.map((group) => ({
      group,
      rows: dossiers.filter((dossier) => resolveDossierGroup(dossier.capability).id === group.id),
    })).filter((section) => section.rows.length > 0);
  }, [freshData]);

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
  // Only treat "no project" as confirmed once data has loaded — during the
  // initial fetch `projectId` is null but the project may well exist, so the
  // inputs must not be disabled (nor mislabelled) while loading.
  const noProject = Boolean(freshData) && !projectId;
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
    if (!projectId) return; // save button is disabled until the project id is known

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
            className={cn(
              "text-[9px]",
              entry.class === "hard"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-gray-600/50 bg-gray-500/10 text-gray-300",
            )}
            title={
              entry.class === "hard"
                ? "Hårt byggblock — kräver riktiga nycklar"
                : "Mjukt byggblock — självförsörjande, kräver inga externa nycklar"
            }
          >
            {entry.class === "hard" ? "Hård" : "Mjuk"}
          </Badge>
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
          title={
            needsAttention
              ? "Byggblock: en integration saknar nycklar — klicka för att fylla i"
              : "Visa inkopplade byggblock och integrationsstatus"
          }
          className={cn("relative text-gray-400 hover:text-white", className)}
        >
          <Boxes className="mr-1 h-4 w-4" />
          Byggblock
          {count !== null && count > 0 ? (
            <Badge
              variant="outline"
              className="ml-1.5 border-gray-600/50 bg-gray-500/10 text-[10px] text-gray-200"
            >
              {count}
            </Badge>
          ) : null}
          {needsAttention ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-gray-950"
              aria-label="Åtgärd krävs: en integration saknar nycklar"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-gray-800 bg-gray-950 p-0 text-gray-200"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
            Byggblock
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

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as PanelTab)}
          className="w-full gap-0"
        >
          <TabsList
            variant="line"
            className="mx-3 mt-2 h-7 w-auto gap-1 border-b border-gray-800 bg-transparent p-0"
          >
            <TabsTrigger
              value="wired"
              className="rounded-none border-0 px-1.5 py-1 text-[11px] text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              Inkopplade
            </TabsTrigger>
            <TabsTrigger
              value="catalog"
              className="rounded-none border-0 px-1.5 py-1 text-[11px] text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              Bläddra katalog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wired" className="mt-0">
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
                    disabled={noProject || saving}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [entry.key]: event.target.value }))
                    }
                    placeholder={noProject ? "Inget projekt kopplat än" : "Klistra in riktigt värde"}
                    className="h-7 border-gray-700 bg-gray-900 text-[11px] text-gray-100"
                  />
                </li>
              ))}
            </ul>
            {saveError ? <p className="text-[10px] text-rose-300">{saveError}</p> : null}
            {noProject ? (
              <p className="text-[10px] text-gray-500">
                Nycklar kan sparas när projektet har kopplats (skapa/spara en version först).
              </p>
            ) : null}
            <Button
              size="sm"
              onClick={handleSaveMissing}
              disabled={saving || filledCount === 0 || !projectId}
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
              Läser byggblock-status…
            </div>
          ) : error ? (
            <p className="px-1 py-3 text-[11px] text-rose-300">{error}</p>
          ) : freshData && freshData.dossiers.length === 0 ? (
            <p className="px-1 py-3 text-[11px] text-gray-400">
              Inga byggblock är inkopplade i den här versionen.
            </p>
          ) : (
            <div className="space-y-3">
              {groupedDossiers.map(({ group, rows }) => (
                <div key={group.id} className="space-y-1.5">
                  <p className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                    {group.label}
                  </p>
                  <ul className="space-y-1.5">{rows.map(renderRow)}</ul>
                </div>
              ))}
            </div>
          )}

          {freshData && !freshData.versionFilesAvailable ? (
            <p className="mt-2 border-t border-gray-800 px-1 pt-2 text-[10px] text-gray-500">
              Byggstatus kunde inte läsas (versionens filer saknas) — hård-status
              visas som ej byggd tills filerna finns.
            </p>
          ) : null}
        </div>
          </TabsContent>

          <TabsContent value="catalog" className="mt-0">
            <div className="max-h-[420px] overflow-y-auto p-2">
              {catalogLoading && !catalogData ? (
                <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Läser katalogen…
                </div>
              ) : catalogError ? (
                <p className="px-1 py-3 text-[11px] text-rose-300">{catalogError}</p>
              ) : catalogData && catalogData.groups.length === 0 ? (
                <p className="px-1 py-3 text-[11px] text-gray-400">Katalogen är tom.</p>
              ) : (
                <div className="space-y-3">
                  {(catalogData?.groups ?? []).map((group) => (
                    <div key={group.id} className="space-y-1.5">
                      <p className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                        {group.label}
                      </p>
                      <ul className="space-y-1.5">
                        {group.dossiers.map((entry) => (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectCatalogDossier(entry)}
                              disabled={!onRequestDossier}
                              title={
                                onRequestDossier
                                  ? `Lägg till byggblocket ${entry.label}`
                                  : undefined
                              }
                              className="flex w-full items-start gap-2 rounded-md border border-gray-800 bg-black/20 px-2.5 py-2 text-left hover:bg-gray-800/40 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[12px] font-medium text-gray-100">
                                    {entry.label}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "shrink-0 text-[9px]",
                                      entry.class === "hard"
                                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                        : "border-gray-600/50 bg-gray-500/10 text-gray-300",
                                    )}
                                  >
                                    {entry.class === "hard" ? "Hård" : "Mjuk"}
                                  </Badge>
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] text-gray-500">
                                  {entry.summary}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* In F3 the full env editor is mounted and can edit already-set keys,
            which the inline "fill missing" inputs here cannot. Keep Dossiers as
            the hub but offer a one-click path to the full panel. */}
        {stage === "integrations" ? (
          <div className="border-t border-gray-800 px-3 py-2">
            <button
              type="button"
              onClick={() => openProjectEnvVarsPanel()}
              className="text-[10px] text-sky-300 hover:text-sky-200"
            >
              Redigera alla miljövariabler i panelen
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
