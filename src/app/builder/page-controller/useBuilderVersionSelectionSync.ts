"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";

/**
 * Grace window for a version this client just created (generation `done`,
 * deterministic F3 settle or the Fast Edit Lane) before the `/versions`
 * refetch has caught up. SWR revalidates within ~1 s; 15 s covers a slow
 * `/versions` without letting a genuinely deleted version stay selected.
 */
export const FRESH_VERSION_GRACE_MS = 15_000;

export type PendingCreatedVersion = { id: string; ts: number };
export type PendingCreatedVersionRef = MutableRefObject<PendingCreatedVersion | null>;

/**
 * Record that `versionId` was just created by THIS client so the fresh-version
 * guard tolerates it until the `/versions` list contains it. Every path that
 * selects a version it created itself must call this BEFORE
 * `setSelectedVersionId` — otherwise the guard clears the selection on the
 * very next render, `activeVersionId` falls back to the stale latest
 * (v3 → v2 → v3 for ~1 s), and everything keyed on it (readiness polling,
 * preview version-sync, files context) sees a version the user never chose.
 */
export function markPendingCreatedVersion(
  ref: PendingCreatedVersionRef | null | undefined,
  versionId: string | null | undefined,
  now: number = Date.now(),
): void {
  if (!ref) return;
  const id = typeof versionId === "string" ? versionId.trim() : "";
  if (!id) return;
  ref.current = { id, ts: now };
}

/** True while `versionId` is a freshly created id still inside its grace window. */
export function isPendingCreatedVersionFresh(
  pending: PendingCreatedVersion | null | undefined,
  versionId: string,
  now: number = Date.now(),
): boolean {
  return Boolean(pending && pending.id === versionId && now - pending.ts < FRESH_VERSION_GRACE_MS);
}

type Params = {
  chatId: string | null;
  chatIdParam: string | null;
  chatExternalProjectId: string | null;
  entryIntentActive: boolean;
  externalProjectId: string | null;
  hasEntryParams: boolean;
  isIntentionalReset: boolean;
  selectedVersionId: string | null;
  versionIdSet: Set<string>;
  /**
   * Owned by the page controller (it must exist before `useBuilderDeployActions`
   * runs, which is earlier in the hook order). Written via
   * {@link markPendingCreatedVersion}; cleared here once the id is canonical.
   */
  pendingCreatedVersionRef: PendingCreatedVersionRef;
  router: { replace: (url: string) => void };
  setChatId: Dispatch<SetStateAction<string | null>>;
  setExternalProjectId: Dispatch<SetStateAction<string | null>>;
  setIsIntentionalReset: Dispatch<SetStateAction<boolean>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
};

/**
 * Keeps chat identity and version selection consistent: linked project id,
 * selection reset on chat change, the fresh-version guard and the chatId ↔ URL
 * sync (including the `lastChatId` restore hint).
 */
export function useBuilderVersionSelectionSync({
  chatId,
  chatIdParam,
  chatExternalProjectId,
  entryIntentActive,
  externalProjectId,
  hasEntryParams,
  isIntentionalReset,
  selectedVersionId,
  versionIdSet,
  pendingCreatedVersionRef,
  router,
  setChatId,
  setExternalProjectId,
  setIsIntentionalReset,
  setSelectedVersionId,
}: Params) {
  // External project id sync
  useEffect(() => {
    if (!chatId) {
      setExternalProjectId(null);
      return;
    }
    if (
      chatExternalProjectId &&
      chatExternalProjectId !== externalProjectId
    ) {
      setExternalProjectId(chatExternalProjectId);
    }
  }, [chatId, chatExternalProjectId, externalProjectId, setExternalProjectId]);

  // Mirror for effects that must read the current selection without
  // re-running on every selection change (the chat-change reset below).
  // Declared before its readers so it commits first in the same effect pass.
  const selectedVersionIdRef = useRef<string | null>(selectedVersionId);
  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  // Reset selected version on chat change. A brand-new chat sets `chatId` and
  // selects its first version in the same tick (stream `done` → `setChatId` +
  // `handleGenerationComplete`); that selection is grace-marked and must
  // survive — only a selection carried over from ANOTHER chat is stale.
  useEffect(() => {
    const current = selectedVersionIdRef.current;
    if (
      !current ||
      !isPendingCreatedVersionFresh(pendingCreatedVersionRef.current, current)
    ) {
      setSelectedVersionId(null);
    }
    setExternalProjectId(null);
  }, [chatId, pendingCreatedVersionRef, setSelectedVersionId, setExternalProjectId]);

  // Fresh-version guard. A selection pointing at an id the `/versions` list
  // does not know is normally stale (deleted/foreign version) and is cleared.
  // The exception is a version THIS client just created: generation `done`
  // (`handleGenerationComplete`), deterministic F3 settle and the Fast Edit
  // Lane (M#sel1) all select the new id BEFORE the `mutateVersions()` refetch
  // has landed. Without the grace window the guard cleared that selection on
  // the next render and `activeVersionId` fell back to the stale latest —
  // the v3 → v2 → v3 flicker seen in prod 2026-09-08 (chat 4a2aa301).
  //
  // The window is re-evaluated when it expires, not only when deps change:
  // SWR hands back the same list reference while nothing changed, so without
  // the timer a version that never reached `/versions` (persist failed) would
  // stay selected indefinitely.
  useEffect(() => {
    if (!selectedVersionId) return;
    if (!versionIdSet.has(selectedVersionId)) {
      const pending = pendingCreatedVersionRef.current;
      if (isPendingCreatedVersionFresh(pending, selectedVersionId)) {
        // Freshly created version — versions refetch in flight; don't bounce.
        // Re-check at expiry in case the list never catches up.
        const remainingMs = Math.max(0, pending!.ts + FRESH_VERSION_GRACE_MS - Date.now()) + 1;
        const timer = setTimeout(() => {
          if (
            selectedVersionIdRef.current === selectedVersionId &&
            !versionIdSet.has(selectedVersionId) &&
            !isPendingCreatedVersionFresh(pendingCreatedVersionRef.current, selectedVersionId)
          ) {
            setSelectedVersionId(null);
          }
        }, remainingMs);
        return () => clearTimeout(timer);
      }
      setSelectedVersionId(null);
    } else if (pendingCreatedVersionRef.current?.id === selectedVersionId) {
      // The refetch landed; the id is now canonical.
      pendingCreatedVersionRef.current = null;
    }
    return undefined;
  }, [selectedVersionId, versionIdSet, pendingCreatedVersionRef, setSelectedVersionId]);

  // ChatId URL sync
  useEffect(() => {
    if (isIntentionalReset) {
      if (!chatIdParam) setIsIntentionalReset(false);
      return;
    }
    if (chatIdParam && chatIdParam !== chatId) {
      setChatId(chatIdParam);
    }
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams, entryIntentActive, setIsIntentionalReset, setChatId]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", chatId);
    } catch {
      /* ignore */
    }
  }, [chatId]);
}
