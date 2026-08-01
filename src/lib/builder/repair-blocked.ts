"use client";

import { useSyncExternalStore } from "react";

/**
 * Kanonisk "får en reparation startas nu?"-signal för buildern.
 *
 * Alla Reparera-ytor (t.ex. "Försök reparera preview" i
 * `PreviewPanelEmptyState`) startar en NY debiterad körning via
 * `handleFixPreview`. Klickas de medan appen redan kör något som avancerar
 * versionen blir följden dubbeldebitering och versionsrace.
 *
 * Två saker kan pågå, och de syns på helt olika ställen:
 *
 * 1. **Generering/stream** — buildern vet redan (`isBusy`: isCreatingChat ||
 *    isAnyStreaming || isTemplateLoading || isPreparingPrompt) och trär ner
 *    flaggan som prop.
 * 2. **Deterministisk `/finalize-design` (F3)** — kör HELT utan chat-stream.
 *    `isBusy` är falsk hela vägen, och den enda komponent som vet något är
 *    `PreviewPanelF3Trigger` via sitt lokala `isLoading`. Den lokala staten
 *    når aldrig Reparera-ytorna.
 *
 * Punkt 2 är varför signalen bor här i stället för i en prop-kedja: en liten
 * modul-global räknare som `runF3FinalizeAction` (den enda klientägaren av
 * `/finalize-design`) höjer och sänker, och som vilken Reparera-yta som helst
 * kan läsa med `useRepairBlocked`. Räknaren är en räknare, inte en boolean, så
 * två överlappande finalize-körningar inte kan släcka varandras grind.
 */

let activeFinalizeRuns = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Markera att en `/finalize-design`-körning startat. Returnerar en
 * idempotent release-funktion — anropa den i `finally` så grinden alltid
 * öppnas igen, även när körningen kastar.
 */
export function beginF3Finalize(): () => void {
  activeFinalizeRuns += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeFinalizeRuns = Math.max(0, activeFinalizeRuns - 1);
    emit();
  };
}

export function isF3FinalizeActive(): boolean {
  return activeFinalizeRuns > 0;
}

/** Testhjälp: nollställ räknaren mellan tester. */
export function resetF3FinalizeActivity(): void {
  activeFinalizeRuns = 0;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** SSR/pre-hydration: ingen finalize kan pågå innan klienten kört något. */
function getServerSnapshot(): boolean {
  return false;
}

export function useF3FinalizeActive(): boolean {
  return useSyncExternalStore(subscribe, isF3FinalizeActive, getServerSnapshot);
}

/**
 * Sant när ingen Reparera-action får startas. `isGenerating` är buildern egen
 * busy-flagga; finalize-delen läses från modulen ovan.
 */
export function useRepairBlocked(isGenerating: boolean): boolean {
  const finalizeActive = useF3FinalizeActive();
  return isGenerating || finalizeActive;
}
