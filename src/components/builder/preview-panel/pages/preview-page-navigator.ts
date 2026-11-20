"use client";

/**
 * Förhandsvisningens sidnavigering, för ytor utanför panelen (byggkubens
 * sajtkarta).
 *
 * `PreviewPanel` äger två saker som bara den vet: vilken sida iframen faktiskt
 * visar (`usePreviewRouteBridge` följer navigering inne i sajten, även när den
 * styrda adressen står kvar), och hur ett sidbyte görs (en ny adress, eller en
 * omladdning när den styrda adressen redan pekar dit men iframen har gått
 * vidare). Panelen publicerar båda här, så en annan yta byter sida exakt som
 * panelens sidflikar gör och inte gissar utifrån adressen.
 *
 * En panel åt gången, som builder-bryggan: den senast publicerade gäller, och
 * en avpublicering rör bara den egna.
 */

import { useSyncExternalStore } from "react";

export interface PreviewPageNavigator {
  /** Sidan förhandsvisningen visar nu, eller `null` utan förhandsvisning. */
  activeRoute: string | null;
  /** Visa sidan, som ett klick på panelens sidflik. */
  navigate: (route: string) => void;
}

let current: PreviewPageNavigator | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Publicerar panelens navigering. Returnerar avpubliceringen för effektens cleanup. */
export function publishPreviewPageNavigator(navigator: PreviewPageNavigator): () => void {
  current = navigator;
  emit();
  return () => {
    if (current !== navigator) return;
    current = null;
    emit();
  };
}

/** Den publicerade navigeringen just nu, utanför React (tester, händelser). */
export function getPreviewPageNavigator(): PreviewPageNavigator | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreviewPageNavigator(): PreviewPageNavigator | null {
  return useSyncExternalStore(subscribe, getPreviewPageNavigator, () => null);
}
