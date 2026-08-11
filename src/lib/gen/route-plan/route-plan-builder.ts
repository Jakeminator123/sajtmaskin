import type { BuildIntent } from "@/lib/builder/build-intent";
import { stripFocusPointAppendix } from "@/lib/builder/focus-point-prompt";
import type { ScaffoldManifest } from "../scaffolds/types";
import { dedupePlannedRoutesInPlaceByLocale } from "./locale-dedupe";
import { normalizeRoutePath } from "./path-utils";
import {
  applyPromptPatterns,
  applyScaffoldDefaults,
  buildRoutesFromBrief,
  collectExplicitRouteRemovals,
  detectExplicitPageCount,
  extractExplicitNamedPages,
  hasExplicitAddRouteIntent,
  neutralizeExplicitPageNameLiterals,
  upsertRoute,
} from "./planning-helpers";
import { APP_ROUTE_PATTERNS, WEBSITE_ROUTE_PATTERNS } from "./route-patterns";
import type { PlannedRoute, RoutePlan, RoutePlanSiteType, RoutePlanSource } from "./route-plan-types";

/**
 * Hard ceiling on how many routes a single generation round may plan.
 *
 * Byggval's slider tops out at the same number, but three other sources could
 * each push past it on their own: prompt text ("5 sidor"), a Deep Brief with up
 * to ten pages, and scaffold defaults. The ceiling therefore lives here, after
 * every source has been merged, rather than in any one of them.
 *
 * Follow-ups measure only NEW routes against it. A site is allowed to grow past
 * three pages across several rounds — it just cannot get there in one.
 */
export const MAX_ROUTES_PER_GENERATION = 3;

function inferSiteType(buildIntent: BuildIntent, routeCount: number): RoutePlanSiteType {
  if (buildIntent === "app") return "app-shell";
  if (routeCount <= 1) return "one-page";
  if (routeCount <= 5) return "brochure";
  return "content-heavy";
}

