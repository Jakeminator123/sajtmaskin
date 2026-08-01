"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

/**
 * Grace window for a version created by the Fast Edit Lane before the
 * `/versions` refetch has caught up.
 */
const FRESH_VERSION_GRACE_MS = 15_000;

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

  // Reset selected version on chat change
  useEffect(() => {
    setSelectedVersionId(null);
    setExternalProjectId(null);
  }, [chatId, setSelectedVersionId, setExternalProjectId]);

  // M#sel1: fast-edit (quick edit) persists a NEW minor version and selects it
  // BEFORE the `mutateVersions()` refetch has landed — so the freshly created
  // id is not yet in `versionIdSet` and the guard below used to clear the
  // selection back to the old version. Track the freshly created id and give
  // it a grace window until the refetch catches up.
  const pendingCreatedVersionRef = useRef<{ id: string; ts: number } | null>(null);

  useEffect(() => {
    if (!selectedVersionId) return;
    if (!versionIdSet.has(selectedVersionId)) {
      const pending = pendingCreatedVersionRef.current;
      if (
        pending &&
        pending.id === selectedVersionId &&
        Date.now() - pending.ts < FRESH_VERSION_GRACE_MS
      ) {
        // Freshly created version — versions refetch in flight; don't bounce.
        return;
      }
      setSelectedVersionId(null);
    } else if (pendingCreatedVersionRef.current?.id === selectedVersionId) {
      // The refetch landed; the id is now canonical.
      pendingCreatedVersionRef.current = null;
    }
  }, [selectedVersionId, versionIdSet, setSelectedVersionId]);

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

  return { pendingCreatedVersionRef };
}
