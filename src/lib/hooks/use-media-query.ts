import { useCallback, useSyncExternalStore } from "react";

/** Tailwinds `lg`: builderns tvåkolumnslayout och versionspanel. */
export const LG_UP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * Prenumererar på en media query. Servern och första klientrenderingen får
 * `serverValue` (ingen hydreringsglapp); därefter följer värdet fönstret.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return serverValue;
    }
    return window.matchMedia(query).matches;
  }, [query, serverValue]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}
