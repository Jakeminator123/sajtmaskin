"use client";

import { useCallback, useEffect, useState } from "react";
import { isComposerMode, type ComposerMode } from "./composer-route";
import { revokeOpenClawBuildConsent } from "@/lib/openclaw/openclaw-store";

/**
 * Läget gäller per chatt (UX-05, 2026-11-11). Förut sparades det globalt, så
 * ett Bygg-val följde med till nästa projekt och gjorde en fråga där till ett
 * betalande bygge. En ny chatt, eller ingen chatt alls, börjar alltid i Auto.
 */
const COMPOSER_MODE_STORAGE_PREFIX = "sajtmaskin:composerMode:";
/** Den globala nyckeln före 2026-11-11. Rensas så ett gammalt Bygg inte lever kvar. */
const LEGACY_COMPOSER_MODE_STORAGE_KEY = "sajtmaskin:composerMode";

function readStoredComposerMode(chatId: string | null): ComposerMode {
  if (!chatId || typeof window === "undefined") return "auto";
  try {
    sessionStorage.removeItem(LEGACY_COMPOSER_MODE_STORAGE_KEY);
    const stored = sessionStorage.getItem(`${COMPOSER_MODE_STORAGE_PREFIX}${chatId}`);
    return isComposerMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function storeComposerMode(chatId: string | null, mode: ComposerMode): void {
  if (!chatId || typeof window === "undefined") return;
  try {
    const key = `${COMPOSER_MODE_STORAGE_PREFIX}${chatId}`;
    if (mode === "auto") sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, mode);
  } catch {
    // ignore storage errors
  }
}

export function useComposerMode(chatId: string | null) {
  // Läget bär sin chatt: under renderingen där chatId just bytts är läget
  // redan Auto, innan effekten hunnit läsa den nya chattens sparade val.
  const [modeState, setModeState] = useState<{ chatId: string | null; mode: ComposerMode }>(
    () => ({ chatId, mode: "auto" }),
  );
  useEffect(() => {
    // Restore the session preference after hydration and whenever the chat changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState({ chatId, mode: readStoredComposerMode(chatId) });
  }, [chatId]);
  const composerMode: ComposerMode = modeState.chatId === chatId ? modeState.mode : "auto";
  const handleComposerModeChange = useCallback(
    (mode: ComposerMode) => {
      setModeState({ chatId, mode });
      storeComposerMode(chatId, mode);
      // «Fråga – ändrar inget» gäller från valet, inte först vid nästa
      // utskick: ett pågående agentuppdrag ska inte ta ett steg till.
      if (mode === "agent") revokeOpenClawBuildConsent();
    },
    [chatId],
  );
  return { composerMode, handleComposerModeChange };
}
