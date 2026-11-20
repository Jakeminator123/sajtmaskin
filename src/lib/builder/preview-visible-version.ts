"use client";

import { useSyncExternalStore } from "react";

/**
 * Does the builder's preview show a given version right now?
 *
 * Written only by `PreviewPanel` from the same signal as its version
 * indicator ("Visar version N"): the iframe's version-bound ready receipt or
 * the site's own route report for that session and version. Read by surfaces
 * outside the panel that must not claim more than the preview shows (for
 * example the chat's "Hur blev resultatet?").
 *
 * `starting` means "not showing this version yet" (starting, failed or
 * showing another version). The entry is cleared when the chat changes or
 * the panel unmounts; readers also match chat and version, so a stale entry
 * from another chat or project never reads as showing.
 */
export type PreviewVisibleVersion = {
  chatId: string;
  versionId: string;
  state: "starting" | "showing";
};

let current: PreviewVisibleVersion | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPreviewVisibleVersion(): PreviewVisibleVersion | null {
  return current;
}

export function setPreviewVisibleVersion(next: PreviewVisibleVersion): void {
  if (
    current?.chatId === next.chatId &&
    current.versionId === next.versionId &&
    current.state === next.state
  ) {
    return;
  }
  current = { ...next };
  emit();
}

/** Clears the entry; with `chatId`, only when the entry belongs to that chat. */
export function clearPreviewVisibleVersion(chatId?: string | null): void {
  if (!current) return;
  if (chatId !== undefined && current.chatId !== chatId) return;
  current = null;
  emit();
}

/** Current entry (any chat). Prefer {@link usePreviewShowsVersion}. */
export function usePreviewVisibleVersion(): PreviewVisibleVersion | null {
  return useSyncExternalStore(subscribe, getPreviewVisibleVersion, () => null);
}

/** True only while the preview shows exactly this chat's version. */
export function usePreviewShowsVersion(
  chatId: string | null | undefined,
  versionId: string | null | undefined,
): boolean {
  const entry = usePreviewVisibleVersion();
  return Boolean(
    chatId &&
      versionId &&
      entry?.state === "showing" &&
      entry.chatId === chatId &&
      entry.versionId === versionId,
  );
}

/** @internal */
export function resetPreviewVisibleVersionForTests(): void {
  current = null;
  listeners.clear();
}
