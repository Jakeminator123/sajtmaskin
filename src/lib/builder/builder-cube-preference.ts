"use client";

/**
 * Användarens val att visa chattpanelen som byggkub. Sparas per webbläsare,
 * inte per chatt: det är ett arbetssätt, inte en egenskap hos sajten.
 *
 * `useSyncExternalStore` ger servern och första klientrenderingen `false`
 * (ingen hydreringsglapp) och låter två flikar följa varandra via
 * `storage`-händelsen. Går lagringen inte att skriva gäller valet i minnet
 * för den här sidvisningen.
 */

import { useSyncExternalStore } from "react";

export const BUILDER_CUBE_ENABLED_STORAGE_KEY = "sajtmaskin:builder-cube:enabled";

const listeners = new Set<() => void>();
/** Valet när lagringen inte går att nå; `null` = fråga lagringen. */
let memoryValue: boolean | null = null;

function readStored(): boolean {
  if (memoryValue !== null) return memoryValue;
  try {
    return window.localStorage.getItem(BUILDER_CUBE_ENABLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setBuilderCubeEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(BUILDER_CUBE_ENABLED_STORAGE_KEY, "1");
    else window.localStorage.removeItem(BUILDER_CUBE_ENABLED_STORAGE_KEY);
    memoryValue = null;
  } catch {
    memoryValue = enabled;
  }
  for (const listener of listeners) listener();
}

export function useBuilderCubeEnabled(): boolean {
  return useSyncExternalStore(subscribe, readStored, () => false);
}

/** Minnesvärdet överlever mellan tester — nollställ per test. */
export function resetBuilderCubePreferenceForTests(): void {
  memoryValue = null;
  try {
    window.localStorage.removeItem(BUILDER_CUBE_ENABLED_STORAGE_KEY);
  } catch {
    // ingen lagring i den här miljön
  }
  for (const listener of listeners) listener();
}
