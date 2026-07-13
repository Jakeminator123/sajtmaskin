"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronRight, KeyRound, Loader2 } from "lucide-react";
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
   * a catalog row sends the deterministic `buildAddDossierMessage`-format
   * (`Lägg till byggblocket "<label>" (id: <id>)`) through the existing
   * chat flow instead of a separate mutation path. When absent (e.g. this
   * component rendered without the callback wired up), catalog rows are
   * shown but not selectable.
   */
  onRequestDossier?: (payload: { id: string; label: string }) => void;
  /**
   * True while a catalog pick must wait: a generation is streaming (sending
   * would abort it) or an unanswered pending question exists. Rows are
   * disabled with a short hint while true.
   */
  catalogPickDisabled?: boolean;
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
 * Toolbar "Byggblock" popover: the primary user surface for selecting,
 * inspecting AND configuring dossiers. Data is lazily fetched from
 * `GET /api/engine/chats/[chatId]/dossiers` when the popover opens (and
 * re-fetched when the active version changes or after a save).
 *
 * Owner decision 2026-07-13 (supersedes the earlier catalog/status-only
 * contract): expanded hard-dossier rows carry masked env-key inputs in BOTH
 * F2 and F3, saving to the canonical project env-vars API. Saving a
 * feature-runtime key flips the dossier from "Byggd — demo aktiv" to
 * "Byggd — live" without a new LLM round. The chat stays silent about env
 * (F2-mute is about chat traffic, not voluntary configuration), and secrets
 * are write-only: the panel only ever reads boolean `hasRealValue` flags.
 * A finalize-design 412 focuses the affected dossier here (pure UI action —
 * the server's missingByIntegration stays the source of truth).
 */
export function PreviewPanelDossiers({
  chatId,
  versionId,
  lifecycleStage,
  className,
  onRequestDossier,
  catalogPickDisabled = false,
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
  // popover is opened — dossiers-hub-primary) and whenever chatId/versionId
  // change (`load` is memoized on them). `load` aborts any in-flight request,
  // so overlapping triggers collapse to the freshest response.
  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Refetch when the popover OPENS (keeps env-key readiness fresh — e.g.
  // after the user saved keys in ProjectEnvVarsPanel without a new version).
  // Deliberately NOT on close: the old `[open, load]`-effect refetched on the
  // close-flip too, a pointless request per stängning.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

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

  // Open-events may carry env keys (e.g. a finalize-design 412 or an
  // integrations chat card). The keys focus the affected dossier: switch to
  // "Inkopplade" and expand the first row owning one of them, so the user
  // lands directly on the inputs that unblock/activate the integration.
  const [pendingFocusKeys, setPendingFocusKeys] = useState<string[] | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const { envKeys } = readDossiersPanelOpenDetail(event);
      setOpen(true);
      if (envKeys.length > 0) {
        setActiveTab("wired");
        setPendingFocusKeys(envKeys);
        // Refetch explicitly (Bugbot on this diff): when the popover is
        // ALREADY open, `setOpen(true)` is a no-op and the `[open, load]`
        // effect never fires — a 412 focus would then run against stale data.
        void load();
      }
    };
    window.addEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    return () => window.removeEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
  }, [load]);

  // One-shot pick lock: the ref blocks a double-click in the same tick (state
  // updates are async), the state drives the disabled UI + notice. Reset when
  // the popover closes so nästa öppning kan välja igen.
  const pickInFlightRef = useRef(false);
  const [pickedEntry, setPickedEntry] = useState<DossierCatalogEntry | null>(null);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      pickInFlightRef.current = false;
      setPickedEntry(null);
      // A focus request that never matched must not linger into a later,
      // unrelated open (it would surprise-expand a row).
      setPendingFocusKeys(null);
    }
  }, []);

  useEffect(() => {
    setExpandedId(null);
    // A focus request targeting the previous chat/version must not
    // auto-expand a row in the new context (Bugbot on this diff).
    setPendingFocusKeys(null);
  }, [chatId, versionId]);

  // Full dossier CATALOG ("Bläddra katalog"-tab) — static registry data, so
  // it is fetched once (per mount) and cached in state across popover opens
  // instead of refetching every time like the per-version "Inkopplade" list.
  const [catalogData, setCatalogData] = useState<DossierCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  // Mirrors the wired list's abort pattern: a newer load aborts an older
  // in-flight one, and unmount aborts whatever is pending.
  const catalogAbortRef = useRef<AbortController | null>(null);
  const loadCatalog = useCallback(async () => {
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const { signal } = controller;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/dossiers/catalog", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DossierCatalogResponse;
      if (signal.aborted) return;
      setCatalogData(json);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setCatalogError(
        err instanceof Error
          ? `Kunde inte hämta katalogen: ${err.message}`
          : "Kunde inte hämta katalogen.",
      );
    } finally {
      if (!signal.aborted) setCatalogLoading(false);
    }
  }, []);
  useEffect(() => {
    // `catalogError` must bail too (Codex/Vercel P2 on #482): without it a
    // failed fetch retriggers this effect every render while the popover is
    // open — an infinite retry loop hammering the route. Recovery is the
    // explicit "Försök igen" button, not implicit re-render retries.
    if (!open || catalogData || catalogLoading || catalogError) return;
    void loadCatalog();
  }, [open, catalogData, catalogLoading, catalogError, loadCatalog]);
  useEffect(() => {
    return () => catalogAbortRef.current?.abort();
  }, []);

  // Only trust data whose identity matches the current chat/version. On a
  // mismatch (chat/version changed) we render the loading state instead of a
  // stale context's dossiers until the in-flight refetch resolves.
  const freshData = data && dataKey === overviewKey ? data : null;
  const stage =
    freshData?.lifecycleStage ?? (lifecycleStage === "integrations" ? "integrations" : "design");
  const count = freshData?.counts.total ?? null;

  // Resolve a pending focus request once fresh data is available: expand the
  // first dossier that owns one of the requested keys. The pending list is
  // only consumed on a MATCH (Bugbot on this diff): the open-event itself
  // triggers a refetch, and the target dossier may only appear in that
  // fresher response — clearing on a stale miss would drop the 412 focus.
  // An unmatched request survives refetches and is discarded on close.
  useEffect(() => {
    if (!pendingFocusKeys || !freshData) return;
    const wanted = new Set(pendingFocusKeys.map((key) => key.toUpperCase()));
    const target = freshData.dossiers.find((dossier) =>
      dossier.envVars.some((env) => wanted.has(env.key.toUpperCase())),
    );
    if (!target) return;
    // Re-assert the tab on match: the empty-state auto-switch (below) may
    // have flipped to "catalog" while the refetch was in flight.
    setActiveTab("wired");
    setExpandedId(target.id);
    setPendingFocusKeys(null);
  }, [pendingFocusKeys, freshData]);

  // Inline env-key saves (write-only): values live only in local state until
  // POSTed to the canonical project env-vars API, then the fields are
  // cleared. The panel never reads secrets back — status flips come from the
  // refetch triggered by `dispatchProjectEnvVarsUpdated`.
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [savingDossierId, setSavingDossierId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ dossierId: string; message: string } | null>(
    null,
  );
  const projectId = freshData?.projectId ?? null;

  // Secret-draft hygiene (Bugbot on this diff): typed-but-unsaved key values
  // must never survive a chat switch — the panel stays mounted, and a stale
  // draft could otherwise be saved into the NEXT chat's project. Version
  // switches within the same chat keep drafts (env vars are project-scoped).
  useEffect(() => {
    setKeyValues({});
    setSaveError(null);
    setPendingFocusKeys(null);
  }, [chatId]);

  const handleSaveKeys = useCallback(
    async (dossier: DossierOverviewEntry) => {
      if (!projectId || savingDossierId) return;
      const missingEnvKeys = dossier.envVars
        .filter((env) => !env.hasRealValue)
        .map((env) => env.key);
      const filled = missingEnvKeys.filter((key) => (keyValues[key] ?? "").trim().length > 0);
      if (filled.length === 0) return;
      setSavingDossierId(dossier.id);
      setSaveError(null);
      try {
        const vars = filled.map((key) => ({
          key,
          value: keyValues[key].trim(),
          sensitive: true,
        }));
        const response = await fetch(
          `/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vars, upsert: true }),
          },
        );
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
        } | null;
        if (!response.ok || !data?.success) {
          setSaveError({
            dossierId: dossier.id,
            message: data?.error || "Kunde inte spara nycklarna.",
          });
          return;
        }
        setKeyValues((current) => {
          const next = { ...current };
          for (const key of filled) delete next[key];
          return next;
        });
        // Notifies every builder surface (incl. this panel's own listener →
        // refetch → fresh hasRealValue/status) and the preview VM env sync.
        dispatchProjectEnvVarsUpdated({
          projectId,
          chatId,
          versionId,
          envKeys: filled,
        });
      } catch (error) {
        setSaveError({
          dossierId: dossier.id,
          message:
            error instanceof Error
              ? `Kunde inte spara nycklarna: ${error.message}`
              : "Kunde inte spara nycklarna.",
        });
      } finally {
        setSavingDossierId(null);
      }
    },
    [chatId, keyValues, projectId, savingDossierId, versionId],
  );

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
      if (!onRequestDossier || catalogPickDisabled) return;
      // Synchronous double-click lock — `pickedEntry`-state hinner inte
      // re-rendera mellan två klick i samma tick.
      if (pickInFlightRef.current) return;
      pickInFlightRef.current = true;
      setPickedEntry(entry);
      onRequestDossier({ id: entry.id, label: entry.label });
      // F2 + hårt byggblock: håll popovern öppen med en kort inline-notis om
      // att blocket mockas i designläget (speglar "Planerad (F2-mockup)").
      // Övriga val stänger popovern — meddelandet syns direkt i chatten.
      if (!(stage !== "integrations" && entry.class === "hard")) {
        handleOpenChange(false);
      }
    },
    [onRequestDossier, catalogPickDisabled, stage, handleOpenChange],
  );

  // Attention badge (dossiers-hub-primary): a build-blocked dossier OR a
  // built one still running its demo fallback (missing feature-runtime key).
  // Drives the amber dot on the toolbar button so the user is nudged to the
  // popover without a chat popup. Planned dossiers stay quiet — nothing is
  // actionable until the code is built (or the build is key-blocked).
  const needsAttention = (freshData?.dossiers ?? []).some(
    (dossier) => dossier.status === "blocked-build" || dossier.status === "built-demo",
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
            {/* Svensk gruppetikett i stället för rå capability-slug (t.ex.
                "payments") — samma presentationskarta som grupprubrikerna. */}
            <span className="block truncate text-[10px] text-gray-500">
              {resolveDossierGroup(entry.capability).label}
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
            {entry.status === "blocked-build" && entry.missingKeys.length > 0 ? (
              <p className="text-amber-300">
                Blockerar &quot;Bygg integrationer&quot;: {entry.missingKeys.join(", ")}
              </p>
            ) : null}
            {entry.status === "built-demo" && entry.missingLiveKeys.length > 0 ? (
              <p className="text-amber-300">
                Demo-läge — lägg till för livefunktion: {entry.missingLiveKeys.join(", ")}
              </p>
            ) : null}
            {entry.envVars.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-gray-400">Env-nycklar</p>
                <ul className="space-y-2">
                  {entry.envVars.map((env) => {
                    const valueState = describeEnvKeyValueState(env);
                    return (
                      <li key={env.key} className="space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
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
                        </span>
                        {/* Write-only masked input for keys without a stored
                            real value — available in both F2 and F3 (owner
                            decision 2026-07-13). Saved values are never read
                            back; only `hasRealValue` flips. */}
                        {!env.hasRealValue ? (
                          <span className="flex items-center gap-1.5">
                            <KeyRound className="h-3 w-3 shrink-0 text-gray-500" />
                            <Input
                              type="password"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={`Värde för ${env.key}`}
                              value={keyValues[env.key] ?? ""}
                              disabled={!projectId || savingDossierId !== null}
                              onChange={(event) =>
                                setKeyValues((current) => ({
                                  ...current,
                                  [env.key]: event.target.value,
                                }))
                              }
                              placeholder={
                                projectId ? "Klistra in riktigt värde" : "Projekt saknas"
                              }
                              className="h-7 border-gray-700 bg-black/30 text-[11px]"
                            />
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {entry.envVars.some((env) => !env.hasRealValue) ? (
                  <div className="mt-2 space-y-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        !projectId ||
                        savingDossierId !== null ||
                        !entry.envVars.some(
                          (env) =>
                            !env.hasRealValue && (keyValues[env.key] ?? "").trim().length > 0,
                        )
                      }
                      onClick={() => void handleSaveKeys(entry)}
                    >
                      {savingDossierId === entry.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      Spara och aktivera
                    </Button>
                    {!projectId ? (
                      <p className="text-[10px] text-gray-500">
                        Nycklar kan sparas när chatten är kopplad till ett projekt.
                      </p>
                    ) : null}
                    {saveError && saveError.dossierId === entry.id ? (
                      <p className="text-[10px] text-rose-300">{saveError.message}</p>
                    ) : null}
                  </div>
                ) : null}
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
              ? "Byggblock: en integration är blockerad eller kör i demo-läge — klicka för att fylla i nycklar"
              : "Visa och konfigurera inkopplade byggblock"
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
              aria-label="Åtgärd krävs: en integration är blockerad eller kör i demo-läge"
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
            {catalogPickDisabled ? (
              <p className="border-b border-gray-800 bg-sky-500/[0.06] px-3 py-2 text-[10px] text-sky-200">
                Vänta tills pågående generering är klar innan du lägger till ett
                byggblock.
              </p>
            ) : null}
            {pickedEntry ? (
              <p
                className="border-b border-gray-800 bg-sky-500/[0.06] px-3 py-2 text-[10px] text-sky-200"
                aria-live="polite"
              >
                Byggblocket &quot;{pickedEntry.label}&quot; läggs till via chatten.
                {pickedEntry.class === "hard"
                  ? " Hårda byggblock visas som mockup i designläget och kopplas in på riktigt vid \u201dBygg integrationer\u201d."
                  : null}
              </p>
            ) : null}
            <div className="max-h-[420px] overflow-y-auto p-2">
              {catalogLoading && !catalogData ? (
                <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Läser katalogen…
                </div>
              ) : catalogError ? (
                <div className="space-y-2 px-1 py-3">
                  <p className="text-[11px] text-rose-300">{catalogError}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => void loadCatalog()}
                  >
                    Försök igen
                  </Button>
                </div>
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
                        {group.dossiers.map((entry) => {
                          const pickBlocked =
                            !onRequestDossier || catalogPickDisabled || pickedEntry !== null;
                          return (
                            <li key={entry.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectCatalogDossier(entry)}
                                disabled={pickBlocked}
                                title={
                                  !onRequestDossier
                                    ? undefined
                                    : catalogPickDisabled
                                      ? "Vänta tills pågående generering är klar"
                                      : pickedEntry !== null
                                        ? "Ett byggblock har redan valts — stäng panelen för att välja igen"
                                        : `Lägg till byggblocket ${entry.label}`
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
                          );
                        })}
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
