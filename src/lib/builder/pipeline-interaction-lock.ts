"use client";

import { useSyncExternalStore } from "react";
import type { VersionDisplayStatus } from "@/lib/builder/version-status-display";

/**
 * Display tokens that mean "a generation / verify / repair is still in
 * flight for this version". Composer send and version-switching should wait.
 *
 * Intentionally excludes `retrying` (also used for terminal `superseded`)
 * and every finished token (`ready` / `promoted` / `failed` / `degraded` /
 * `blocked` / `idle`) so a stranded `pending` import or a failed F3 head
 * does not lock the user in forever.
 */
export const PIPELINE_LOCK_DISPLAY_STATUSES: ReadonlySet<VersionDisplayStatus> =
  new Set([
    "generating",
    "autofixing",
    "validating",
    "preflighting",
    "verifying",
    "repairing",
  ]);

export function isPipelineInteractionLocked(
  status: VersionDisplayStatus | null | undefined,
): boolean {
  return Boolean(status && PIPELINE_LOCK_DISPLAY_STATUSES.has(status));
}

let pipelineWorkRuns = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Mark that client-side post-check / F2 quality-gate work has started.
 * Call the returned release in `finally`.
 */
export function beginPipelineWork(): () => void {
  pipelineWorkRuns += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pipelineWorkRuns = Math.max(0, pipelineWorkRuns - 1);
    emit();
  };
}

export function isPipelineWorkActive(): boolean {
  return pipelineWorkRuns > 0;
}

/** Testhjälp: nollställ räknaren mellan tester. */
export function resetPipelineWorkActivity(): void {
  pipelineWorkRuns = 0;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePipelineWorkActive(): boolean {
  return useSyncExternalStore(subscribe, isPipelineWorkActive, getServerSnapshot);
}
