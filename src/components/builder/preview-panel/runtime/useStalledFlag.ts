"use client";

import { useEffect, useState } from "react";

/**
 * "Startar" longer than this offers a restart (R-1742 P3, 2026-11-11). A boot
 * can otherwise hang for up to ten minutes with no way out for the user.
 *
 * A normal cold start with its own address per chat measured 115–125 s in
 * production (2026-11-20, SM-163). At 120 s the button showed up in the middle
 * of a start that was about to succeed, so it now waits past that range.
 */
export const PREVIEW_STARTING_RESTART_HINT_MS = 180_000;

/**
 * True once `active` has stayed true for `thresholdMs` under the same
 * `resetKey`. Turning inactive or changing the key starts over.
 */
export function useStalledFlag(active: boolean, resetKey: string, thresholdMs: number): boolean {
  const [stalledKey, setStalledKey] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setStalledKey(resetKey), thresholdMs);
    return () => {
      window.clearTimeout(id);
      setStalledKey(null);
    };
  }, [active, resetKey, thresholdMs]);
  return active && stalledKey === resetKey;
}
