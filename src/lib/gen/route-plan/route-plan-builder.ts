import type { BuildIntent } from "@/lib/builder/build-intent";
import { stripFocusPointAppendix } from "@/lib/builder/focus-point-prompt";
import type { ScaffoldManifest } from "../scaffolds/types";
import { dedupePlannedRoutesInPlaceByLocale } from "./locale-dedupe";
import { countsTowardPageCeiling, normalizeRoutePath } from "./path-utils";
import {
  applyPromptPatterns,
  applyScaffoldDefaults,
  buildRoutesFromBrief,
  collectExplicitRouteRemovals,
  collectScaffoldRequiredPaths,
  detectExplicitPageCount,
  extractExplicitNamedPages,
  hasExplicitAddRouteIntent,
  neutralizeExplicitPageNameLiterals,
  upsertRoute,
} from "./planning-helpers";
import { APP_ROUTE_PATTERNS, WEBSITE_ROUTE_PATTERNS } from "./route-patterns";
import type { PlannedRoute, RoutePlan, RoutePlanSiteType, RoutePlanSource } from "./route-plan-types";

/**
 * Soft ceiling on how many level-1/2 routes a single generation round may plan
 * (ägarbeslut 2026-08-14). Level 3 (deeper or dynamic) does not count.
 *
 * Byggval's slider still tops out at 3 (token-budget/quality, 2026-07-31), but
 * three other sources could each push past this ceiling on their own: prompt
 * text ("5 sidor"), a Deep Brief with up to ten pages, and scaffold defaults.
 * The ceiling therefore lives here, after every source has been merged.
 *
 * Follow-ups measure only NEW level-1/2 routes against it. A site may grow
 * past four such pages across several rounds — it just cannot get there in one.
 *
 * Init rounds may keep pages above this number when the user named them in the
 * prompt or a scaffold requires them; {@link ABSOLUTE_MAX_ROUTES_PER_GENERATION}
 * is the hard stop for that exemption.
 */
export const MAX_ROUTES_PER_GENERATION = 4;

/**
 * Absolute brake on routes per init round, even with named/required exemptions.
 * A prompt that lists 14 page names must still be cut so one generation does
 * not try to build a whole sitemap.
 */
export const ABSOLUTE_MAX_ROUTES_PER_GENERATION = 8;

type CeilingTrimClass = "keep" | "named" | "required" | "brief" | "guessed";

/** Absolute brake: required is most protected (trimmed last). */
const ABSOLUTE_CEILING_TRIM_ORDER = ["guessed", "brief", "named", "required"] as const;
/** Explicit page count: named is most protected (trimmed last). */
const EXPLICIT_COUNT_TRIM_ORDER = ["guessed", "brief", "required", "named"] as const;

function classifyCeilingTrim(
  route: PlannedRoute,
  frozenRoutePaths: Set<string>,
  namedPaths: Set<string>,
  namedNames: Set<string>,
  scaffoldRequiredPaths: Set<string>,
  briefRoutePaths: Set<string>,
  trimOrder: readonly CeilingTrimClass[],
): CeilingTrimClass {
  const path = normalizeRoutePath(route.path);
  if (path === "/" || frozenRoutePaths.has(path)) return "keep";

  const matches: CeilingTrimClass[] = [];
  if (namedPaths.has(path) || namedNames.has(route.name.trim().toLowerCase())) {
    matches.push("named");
  }
  if (scaffoldRequiredPaths.has(path)) matches.push("required");
  if (briefRoutePaths.has(path)) matches.push("brief");
  if (matches.length === 0) return "guessed";

  // Among matching classes, pick the one trimmed last in the active order
  // (= most protected). Named+required therefore becomes required at the
  // absolute brake and named under an explicit page count.
  let best: CeilingTrimClass = matches[0]!;
  let bestIdx = -1;
  for (const cls of matches) {
    const idx = trimOrder.indexOf(cls);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = cls;
    }
  }
  return best;
}

function trimRoutesOverCeiling(
  routes: PlannedRoute[],
  limit: number,
  classesToTrim: ReadonlySet<CeilingTrimClass>,
  classify: (route: PlannedRoute) => CeilingTrimClass,
  score: (routes: PlannedRoute[]) => number,
): number {
  let trimmed = 0;
  for (let i = routes.length - 1; i >= 0 && score(routes) > limit; i -= 1) {
    const cls = classify(routes[i]!);
    if (cls === "keep" || !classesToTrim.has(cls)) continue;
    routes.splice(i, 1);
    trimmed += 1;
  }
  return trimmed;
}

