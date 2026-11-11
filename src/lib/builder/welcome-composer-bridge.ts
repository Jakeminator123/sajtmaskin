/**
 * Bridge between the chat composer and the welcome panel ("Sidans utseende")
 * before the first build.
 *
 * The welcome panel needs two things it cannot reach through props without
 * threading them through `PreviewPanel` and the shell: the user's current
 * description (for the local palette suggestion) and a way to start the first
 * build from the panel. The composer publishes both; the panel only reads.
 *
 * Fail-safe by design: when nothing is published (no composer mounted, a chat
 * already exists, sending is not possible right now) the snapshot is empty,
 * the panel shows the neutral suggestion and "write in the chat" — never a
 * start button that does nothing.
 *
 * A module singleton is enough: the builder is a singleton page, the same
 * reasoning as the Byggval store in `init-build-choices.ts`.
 */

import { useSyncExternalStore } from "react";

export interface WelcomeComposerSnapshot {
  /** The composer's current text. Empty when a chat already exists. */
  draft: string;
  /**
   * Starts the first build exactly like the composer's send action, routed as
   * a build. `null` while sending is not possible (empty, uploading, busy).
   */
  start: (() => void) | null;
}

const EMPTY_SNAPSHOT: WelcomeComposerSnapshot = Object.freeze({ draft: "", start: null });

let snapshot: WelcomeComposerSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

/**
 * Called by the composer (owner: chat) whenever its text or ability to send
 * changes. Pass `null` on unmount or once a chat exists.
 */
export function publishWelcomeComposer(next: WelcomeComposerSnapshot | null): void {
  const draft = next?.draft ?? "";
  const start = next?.start ?? null;
  if (draft === snapshot.draft && start === snapshot.start) return;
  snapshot = draft || start ? { draft, start } : EMPTY_SNAPSHOT;
  for (const listener of listeners) listener();
}

export function getWelcomeComposerSnapshot(): WelcomeComposerSnapshot {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): WelcomeComposerSnapshot {
  return EMPTY_SNAPSHOT;
}

/** Read side for the welcome panel. Re-renders when the composer publishes. */
export function useWelcomeComposer(): WelcomeComposerSnapshot {
  return useSyncExternalStore(subscribe, getWelcomeComposerSnapshot, getServerSnapshot);
}

// ─────────────────────────────────────────────────────────────────────────
// Första bygget från välkomstläget
//
// När ett chatt-id dyker upp efter en tom start måste
// `useBuilderGenerationPreferences` veta om chatten SKAPADES här (behåll
// "Sidans utseende", det är valet bygget skickades med) eller HYDRERADES för
// ett befintligt projekt via `?project=` (Auto, annars låses välkomstvalet på
// en gammal sajts uppföljningar). Välkomstytan är det enda stället som ser ett
// bygge starta innan någon chatt finns, så den sätter markeringen och hooken
// förbrukar den. Hydrering laddar aldrig utan chatt, så den sätter ingen.
// ─────────────────────────────────────────────────────────────────────────

let firstBuildStartedFromWelcome = false;

/** Welcome surface: a build is running and no chat exists yet. */
export function noteFirstBuildFromWelcome(): void {
  firstBuildStartedFromWelcome = true;
}

/** Welcome surface: the welcome state shows again, so nothing is being created. */
export function clearFirstBuildFromWelcome(): void {
  firstBuildStartedFromWelcome = false;
}

/** Preferences hook: read once when the first chat id appears. */
export function consumeFirstBuildFromWelcome(): boolean {
  const started = firstBuildStartedFromWelcome;
  firstBuildStartedFromWelcome = false;
  return started;
}