export function buildRoutePlan(params: {
  prompt: string;
  buildIntent: BuildIntent;
  brief?: Record<string, unknown> | null;
  resolvedScaffold: ScaffoldManifest | null;
  generationMode?: "init" | "followUp";
  existingRoutePaths?: string[];
  /**
   * Project locale used to dedupe locale-alternate route pairs (e.g. /blogg vs
   * /blog, /kontakt vs /contact). Defaults to "sv" because Sajtmaskin's
   * generated sites render `<html lang="sv">` unless explicitly overridden.
   * Pass "en" (or any non-sv locale) to keep English route variants instead.
   */
  locale?: string;
  /**
   * Byggval (init controls): structured page-count hint. Takes precedence
   * over `detectExplicitPageCount(prompt)` when both are present. Same
   * 1–20 range as the prompt-text path; out-of-range values are ignored.
   */
  pageCountHint?: number | null;
}): RoutePlan {
  const { prompt: rawPrompt, buildIntent, brief, resolvedScaffold, generationMode, existingRoutePaths = [], locale = "sv", pageCountHint = null } = params;
  // Focus-point appendix identifies *which element* was marked (e.g. link text
  // PORTFOLIO) — never feed that into keyword route inference.
  const prompt = stripFocusPointAppendix(rawPrompt);
  const routes: PlannedRoute[] = [];
  const briefRoutes = buildRoutesFromBrief(brief);
  const hasBriefRoutes = briefRoutes.length > 0;
  const normalizedExistingPaths = Array.from(
    new Set(
      existingRoutePaths
        .map((path) => normalizeRoutePath(path))
        .filter((path) => typeof path === "string" && path.length > 0),
    ),
  );
  const useFollowUpFreeze = generationMode === "followUp" && normalizedExistingPaths.length > 0;
  const explicitRouteRemovals = useFollowUpFreeze
    ? collectExplicitRouteRemovals(prompt, buildIntent, normalizedExistingPaths)
    : new Set<string>();
  const explicitNamedPages = extractExplicitNamedPages(prompt);
  const explicitAddRouteIntent =
    hasExplicitAddRouteIntent(prompt) || explicitNamedPages.length > 0;
  let promptAddedRoutes = false;

  const routeNameFromPath = (path: string): string => {
    if (path === "/") {
      return buildIntent === "app" ? "Dashboard" : "Home";
    }
    const label = path
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/[-_]/g, " "))
      .join(" ")
      .trim();
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Route";
  };

  if (useFollowUpFreeze) {
    for (const existingPath of normalizedExistingPaths) {
      if (explicitRouteRemovals.has(existingPath)) {
        continue;
      }
      const isRoot = existingPath === "/";
      upsertRoute(routes, {
        path: existingPath,
        name: routeNameFromPath(existingPath),
        intent: isRoot
          ? "Keep the root route as the primary entry point while applying follow-up changes."
          : `Preserve the existing ${routeNameFromPath(existingPath)} route unless the user explicitly asks to remove it.`,
        required: isRoot,
      });
    }
  }

  // Track brief-origin routes separately so cap-enforced trim can drop
  // prompt-pattern / scaffold-default routes (which also use required:true)
  // without ever dropping the user's brief-defined pages.
  const briefRoutePaths = new Set<string>();
  if (hasBriefRoutes) {
    if (useFollowUpFreeze && !explicitAddRouteIntent) {
      const existingSet = new Set(routes.map((route) => normalizeRoutePath(route.path)));
      for (const briefRoute of briefRoutes) {
        const normalizedBriefPath = normalizeRoutePath(briefRoute.path);
        if (!existingSet.has(normalizedBriefPath)) continue;
        upsertRoute(routes, briefRoute);
        briefRoutePaths.add(normalizedBriefPath);
      }
    } else {
      for (const briefRoute of briefRoutes) {
        upsertRoute(routes, briefRoute);
        briefRoutePaths.add(normalizeRoutePath(briefRoute.path));
      }
    }
  }

  if (buildIntent === "app") {
    if (!useFollowUpFreeze && !hasBriefRoutes) {
      upsertRoute(routes, {
        path: "/",
        name: "Dashboard",
        intent: "Use the root route as the main product workspace or dashboard.",
        required: true,
      });
      promptAddedRoutes = true;
    }
    if (!useFollowUpFreeze || explicitAddRouteIntent) {
      for (const named of explicitNamedPages) {
        upsertRoute(routes, {
          path: named.path,
          name: named.name,
          intent: `Implement the explicitly requested ${named.name} page.`,
          required: true,
        });
        promptAddedRoutes = true;
      }
      const patternPrompt = neutralizeExplicitPageNameLiterals(
        prompt,
        explicitNamedPages.map((page) => page.name),
      );
      promptAddedRoutes =
        applyPromptPatterns(patternPrompt, APP_ROUTE_PATTERNS, routes) || promptAddedRoutes;
    }
  } else {
    if (!useFollowUpFreeze && !hasBriefRoutes) {
      upsertRoute(routes, {
        path: "/",
        name: "Home",
        intent: "Use the root route for the primary landing page or homepage.",
        required: true,
      });
      promptAddedRoutes = true;
    }
    if (!useFollowUpFreeze || explicitAddRouteIntent) {
      for (const named of explicitNamedPages) {
        upsertRoute(routes, {
          path: named.path,
          name: named.name,
          intent: `Implement the explicitly requested ${named.name} page.`,
          required: true,
        });
        promptAddedRoutes = true;
      }
      const patternPrompt = neutralizeExplicitPageNameLiterals(
        prompt,
        explicitNamedPages.map((page) => page.name),
      );
      promptAddedRoutes =
        applyPromptPatterns(patternPrompt, WEBSITE_ROUTE_PATTERNS, routes) || promptAddedRoutes;
    }
  }

  // Ensure a root route exists even when brief pages didn't map to `/`.
  // A multi-page site without `/` leads to broken IA and missing homepage.
  if (!useFollowUpFreeze && !routes.some((r) => normalizeRoutePath(r.path) === "/")) {
    upsertRoute(routes, {
      path: "/",
      name: buildIntent === "app" ? "Dashboard" : "Home",
      intent: buildIntent === "app"
        ? "Use the root route as the main product workspace or dashboard."
        : "Use the root route for the primary landing page or homepage.",
      required: true,
    });
  }

  if (useFollowUpFreeze && explicitRouteRemovals.size > 0) {
    for (let i = routes.length - 1; i >= 0; i -= 1) {
      const normalizedPath = normalizeRoutePath(routes[i]!.path);
      if (normalizedPath !== "/" && explicitRouteRemovals.has(normalizedPath)) {
        routes.splice(i, 1);
      }
    }
  }

  // Compute explicit page-count cap upfront so scaffold defaults respect it
  // (e.g. "snickerifirma 2 sidor" should not trigger ecommerce auto-adding
  // /products + /cart on top of the brief's 2 pages). The structured Byggval
  // hint wins over prompt-text detection when both are present.
  const structuredPageCount =
    typeof pageCountHint === "number" &&
    Number.isInteger(pageCountHint) &&
    pageCountHint >= 1 &&
    pageCountHint <= 20
      ? pageCountHint
      : null;
  const requestedExplicitPageCount = structuredPageCount ?? detectExplicitPageCount(prompt);
  // Clamp to the per-round ceiling before anything reads the value, so neither
  // `reason` nor `siteType` can promise more pages than the cap below allows.
  // Follow-ups keep the raw number: their ceiling counts new routes only, and
  // the frozen set is not known to be under it.
  const earlyExplicitPageCount =
    requestedExplicitPageCount !== null && !useFollowUpFreeze
      ? Math.min(requestedExplicitPageCount, MAX_ROUTES_PER_GENERATION)
      : requestedExplicitPageCount;
  const pathsBeforeScaffoldDefaults = new Set(
    routes.map((route) => normalizeRoutePath(route.path)),
  );
  const skipScaffoldDefaults =
    earlyExplicitPageCount !== null && routes.length >= earlyExplicitPageCount;
  if (!useFollowUpFreeze && !skipScaffoldDefaults) {
    applyScaffoldDefaults(buildIntent, resolvedScaffold, routes);
  }
  const scaffoldAddedRoutes = routes.some(
    (route) => !pathsBeforeScaffoldDefaults.has(normalizeRoutePath(route.path)),
  );

  // Symmetric downward trim: detectExplicitPageCount is also used below to
  // boost route counts upward (Math.max). Without this trim the user's
  // explicit "2 sidor" gets silently overridden when brief + scaffold +
  // patterns produce more. Trim happens in two passes:
  //   pass 1: drop routes flagged required:false (rare — most adders use true)
  //   pass 2: drop routes that are not from the brief and not "/"
  // Brief-origin routes are exempt here, but no longer survive the run: the
  // per-round ceiling below trims whatever is still over the stricter of the cap
  // and the ceiling, brief or not.
  let trimmedRouteCount = 0;
  if (!useFollowUpFreeze && earlyExplicitPageCount !== null && routes.length > earlyExplicitPageCount) {
    for (let i = routes.length - 1; i >= 0 && routes.length > earlyExplicitPageCount; i -= 1) {
      const candidate = routes[i]!;
      if (candidate.required) continue;
      if (normalizeRoutePath(candidate.path) === "/") continue;
      routes.splice(i, 1);
      trimmedRouteCount += 1;
    }
    for (let i = routes.length - 1; i >= 0 && routes.length > earlyExplicitPageCount; i -= 1) {
      const candidate = routes[i]!;
      const normalizedPath = normalizeRoutePath(candidate.path);
      if (normalizedPath === "/") continue;
      if (briefRoutePaths.has(normalizedPath)) continue;
      routes.splice(i, 1);
      trimmedRouteCount += 1;
    }
  }

  // Dedupe locale-alternate route pairs (e.g. /blog ↔ /blogg) before the plan
  // is serialized for the LLM. Without this, brief + scaffold can produce both
  // variants and the LLM emits inconsistent links across them.
  dedupePlannedRoutesInPlaceByLocale(routes, locale);

  // Per-round ceiling. Runs last so it sees the final path set: locale dedupe may
  // already have removed a pair.
  //
  // The effective limit is the STRICTER of the ceiling and an explicit page count.
  // The explicit-count trim above deliberately exempts brief routes, so a
  // five-page brief against "2 sidor" reaches this point with five routes; taking
  // only the ceiling would settle on three and quietly ignore the stricter choice.
  //
  // Trimming from the end respects the insertion order used above — brief pages,
  // then explicitly named pages, then keyword patterns, then scaffold defaults —
  // so the least user-driven routes go first. Unlike the explicit-count trim,
  // brief routes are NOT exempt here: the ceiling is absolute, and a ten-page
  // brief would otherwise walk straight through it.
  const effectiveRouteCeiling =
    !useFollowUpFreeze && earlyExplicitPageCount !== null
      ? Math.min(MAX_ROUTES_PER_GENERATION, earlyExplicitPageCount)
      : MAX_ROUTES_PER_GENERATION;
  const frozenRoutePaths = useFollowUpFreeze
    ? new Set(normalizedExistingPaths)
    : new Set<string>();
  let newRouteCount = routes.filter(
    (route) => !frozenRoutePaths.has(normalizeRoutePath(route.path)),
  ).length;
  let ceilingTrimmedCount = 0;
  for (let i = routes.length - 1; i >= 0 && newRouteCount > effectiveRouteCeiling; i -= 1) {
    const normalizedPath = normalizeRoutePath(routes[i]!.path);
    if (normalizedPath === "/") continue;
    if (frozenRoutePaths.has(normalizedPath)) continue;
    routes.splice(i, 1);
    newRouteCount -= 1;
    ceilingTrimmedCount += 1;
  }

  const sources: RoutePlanSource[] = [];
  if (hasBriefRoutes) sources.push("brief");
  if (promptAddedRoutes || sources.length === 0) sources.push("prompt");
  if (scaffoldAddedRoutes) sources.push("scaffold");
  const primarySource: RoutePlanSource = hasBriefRoutes
    ? "brief"
    : scaffoldAddedRoutes
      ? "scaffold"
      : "prompt";

  const explicitPageCount = earlyExplicitPageCount;
  const explicitPageCountActive = explicitPageCount !== null && explicitPageCount > routes.length && !useFollowUpFreeze;
  const explicitPageCountTrimmed = trimmedRouteCount > 0;

  const baseReason = useFollowUpFreeze
    ? explicitRouteRemovals.size > 0
      ? "Follow-up mode preserves existing App Router routes by default, while explicit route-removal intent can remove selected pages."
      : "Follow-up mode preserves existing App Router routes by default; only explicit user intent should add new pages."
    : explicitPageCountTrimmed
      ? `User explicitly requested ${explicitPageCount} pages — trimmed ${trimmedRouteCount} optional route(s) to honor the cap. Generate real App Router pages for the remaining entries.`
    : hasBriefRoutes && promptAddedRoutes
      ? "Route structure merges brief-defined pages with explicit prompt route requests."
      : hasBriefRoutes && scaffoldAddedRoutes
        ? "Route structure starts from brief pages and adds scaffold defaults when relevant."
    : hasBriefRoutes
    ? "Route structure derived from brief-defined pages; keep real App Router pages for each planned path."
    : scaffoldAddedRoutes
    ? "Scaffold defaults added routes on top of prompt-inferred structure; keep real App Router pages for each planned path."
    : explicitPageCountActive
    ? `User explicitly requested ${explicitPageCount} pages; generate real App Router pages for each. Infer page names from the prompt context.`
    : routes.length > 1
      ? "Prompt analysis suggests a multi-route build; keep real App Router pages instead of collapsing everything into one page."
      : "Prompt analysis suggests a compact default route structure unless the model has strong evidence to add more pages.";

  const reason =
    ceilingTrimmedCount > 0
      ? `${baseReason} Per-round page ceiling of ${effectiveRouteCeiling} applied: trimmed ${ceilingTrimmedCount} route(s). Remaining pages can be added in a later round.`
      : baseReason;

  const effectiveRouteCount = explicitPageCountActive
    ? Math.max(routes.length, explicitPageCount)
    : routes.length;

  return {
    provenance: { primarySource, sources },
    siteType: inferSiteType(buildIntent, effectiveRouteCount),
    reason,
    routes,
    ...(explicitPageCount !== null && (explicitPageCountActive || explicitPageCountTrimmed)
      ? { explicitPageCount }
      : {}),
  };
}