function countCeilingRoutes(
  routes: PlannedRoute[],
  predicate: (route: PlannedRoute) => boolean = () => true,
): number {
  return routes.reduce((count, route) => {
    if (!countsTowardPageCeiling(route.path) || !predicate(route)) return count;
    return count + 1;
  }, 0);
}

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
    earlyExplicitPageCount !== null &&
    countCeilingRoutes(routes) >= earlyExplicitPageCount;
  if (!useFollowUpFreeze && !skipScaffoldDefaults) {
    applyScaffoldDefaults(buildIntent, resolvedScaffold, routes);
  }
  const scaffoldAddedPaths = new Set(
    routes
      .map((route) => normalizeRoutePath(route.path))
      .filter((path) => !pathsBeforeScaffoldDefaults.has(path)),
  );
  const scaffoldAddedRoutes = scaffoldAddedPaths.size > 0;
  const scaffoldRequiredPaths = collectScaffoldRequiredPaths(
    buildIntent,
    resolvedScaffold,
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
  if (
    !useFollowUpFreeze &&
    earlyExplicitPageCount !== null &&
    countCeilingRoutes(routes) > earlyExplicitPageCount
  ) {
    for (
      let i = routes.length - 1;
      i >= 0 && countCeilingRoutes(routes) > earlyExplicitPageCount;
      i -= 1
    ) {
      const candidate = routes[i]!;
      if (!countsTowardPageCeiling(candidate.path)) continue;
      if (candidate.required) continue;
      if (normalizeRoutePath(candidate.path) === "/") continue;
      routes.splice(i, 1);
      trimmedRouteCount += 1;
    }
    for (
      let i = routes.length - 1;
      i >= 0 && countCeilingRoutes(routes) > earlyExplicitPageCount;
      i -= 1
    ) {
      const candidate = routes[i]!;
      const normalizedPath = normalizeRoutePath(candidate.path);
      if (!countsTowardPageCeiling(normalizedPath)) continue;
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
  // Only level-1 and level-2 routes score against the ceiling. Level 3
  // (deeper or dynamic) is kept and ignored by the score — the scaffold
  // routeContract owns those templates, not the cap.
  //
  // Trimming from the end respects the insertion order used above — brief pages,
  // then explicitly named pages, then keyword patterns, then scaffold defaults —
  // so the least user-driven routes go first. Unnamed brief pages are still
  // trimmed at the soft ceiling. Init rounds keep prompt-named pages and required
  // scaffold companions above 4, then cut at ABSOLUTE_MAX_ROUTES_PER_GENERATION
  // (guessed → brief → named → required). An explicit lower count still wins and
  // cuts required BEFORE named. A route that matches several classes is
  // classified as the match trimmed last in the active order (= most protected),
  // so named+required stays required at the absolute brake and named under an
  // explicit page count — see both branches below.
  const effectiveRouteCeiling =
    !useFollowUpFreeze && earlyExplicitPageCount !== null
      ? Math.min(MAX_ROUTES_PER_GENERATION, earlyExplicitPageCount)
      : MAX_ROUTES_PER_GENERATION;
  const frozenRoutePaths = useFollowUpFreeze
    ? new Set(normalizedExistingPaths)
    : new Set<string>();
  const namedPaths = new Set(
    explicitNamedPages.map((page) => normalizeRoutePath(page.path)),
  );
  const namedNames = new Set(
    explicitNamedPages.map((page) => page.name.trim().toLowerCase()),
  );
  const allowCeilingExemptions =
    !useFollowUpFreeze &&
    (earlyExplicitPageCount === null ||
      earlyExplicitPageCount >= MAX_ROUTES_PER_GENERATION);
  const trimOrder = allowCeilingExemptions
    ? ABSOLUTE_CEILING_TRIM_ORDER
    : EXPLICIT_COUNT_TRIM_ORDER;
  const classify = (route: PlannedRoute): CeilingTrimClass => {
    // Level 3 is not a ceiling class — leave classifyCeilingTrim's
    // named/required/brief/guessed semantics untouched.
    if (!countsTowardPageCeiling(route.path)) return "keep";
    return classifyCeilingTrim(
      route,
      frozenRoutePaths,
      namedPaths,
      namedNames,
      scaffoldRequiredPaths,
      briefRoutePaths,
      trimOrder,
    );
  };
  const totalScore = (current: PlannedRoute[]): number =>
    countCeilingRoutes(
      current,
      (route) => !frozenRoutePaths.has(normalizeRoutePath(route.path)),
    );
  const softScore = (current: PlannedRoute[]): number =>
    countCeilingRoutes(current, (route) => {
      const cls = classify(route);
      return cls === "keep" || cls === "brief" || cls === "guessed";
    });
  let ceilingTrimmedCount = 0;
  let absoluteCeilingApplied = false;
  if (useFollowUpFreeze) {
    let newRouteCount = totalScore(routes);
    for (let i = routes.length - 1; i >= 0 && newRouteCount > effectiveRouteCeiling; i -= 1) {
      const normalizedPath = normalizeRoutePath(routes[i]!.path);
      if (normalizedPath === "/") continue;
      if (frozenRoutePaths.has(normalizedPath)) continue;
      if (!countsTowardPageCeiling(normalizedPath)) continue;
      routes.splice(i, 1);
      newRouteCount -= 1;
      ceilingTrimmedCount += 1;
    }
  } else if (allowCeilingExemptions) {
    // Soft cap counts home + unnamed brief + keyword guesses (level 1/2 only).
    // Named pages and required scaffold companions may sit above 4 until the
    // absolute brake.
    ceilingTrimmedCount += trimRoutesOverCeiling(
      routes,
      effectiveRouteCeiling,
      new Set(["guessed"]),
      classify,
      softScore,
    );
    ceilingTrimmedCount += trimRoutesOverCeiling(
      routes,
      effectiveRouteCeiling,
      new Set(["brief"]),
      classify,
      softScore,
    );
    if (totalScore(routes) > ABSOLUTE_MAX_ROUTES_PER_GENERATION) {
      absoluteCeilingApplied = true;
      // Named yields before required here. A scaffold's own files hardcode links
      // to its required routes (ecommerce links /products from header, footer and
      // hero), so cutting one ships dead links, while a cut named page is visible
      // and can be asked for again in a later round.
      for (const cls of ABSOLUTE_CEILING_TRIM_ORDER) {
        ceilingTrimmedCount += trimRoutesOverCeiling(
          routes,
          ABSOLUTE_MAX_ROUTES_PER_GENERATION,
          new Set([cls]),
          classify,
          totalScore,
        );
      }
    }
  } else {
    for (const cls of EXPLICIT_COUNT_TRIM_ORDER) {
      ceilingTrimmedCount += trimRoutesOverCeiling(
        routes,
        effectiveRouteCeiling,
        new Set([cls]),
        classify,
        totalScore,
      );
    }
  }
  const ceilingRouteCount = countCeilingRoutes(routes);
  const retainedAboveSoftCeiling =
    allowCeilingExemptions && ceilingRouteCount > MAX_ROUTES_PER_GENERATION
      ? ceilingRouteCount - MAX_ROUTES_PER_GENERATION
      : 0;

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
  const explicitPageCountActive =
    explicitPageCount !== null &&
    explicitPageCount > ceilingRouteCount &&
    !useFollowUpFreeze;
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

  const reason = (() => {
    if (absoluteCeilingApplied && ceilingTrimmedCount > 0) {
      return `${baseReason} Per-round page ceiling of ${effectiveRouteCeiling} waived for explicitly named or required routes; absolute ceiling of ${ABSOLUTE_MAX_ROUTES_PER_GENERATION} applied: trimmed ${ceilingTrimmedCount} route(s). Remaining pages can be added in a later round.`;
    }
    if (retainedAboveSoftCeiling > 0 && ceilingTrimmedCount > 0) {
      return `${baseReason} Per-round page ceiling of ${effectiveRouteCeiling} applied: trimmed ${ceilingTrimmedCount} route(s); retained ${retainedAboveSoftCeiling} explicitly named or required route(s) above the ceiling. Remaining pages can be added in a later round.`;
    }
    if (retainedAboveSoftCeiling > 0) {
      return `${baseReason} Per-round page ceiling of ${effectiveRouteCeiling} applied: retained ${retainedAboveSoftCeiling} explicitly named or required route(s) above the ceiling.`;
    }
    if (ceilingTrimmedCount > 0) {
      return `${baseReason} Per-round page ceiling of ${effectiveRouteCeiling} applied: trimmed ${ceilingTrimmedCount} route(s). Remaining pages can be added in a later round.`;
    }
    return baseReason;
  })();

  const effectiveRouteCount = explicitPageCountActive
    ? Math.max(ceilingRouteCount, explicitPageCount)
    : ceilingRouteCount;

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
