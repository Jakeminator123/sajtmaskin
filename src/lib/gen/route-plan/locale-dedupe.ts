import { debugLog } from "@/lib/utils/debug";
import { normalizeRoutePath } from "./path-utils";

/**
 * Locale-alternate route pairs that mean the same destination in different
 * languages. When the generator (LLM) emits both variants we keep only the
 * one that matches the project's resolved locale so navigation, sitemaps,
 * and internal linking stay coherent. Sv-default for sajtmaskin's typical
 * Swedish builds.
 */
const LOCALE_ROUTE_PAIRS: Array<{ en: string; sv: string }> = [
  { en: "/contact", sv: "/kontakt" },
  { en: "/about", sv: "/om" },
  { en: "/services", sv: "/tjanster" },
  { en: "/blog", sv: "/blogg" },
];

/**
 * In-place dedupe of locale-alternate routes (e.g. `/blog` vs `/blogg`)
 * before the route plan is sent to the LLM.
 */
export function dedupePlannedRoutesInPlaceByLocale<T extends { path: string; required: boolean }>(
  routes: T[],
  locale: string,
): { droppedPaths: string[] } {
  const lc = (locale ?? "sv").toLowerCase();
  const isSwedish = lc.startsWith("sv");
  const keepKey: "sv" | "en" = isSwedish ? "sv" : "en";
  const dropKey: "sv" | "en" = isSwedish ? "en" : "sv";
  const dropped: string[] = [];

  for (const pair of LOCALE_ROUTE_PAIRS) {
    const keepIndex = routes.findIndex(
      (route) => normalizeRoutePath(route.path) === pair[keepKey],
    );
    const dropIndex = routes.findIndex(
      (route) => normalizeRoutePath(route.path) === pair[dropKey],
    );
    if (keepIndex < 0 || dropIndex < 0) continue;

    const dropRoute = routes[dropIndex]!;
    const keepRoute = routes[keepIndex]!;
    if (dropRoute.required) keepRoute.required = true;
    routes.splice(dropIndex, 1);
    dropped.push(pair[dropKey]);
  }

  if (dropped.length > 0) {
    debugLog("GEN", "[route-plan] dropped duplicate locale-alternate routes", {
      locale: lc,
      kept: keepKey,
      dropped,
    });
  }

  return { droppedPaths: dropped };
}

/**
 * Path-list flavour of locale-alternate dedupe. Returns a fresh array with
 * collapsed duplicates and preserves the input order.
 */
export function deduplicateLocaleAlternateRoutes(
  routes: string[],
  locale: string,
): string[] {
  if (!Array.isArray(routes) || routes.length === 0) return [];
  const lc = (locale ?? "sv").toLowerCase();
  const isSwedish = lc.startsWith("sv");
  const keepKey: "sv" | "en" = isSwedish ? "sv" : "en";
  const dropKey: "sv" | "en" = isSwedish ? "en" : "sv";
  const normalized = routes.map((r) => normalizeRoutePath(r));
  const present = new Set(normalized);
  const dropped: string[] = [];
  for (const pair of LOCALE_ROUTE_PAIRS) {
    if (present.has(pair[keepKey]) && present.has(pair[dropKey])) {
      present.delete(pair[dropKey]);
      dropped.push(pair[dropKey]);
    }
  }
  if (dropped.length > 0) {
    debugLog("GEN", "[route-plan] dropped duplicate locale-alternate routes", {
      locale: lc,
      kept: keepKey,
      dropped,
    });
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of normalized) {
    if (!present.has(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}
