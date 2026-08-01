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
 * Scaffold routes that the generation has already replaced with their
 * locale-alternate (`/blog` superseded by an emitted `/blogg`, or the reverse).
 *
 * `dedupePlannedRoutesInPlaceByLocale` only cleans the PLAN. The scaffold's own
 * files are materialized separately, so a Swedish build kept `app/blog/**` from
 * the blog scaffold even after the plan settled on `/blogg` and the model
 * emitted `app/blogg/**`. The result was a site with both `/blog` and `/blogg`,
 * where only the Swedish pair was linked from the header — the user saw six
 * pages, three of them unreachable (2026-07-31).
 *
 * Deliberately locale-FREE: it compares what the model emitted against what the
 * scaffold ships, in either direction. Deciding from the project locale instead
 * would need that locale threaded down into the merge (it is not available
 * there), and any default would silently be wrong half the time — a `sv`
 * default leaves an English build's superseded Swedish scaffold pages behind,
 * which is the same orphaned-page bug with the languages swapped.
 *
 * A scaffold page is only dropped when its alternate was actually emitted, so
 * nothing is removed on the guess that something else will replace it. If the
 * model emitted BOTH variants it meant to, and both stay.
 */
export function findSupersededScaffoldRoutes(
  emittedRoutePaths: readonly string[],
  scaffoldRoutePaths: readonly string[],
): string[] {
  const emitted = new Set(emittedRoutePaths.map((path) => normalizeRoutePath(path)));
  const scaffold = new Set(scaffoldRoutePaths.map((path) => normalizeRoutePath(path)));

  const superseded: string[] = [];
  for (const pair of LOCALE_ROUTE_PAIRS) {
    for (const [kept, dropped] of [
      [pair.sv, pair.en],
      [pair.en, pair.sv],
    ] as const) {
      if (!emitted.has(kept)) continue;
      if (emitted.has(dropped)) continue; // model deliberately emitted both
      if (!scaffold.has(dropped)) continue; // scaffold has nothing to supersede
      superseded.push(dropped);
    }
  }
  return superseded;
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
