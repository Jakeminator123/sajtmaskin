"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { DossierOverviewEntry, DossierOverviewResponse } from "@/lib/builder/dossier-overview";
import type { DossierCatalogEntry, DossierCatalogResponse } from "@/lib/builder/dossier-catalog";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  VERSION_STATUS_REFRESHED_EVENT,
  dispatchProjectEnvVarsUpdated,
  readDossiersPanelOpenDetail,
  readProjectEnvVarsUpdatedDetail,
} from "@/lib/builder/project-env-events";
import {
  DOSSIER_GROUP_ORDER,
  resolveDossierGroup,
} from "@/lib/builder/dossier-groups";
import type { PanelTab, PreviewPanelDossiersProps } from "./dossiers-shared";

/**
 * All PreviewPanelDossiers hooks in their original call order.
 * Presentational pieces live in ../dossiers/*.
 */
type CatalogClassFilter = "all" | DossierCatalogEntry["class"];

export function usePreviewPanelDossiersController({
  chatId,
  versionId,
  lifecycleStage,
  onRequestDossier,
  catalogPickDisabled = false,
  onCountsChange,
}: PreviewPanelDossiersProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("wired");
  const [catalogClassFilter, setCatalogClassFilter] = useState<CatalogClassFilter>("all");
  const [data, setData] = useState<DossierOverviewResponse | null>(null);
  // Identity (`chatId::versionId`) the held `data` was fetched for, so we can
  // ignore it when the builder switches chat/version while the popover holds
  // an older response.
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const overviewKey = `${chatId}::${versionId ?? ""}`;
  // Always-current identity for async save completions to check against
  // (Bugbot, 3rd pass on this diff): handleSaveKeys/handleSaveCustomKeys
  // close over chatId/versionId at call-start, so a save still in flight
  // when the user switches chat/version has no other way to notice. Mirrors
  // the `detail.versionId !== activeVersionId` guard useBuilderVmPreview.ts
  // already applies to the same dispatchProjectEnvVarsUpdated event.
  const latestOverviewKeyRef = useRef(overviewKey);
  useEffect(() => {
    latestOverviewKeyRef.current = overviewKey;
  }, [overviewKey]);

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
  // after keys were saved elsewhere without a new version).
  // Deliberately NOT on close: the old `[open, load]`-effect refetched on the
  // close-flip too, a pointless request per stängning.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Keep the attention badge fresh without polling: refetch when env vars are
  // saved anywhere in the builder (the missing-key set may have just cleared).
  // A delete additionally clears any local draft for those keys (Bugbot on
  // #525): the input would otherwise still hold a pre-delete value, and one
  // "Spara nyckel"-click could re-persist what the user just removed.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      // Refetch when the update targets this chat, or carries no chat scope.
      if (!detail || !detail.chatId || detail.chatId === chatId) {
        if (detail?.action === "deleted" && detail.envKeys && detail.envKeys.length > 0) {
          const deleted = new Set(detail.envKeys.map((key) => key.trim().toUpperCase()));
          setKeyValues((current) => {
            const next = { ...current };
            let changed = false;
            for (const key of Object.keys(next)) {
              if (deleted.has(key.trim().toUpperCase())) {
                delete next[key];
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }
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

  // One-at-a-time staging lock: the ref blocks a double-click in the same
  // tick (state updates are async), the state drives the staging view +
  // disabled catalog rows. Reset on close or Avbryt so nästa val kan ske.
  // Confirm is a second lock — `onRequestDossier` fires once, never on stage.
  const pickInFlightRef = useRef(false);
  const confirmInFlightRef = useRef(false);
  const [pickedEntry, setPickedEntry] = useState<DossierCatalogEntry | null>(null);
  const pickedEntryRef = useRef<DossierCatalogEntry | null>(null);
  const [stagingConfirmed, setStagingConfirmed] = useState(false);
  const [stagingConfirming, setStagingConfirming] = useState(false);
  useEffect(() => {
    pickedEntryRef.current = pickedEntry;
  }, [pickedEntry]);

  const resetCatalogStaging = useCallback(() => {
    pickInFlightRef.current = false;
    confirmInFlightRef.current = false;
    setPickedEntry(null);
    setStagingConfirmed(false);
    setStagingConfirming(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      resetCatalogStaging();
      // A focus request that never matched must not linger into a later,
      // unrelated open (it would surprise-expand a row).
      setPendingFocusKeys(null);
      // A leftover class filter must not make the catalog look truncated on
      // the next, unrelated open.
      setCatalogClassFilter("all");
    }
  }, [resetCatalogStaging]);

  useEffect(() => {
    setExpandedId(null);
    // A focus request targeting the previous chat/version must not
    // auto-expand a row in the new context (Bugbot on this diff).
    setPendingFocusKeys(null);
    resetCatalogStaging();
  }, [chatId, versionId, resetCatalogStaging]);

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

  // Lucka 3 (ägarbeslut 2026-08-11): F3-statusradens framgångstitel behöver
  // counts.builtLive/builtDemo. Byggblock-panelen hämtar redan denna data —
  // vävs bara in uppåt (shell-lagret) i stället för att PreviewPanelF3Trigger
  // börjar hämta /dossiers själv. Ref håller lyssnaren stabil mot en
  // oflemoiserad callback-prop.
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => {
    onCountsChangeRef.current = onCountsChange;
  }, [onCountsChange]);
  useEffect(() => {
    onCountsChangeRef.current?.(freshData?.counts ?? null);
  }, [freshData]);
  const catalogCounts = useMemo(() => {
    const counts = { total: 0, hard: 0, soft: 0 };
    for (const group of catalogData?.groups ?? []) {
      for (const dossier of group.dossiers) {
        counts.total += 1;
        counts[dossier.class] += 1;
      }
    }
    return counts;
  }, [catalogData]);
  const filteredCatalogGroups = useMemo(() => {
    if (!catalogData) return [];
    if (catalogClassFilter === "all") return catalogData.groups;
    return catalogData.groups
      .map((group) => ({
        ...group,
        dossiers: group.dossiers.filter((dossier) => dossier.class === catalogClassFilter),
      }))
      .filter((group) => group.dossiers.length > 0);
  }, [catalogData, catalogClassFilter]);

  // Custom env-blockers (Codex P2 on #573): a `custom-env` key detected in
  // generated code is not owned by any dossier, so a 412/deploy focus request
  // for it had NO row to expand — and with ProjectEnvVarsPanel removed the
  // user was stuck on an unfixable env blocker. Unowned focus keys render as
  // an "Egna nycklar"-section with the same write-only inputs, saving to the
  // same canonical env-vars API. The user can also add an arbitrary
  // UPPER_SNAKE key manually.
  const [customFocusKeys, setCustomFocusKeys] = useState<string[]>([]);
  const [customKeyDraft, setCustomKeyDraft] = useState("");
  const [customKeyDraftError, setCustomKeyDraftError] = useState<string | null>(null);
  const [customSaving, setCustomSaving] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  // Lucka 1 (ägarbeslut 2026-08-11) removed the generic toast on save. Dossier
  // rows got an inline receipt quoting the new status; custom keys have no
  // per-row status to quote, so this is a plain "it saved" flag (Bugbot on
  // this diff: without it, a custom-key save gave the user no feedback at all).
  const [customSaveConfirmation, setCustomSaveConfirmation] = useState(false);

  // Resolve a pending focus request once fresh data is available: expand the
  // first dossier that owns one of the requested keys. The pending list is
  // only consumed on a MATCH (Bugbot on this diff): the open-event itself
  // triggers a refetch, and the target dossier may only appear in that
  // fresher response — clearing on a stale miss would drop the 412 focus.
  // Keys that no dossier owns AFTER the refetch settles are consumed into
  // the custom-keys section instead (Codex P2 on #573); a request that
  // never resolves is discarded on close.
  useEffect(() => {
    if (!pendingFocusKeys || !freshData) return;
    const wanted = new Set(pendingFocusKeys.map((key) => key.toUpperCase()));
    const ownedKeys = new Set(
      freshData.dossiers.flatMap((dossier) =>
        dossier.envVars.map((env) => env.key.toUpperCase()),
      ),
    );
    const unowned = [...wanted].filter((key) => !ownedKeys.has(key));
    const addUnownedToCustomSection = () => {
      setCustomFocusKeys((current) => {
        const seen = new Set(current.map((key) => key.toUpperCase()));
        const additions = unowned.filter((key) => !seen.has(key));
        return additions.length > 0 ? [...current, ...additions] : current;
      });
    };
    const target = freshData.dossiers.find((dossier) =>
      dossier.envVars.some((env) => wanted.has(env.key.toUpperCase())),
    );
    if (target) {
      // Re-assert the tab on match: the empty-state auto-switch (below) may
      // have flipped to "catalog" while the refetch was in flight.
      setActiveTab("wired");
      setExpandedId(target.id);
      // Mixed request (Bugbot on this diff): a deploy blocker can carry BOTH
      // dossier-owned and custom keys — the dossier expand must not swallow
      // the custom ones. Unowned leftovers route to the custom section once
      // an in-flight refetch settles (their owner may be in the fresher data).
      if (unowned.length === 0) {
        setPendingFocusKeys(null);
      } else if (loading) {
        setPendingFocusKeys(unowned);
      } else {
        addUnownedToCustomSection();
        setPendingFocusKeys(null);
      }
      return;
    }
    // No owner in this response. Wait out an in-flight refetch first — the
    // owning dossier may only appear in the fresher data, and routing its
    // key to the custom section prematurely would hide the real row.
    if (loading) return;
    if (unowned.length > 0) {
      setActiveTab("wired");
      addUnownedToCustomSection();
    }
    setPendingFocusKeys(null);
  }, [pendingFocusKeys, freshData, loading]);

  // Inline env-key saves (write-only): values live only in local state until
  // POSTed to the canonical project env-vars API, then the fields are
  // cleared. The panel never reads secrets back — status flips come from the
  // refetch triggered by `dispatchProjectEnvVarsUpdated`.
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  // Configured keys the user explicitly opted to replace via "Ändra" — the
  // F2 correction path (the full env editor is F3-only), Codex P2 on #525.
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
  const [savingDossierId, setSavingDossierId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ dossierId: string; message: string } | null>(
    null,
  );
  // Lucka 1 (ägarbeslut 2026-08-11): inline-kvitto som ersätter den borttagna
  // "Miljövariabler sparade"-toasten. En POST-framgång vet ännu inte
  // byggblockets NYA status — det avgörs av `freshData` som refetchen (via
  // `dispatchProjectEnvVarsUpdated`) snart levererar. `pendingSaveConfirmationRef`
  // håller vilken dossier som väntar; effekten nedan löser den mot första
  // `freshData` som landar (garanterat post-save — `load()` aborterar allt
  // äldre i flykt).
  const [saveConfirmation, setSaveConfirmation] = useState<{ dossierId: string } | null>(null);
  const pendingSaveConfirmationRef = useRef<string | null>(null);
  // Key currently being deleted ("Ta bort" on a configured key) — the only
  // remaining delete surface after ProjectEnvVarsPanel was removed (P2
  // BB#envdel1): a wrong/secret value must be removable from the product UI.
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const projectId = freshData?.projectId ?? null;

  // Secret-draft hygiene (Bugbot on this diff): typed-but-unsaved key values
  // must never survive a chat switch — the panel stays mounted, and a stale
  // draft could otherwise be saved into the NEXT chat's project. Version
  // switches within the same chat keep drafts (env vars are project-scoped).
  useEffect(() => {
    setKeyValues({});
    setEditingKeys(new Set());
    setSaveError(null);
    setSaveConfirmation(null);
    pendingSaveConfirmationRef.current = null;
    setPendingFocusKeys(null);
    setCustomFocusKeys([]);
    setCustomKeyDraft("");
    setCustomKeyDraftError(null);
    setCustomError(null);
    setCustomSaveConfirmation(false);
  }, [chatId]);

  // Resolve the pending save confirmation once the save-triggered refetch
  // lands. Runs after every `freshData` update, but only acts while a
  // confirmation is actually pending (see `pendingSaveConfirmationRef`).
  useEffect(() => {
    const pendingId = pendingSaveConfirmationRef.current;
    if (!pendingId || !freshData) return;
    pendingSaveConfirmationRef.current = null;
    if (freshData.dossiers.some((dossier) => dossier.id === pendingId)) {
      setSaveConfirmation({ dossierId: pendingId });
    }
  }, [freshData]);

  // Version switch must drop a pending/shown receipt (Bugbot on this diff):
  // the message quotes ONE version's dossier status, so a still-in-flight
  // refetch from the OLD version must not resolve into the new version's
  // view, and an already-shown receipt must not linger under it. Unlike the
  // secret drafts above, this is a completed-save receipt, not user input —
  // safe to drop on every version change, even within the same chat.
  // customSaveConfirmation is the same kind of receipt for "Egna nycklar"
  // (handleSaveCustomKeys dispatches dispatchProjectEnvVarsUpdated with the
  // OLD versionId to restart that version's preview), so it must drop here
  // too (Bugbot follow-up on this diff) — not just on chatId change below.
  // saveError/customError describe the same ONE save attempt just as much as
  // the receipts do (Bugbot, 4th pass on this diff) — previously only reset
  // on a full chat change below, so a plain version switch (same chat) could
  // leave a failed-on-version-A message to resurface if the user re-expands
  // the same dossier row under version B.
  useEffect(() => {
    setSaveConfirmation(null);
    pendingSaveConfirmationRef.current = null;
    setCustomSaveConfirmation(false);
    setSaveError(null);
    setCustomError(null);
  }, [chatId, versionId]);

  const handleSaveKeys = useCallback(
    async (dossier: DossierOverviewEntry) => {
      if (!projectId || savingDossierId) return;
      // Writable = missing keys + configured keys the user explicitly chose
      // to replace ("Ändra" — the F2 correction path, Codex P2 on #525).
      const writableEnvKeys = dossier.envVars
        .filter((env) => !env.hasRealValue || editingKeys.has(env.key))
        .map((env) => env.key);
      const filled = writableEnvKeys.filter((key) => (keyValues[key] ?? "").trim().length > 0);
      if (filled.length === 0) return;
      setSavingDossierId(dossier.id);
      setSaveError(null);
      setSaveConfirmation(null);
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
          // Same late-completion guard as the success receipt below (Bugbot,
          // 4th pass on this diff): a failure for a save the user already
          // switched away from must not surface under a DIFFERENT
          // chat/version's row — that would misattribute the failure.
          if (latestOverviewKeyRef.current === overviewKey) {
            setSaveError({
              dossierId: dossier.id,
              message: data?.error || "Kunde inte spara nycklarna.",
            });
          }
          return;
        }
        setKeyValues((current) => {
          const next = { ...current };
          for (const key of filled) delete next[key];
          return next;
        });
        setEditingKeys((current) => {
          if (current.size === 0) return current;
          const next = new Set(current);
          for (const key of filled) next.delete(key);
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
        // The refetch the event above triggers is what will reveal the
        // dossier's POST-save status (live vs. still demo) — see the
        // resolving effect near `saveConfirmation`. Only arm it if the user
        // is still on the chat/version this save targeted (Bugbot, 3rd pass
        // on this diff): a chat/version switch during the awaited POST above
        // must not let this late completion re-show a receipt under a
        // DIFFERENT identity's view — the reset effect already cleared it
        // once for that new identity, so re-arming here would resurrect it
        // wrongly (same class of bug the reset effect above fixes, just for
        // a save that hadn't finished yet when the switch happened).
        if (latestOverviewKeyRef.current === overviewKey) {
          pendingSaveConfirmationRef.current = dossier.id;
        }
      } catch (error) {
        if (latestOverviewKeyRef.current === overviewKey) {
          setSaveError({
            dossierId: dossier.id,
            message:
              error instanceof Error
                ? `Kunde inte spara nycklarna: ${error.message}`
                : "Kunde inte spara nycklarna.",
          });
        }
      } finally {
        setSavingDossierId(null);
      }
    },
    [chatId, editingKeys, keyValues, overviewKey, projectId, savingDossierId, versionId],
  );

  // Optional write-only keys on a STAGED catalog pick (same POST as wired
  // rows). Never required — confirm without a key runs demo.
  const handleSaveStagedKeys = useCallback(async () => {
    if (!pickedEntry || !projectId || savingDossierId) return;
    const filled = (pickedEntry.envVars ?? [])
      .map((env) => env.key)
      .filter((key) => (keyValues[key] ?? "").trim().length > 0);
    if (filled.length === 0) return;
    setSavingDossierId(pickedEntry.id);
    setSaveError(null);
    setSaveConfirmation(null);
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
        if (latestOverviewKeyRef.current === overviewKey) {
          setSaveError({
            dossierId: pickedEntry.id,
            message: data?.error || "Kunde inte spara nycklarna.",
          });
        }
        return;
      }
      setKeyValues((current) => {
        const next = { ...current };
        for (const key of filled) delete next[key];
        return next;
      });
      dispatchProjectEnvVarsUpdated({
        projectId,
        chatId,
        versionId,
        envKeys: filled,
      });
      if (latestOverviewKeyRef.current === overviewKey) {
        setSaveConfirmation({ dossierId: pickedEntry.id });
      }
    } catch (error) {
      if (latestOverviewKeyRef.current === overviewKey) {
        setSaveError({
          dossierId: pickedEntry.id,
          message:
            error instanceof Error
              ? `Kunde inte spara nycklarna: ${error.message}`
              : "Kunde inte spara nycklarna.",
        });
      }
    } finally {
      setSavingDossierId(null);
    }
  }, [chatId, keyValues, overviewKey, pickedEntry, projectId, savingDossierId, versionId]);

  // Delete a stored key via the canonical DELETE API (same route the removed
  // ProjectEnvVarsPanel used). The `action: "deleted"` event clears local
  // drafts for the key and refetches, so `hasRealValue` flips back honestly.
  const handleDeleteKey = useCallback(
    async (dossier: DossierOverviewEntry, envKey: string) => {
      if (!projectId || savingDossierId || deletingKey) return;
      setDeletingKey(envKey);
      setSaveError(null);
      setSaveConfirmation(null);
      try {
        const response = await fetch(
          `/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: [envKey] }),
          },
        );
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
        } | null;
        if (!response.ok || !data?.success) {
          // Same late-completion guard as handleSaveKeys above (Bugbot, 4th
          // pass on this diff): a delete failure for a chat/version the user
          // already switched away from must not surface under a DIFFERENT
          // one's row.
          if (latestOverviewKeyRef.current === overviewKey) {
            setSaveError({
              dossierId: dossier.id,
              message: data?.error || `Kunde inte ta bort ${envKey}.`,
            });
          }
          return;
        }
        dispatchProjectEnvVarsUpdated({
          projectId,
          chatId,
          versionId,
          envKeys: [envKey],
          action: "deleted",
        });
      } catch (error) {
        if (latestOverviewKeyRef.current === overviewKey) {
          setSaveError({
            dossierId: dossier.id,
            message:
              error instanceof Error
                ? `Kunde inte ta bort ${envKey}: ${error.message}`
                : `Kunde inte ta bort ${envKey}.`,
          });
        }
      } finally {
        setDeletingKey(null);
      }
    },
    [chatId, deletingKey, overviewKey, projectId, savingDossierId, versionId],
  );

  // Save filled custom keys to the same canonical env-vars API the dossier
  // rows use. Write-only like the dossier inputs: values are cleared on
  // success and never read back; readiness surfaces refetch via the event.
  const handleSaveCustomKeys = useCallback(async () => {
    if (!projectId || customSaving || savingDossierId) return;
    const filled = customFocusKeys.filter(
      (key) => (keyValues[key] ?? "").trim().length > 0,
    );
    if (filled.length === 0) return;
    setCustomSaving(true);
    setCustomError(null);
    setCustomSaveConfirmation(false);
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
        // Same late-completion guard as handleSaveKeys above (Bugbot, 4th
        // pass on this diff): a failure for a chat/version the user already
        // switched away from must not surface under a different one.
        if (latestOverviewKeyRef.current === overviewKey) {
          setCustomError(data?.error || "Kunde inte spara nycklarna.");
        }
        return;
      }
      setKeyValues((current) => {
        const next = { ...current };
        for (const key of filled) delete next[key];
        return next;
      });
      setCustomFocusKeys((current) => current.filter((key) => !filled.includes(key)));
      // Same late-completion guard as handleSaveKeys above (Bugbot, 3rd pass
      // on this diff): don't resurrect a receipt for a chat/version the user
      // has already switched away from.
      if (latestOverviewKeyRef.current === overviewKey) {
        setCustomSaveConfirmation(true);
      }
      dispatchProjectEnvVarsUpdated({
        projectId,
        chatId,
        versionId,
        envKeys: filled,
      });
    } catch (error) {
      if (latestOverviewKeyRef.current === overviewKey) {
        setCustomError(
          error instanceof Error
            ? `Kunde inte spara nycklarna: ${error.message}`
            : "Kunde inte spara nycklarna.",
        );
      }
    } finally {
      setCustomSaving(false);
    }
  }, [
    chatId,
    customFocusKeys,
    customSaving,
    keyValues,
    overviewKey,
    projectId,
    savingDossierId,
    versionId,
  ]);

  // Manual add of an arbitrary UPPER_SNAKE key (the removed
  // ProjectEnvVarsPanel was the only surface that could do this). Client-side
  // format guard mirrors the POST route's key validation for immediate UX.
  const handleAddCustomKey = useCallback(() => {
    const key = customKeyDraft.trim().toUpperCase();
    if (!key) return;
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      setCustomKeyDraftError(
        "Ogiltigt nyckelnamn — använd VERSALER, siffror och understreck (t.ex. MY_API_KEY).",
      );
      return;
    }
    setCustomKeyDraftError(null);
    setCustomKeyDraft("");
    setCustomFocusKeys((current) =>
      current.some((existing) => existing.toUpperCase() === key)
        ? current
        : [...current, key],
    );
  }, [customKeyDraft]);

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
    // A pending/handled focus request targets the "Inkopplade"-tab (dossier
    // row OR custom-keys section) — the empty-state default must not win
    // over it in the same commit (both effects fire on the same freshData).
    if (
      freshData.counts.total === 0 &&
      !pendingFocusKeys &&
      customFocusKeys.length === 0
    ) {
      setActiveTab("catalog");
    }
  }, [freshData, pendingFocusKeys, customFocusKeys]);

  const handleSelectCatalogDossier = useCallback(
    (entry: DossierCatalogEntry) => {
      if (!onRequestDossier || catalogPickDisabled) return;
      // Synchronous double-click lock — `pickedEntry`-state hinner inte
      // re-rendera mellan två klick i samma tick. Staging only: the
      // generation request waits for «Lägg till i sajten».
      if (pickInFlightRef.current) return;
      pickInFlightRef.current = true;
      setStagingConfirmed(false);
      setPickedEntry(entry);
    },
    [onRequestDossier, catalogPickDisabled],
  );

  const handleCancelStagedDossier = useCallback(() => {
    if (confirmInFlightRef.current || stagingConfirmed) return;
    const stagedKeys = (pickedEntry?.envVars ?? []).map((env) => env.key);
    resetCatalogStaging();
    if (stagedKeys.length > 0) {
      setKeyValues((current) => {
        const next = { ...current };
        let changed = false;
        for (const key of stagedKeys) {
          if (key in next) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
  }, [pickedEntry, resetCatalogStaging, stagingConfirmed]);

  const handleConfirmStagedDossier = useCallback(
    async (stagingLines?: string[]) => {
      if (!pickedEntry || !onRequestDossier || catalogPickDisabled) return;
      if (confirmInFlightRef.current || stagingConfirmed) return;
      confirmInFlightRef.current = true;
      setStagingConfirming(true);
      const startedOnKey = overviewKey;
      const startedId = pickedEntry.id;
      const lines = (stagingLines ?? []).map((line) => line.trim()).filter(Boolean);
      const finishAbandoned = () => {
        confirmInFlightRef.current = false;
        setStagingConfirming(false);
      };
      const stillThisStaging = () =>
        latestOverviewKeyRef.current === startedOnKey &&
        pickedEntryRef.current?.id === startedId;
      try {
        const accepted = await onRequestDossier({
          id: pickedEntry.id,
          label: pickedEntry.label,
          ...(lines.length > 0 ? { stagingLines: lines } : {}),
        });
        if (!stillThisStaging()) return;
        // `void` (tester / äldre anrop) räknas som accepterat. Bara explicit
        // `false` betyder att sändningen avvisades — då stannar vi på
        // «Valt, ej tillagt» så Avbryt/bekräfta går att göra om.
        if (accepted === false) {
          finishAbandoned();
          return;
        }
      } catch {
        if (!stillThisStaging()) return;
        finishAbandoned();
        return;
      }
      // F2 + hårt byggblock: håll popovern öppen med yta-notisen (nu i
      // staging-vyn). Övriga val stänger — meddelandet syns i chatten.
      if (!(stage !== "integrations" && pickedEntry.class === "hard")) {
        handleOpenChange(false);
      } else {
        setStagingConfirming(false);
        setStagingConfirmed(true);
      }
    },
    [
      catalogPickDisabled,
      handleOpenChange,
      onRequestDossier,
      overviewKey,
      pickedEntry,
      stage,
      stagingConfirmed,
    ],
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

  return {
    chatId,
    versionId,
    lifecycleStage,
    onRequestDossier,
    catalogPickDisabled,
    open,
    setOpen,
    activeTab,
    setActiveTab,
    loading,
    error,
    expandedId,
    setExpandedId,
    freshData,
    stage,
    count,
    customFocusKeys,
    customKeyDraft,
    setCustomKeyDraft,
    customKeyDraftError,
    customSaving,
    customError,
    customSaveConfirmation,
    keyValues,
    setKeyValues,
    editingKeys,
    setEditingKeys,
    savingDossierId,
    saveError,
    saveConfirmation,
    deletingKey,
    projectId,
    handleSaveKeys,
    handleDeleteKey,
    handleSaveCustomKeys,
    handleAddCustomKey,
    catalogData,
    catalogLoading,
    catalogError,
    loadCatalog,
    pickedEntry,
    stagingConfirmed,
    stagingConfirming,
    handleOpenChange,
    handleSelectCatalogDossier,
    handleCancelStagedDossier,
    handleConfirmStagedDossier,
    handleSaveStagedKeys,
    needsAttention,
    groupedDossiers,
    catalogClassFilter,
    setCatalogClassFilter,
    catalogCounts,
    filteredCatalogGroups,
  };
}
