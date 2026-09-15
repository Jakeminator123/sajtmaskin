type ObserverEntry = { isIntersecting: boolean };
type ObserverCallback = (entries: ObserverEntry[]) => void;

export interface FakeIntersectionObserver {
  /** Rapportera ett nytt synlighetsläge till alla observerade noder. */
  report: (intersecting: boolean) => void;
  restore: () => void;
}

/**
 * `vitest.setup.ts` installerar en NoopObserver som aldrig fyrar.
 * `PreviewBackdrop` väntar medvetet in observerns första utsaga innan den
 * startar en videonedladdning, så ett test som vill se uppspelning måste ha en
 * observer som faktiskt svarar.
 *
 * `initial` utelämnat betyder «observern har ännu inte hunnit svara» — precis
 * som en riktig IntersectionObserver, som rapporterar asynkront efter paint.
 * Det är det läget som gör skillnad på att vänta in observern och att gissa att
 * panelen syns. Ett `boolean` rapporteras synkront vid `observe()`, vilket
 * håller uppspelningstesterna fria från timingdans.
 */
export function installIntersectionObserver(
  options: { initial?: boolean } = {},
): FakeIntersectionObserver {
  const callbacks = new Set<ObserverCallback>();
  const original = globalThis.IntersectionObserver;

  class Observer {
    constructor(private readonly callback: ObserverCallback) {
      callbacks.add(callback);
    }
    observe(): void {
      if (typeof options.initial !== "boolean") return;
      this.callback([{ isIntersecting: options.initial }]);
    }
    unobserve(): void {}
    disconnect(): void {
      callbacks.delete(this.callback);
    }
    takeRecords(): ObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;

  return {
    report: (next) => {
      for (const callback of callbacks) callback([{ isIntersecting: next }]);
    },
    restore: () => {
      globalThis.IntersectionObserver = original;
    },
  };
}
