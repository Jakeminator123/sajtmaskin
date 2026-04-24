import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "./scaffolds/types";
import { dedupePlannedRoutesInPlaceByLocale, deduplicateLocaleAlternateRoutes } from "./route-plan/locale-dedupe";
import { extractAppRoutePathsFromFilePaths, normalizeRoutePath } from "./route-plan/path-utils";
import {
  applyPromptPatterns,
  applyScaffoldDefaults,
  buildRoutesFromBrief,
  collectExplicitRouteRemovals,
  detectExplicitPageCount,
  hasExplicitAddRouteIntent,
  upsertRoute,
} from "./route-plan/planning-helpers";
import { findMissingRequiredRoutes, routePatternToRegex } from "./route-plan/route-matchers";
import { WEBSITE_ROUTE_PATTERNS, APP_ROUTE_PATTERNS } from "./route-plan/route-patterns";

export const ROUTE_PLAN_SITE_TYPES = [
  "one-page",
  "brochure",
  "content-heavy",
  "app-shell",
] as const;
export type RoutePlanSiteType = (typeof ROUTE_PLAN_SITE_TYPES)[number];

export function isRoutePlanSiteType(value: unknown): value is RoutePlanSiteType {
  return (
    typeof value === "string" &&
    (ROUTE_PLAN_SITE_TYPES as readonly string[]).includes(value)
  );
}

export type RoutePlanSource = "brief" | "prompt" | "scaffold";

/** Ordered route-plan contributors (e.g. prompt patterns then scaffold defaults). */
export interface RoutePlanProvenance {
  /** Drives planning UX and BuildSpec: brief wins, else scaffold if it changed IA, else prompt. */
  primarySource: RoutePlanSource;
  /** All sources that contributed routes or structure (stable order). */
  sources: RoutePlanSource[];
}

export interface PlannedRoute {
  path: string;
  name: string;
  intent: string;
  required: boolean;
}

export interface RoutePlan {
  provenance: RoutePlanProvenance;
  siteType: RoutePlanSiteType;
  reason: string;
  routes: PlannedRoute[];
  /** Set when the user explicitly stated a page count ("3 sidor"). */
  explicitPageCount?: number;
}

export function isRoutePlanSource(value: unknown): value is RoutePlanSource {
  return value === "brief" || value === "prompt" || value === "scaffold";
}

/** Null-safe primary source; supports legacy persisted payloads that only had `source`. */
export function getRoutePlanPrimarySource(
  plan: RoutePlan | { provenance?: RoutePlanProvenance; source?: RoutePlanSource } | null | undefined,
): RoutePlanSource | null {
  if (!plan) return null;
  if ("provenance" in plan && plan.provenance?.primarySource) {
    return plan.provenance.primarySource;
  }
  if ("source" in plan && isRoutePlanSource((plan as { source?: unknown }).source)) {
    return (plan as { source: RoutePlanSource }).source;
  }
  return null;
}

/**
 * Parse a loose JSON object into RoutePlan, accepting legacy `{ source }` or new `{ provenance }`.
 */
export function parseRoutePlanFromUnknown(data: Record<string, unknown> | null | undefined): RoutePlan | null {
  if (!data || typeof data !== "object") return null;
  const siteType = data.siteType;
  const reason = data.reason;
  const routesRaw = data.routes;
  if (!isRoutePlanSiteType(siteType)) {
    return null;
  }
  if (typeof reason !== "string" || !Array.isArray(routesRaw)) return null;

  let provenance: RoutePlanProvenance | undefined;
  const prov = data.provenance;
  if (prov && typeof prov === "object" && !Array.isArray(prov)) {
    const p = prov as Record<string, unknown>;
    const primary = p.primarySource;
    const sources = p.sources;
    if (
      isRoutePlanSource(primary) &&
      Array.isArray(sources) &&
      sources.length > 0 &&
      sources.every(isRoutePlanSource)
    ) {
      provenance = { primarySource: primary, sources: [...sources] };
    }
  }
  if (!provenance && isRoutePlanSource(data.source)) {
    provenance = { primarySource: data.source, sources: [data.source] };
  }
  if (!provenance) return null;

  const routes: PlannedRoute[] = [];
  for (const item of routesRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string") continue;
    const path = normalizeRoutePath(r.path);
    const name =
      typeof r.name === "string" && r.name.trim()
        ? r.name.trim()
        : path === "/"
          ? "Home"
          : path.split("/").filter(Boolean).join(" ") || "Route";
    const intent =
      typeof r.intent === "string" && r.intent.trim()
        ? r.intent.trim()
        : `Implement the ${name} route as planned.`;
    routes.push({
      path,
      name,
      intent,
      required: typeof r.required === "boolean" ? r.required : false,
    });
  }

  return {
    provenance,
    siteType,
    reason,
    routes,
  };
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
}): RoutePlan {
  const { prompt, buildIntent, brief, resolvedScaffold, generationMode, existingRoutePaths = [], locale = "sv" } = params;
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
  const explicitAddRouteIntent = hasExplicitAddRouteIntent(prompt);
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
      promptAddedRoutes = applyPromptPatterns(prompt, APP_ROUTE_PATTERNS, routes) || promptAddedRoutes;
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
      promptAddedRoutes = applyPromptPatterns(prompt, WEBSITE_ROUTE_PATTERNS, routes) || promptAddedRoutes;
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
  // /products + /cart on top of the brief's 2 pages).
  const earlyExplicitPageCount = detectExplicitPageCount(prompt);
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
  // Brief-origin routes are preserved even if the total still exceeds the
  // cap (logged via `reason` so the LLM resolves the conflict).
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

  const reason = useFollowUpFreeze
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

export function findMissingPlannedRoutes(
  routePlan: RoutePlan | null | undefined,
  actualRoutes: string[],
): PlannedRoute[] {
  if (!routePlan || routePlan.routes.length === 0) return [];
  return findMissingRequiredRoutes(routePlan.routes, actualRoutes);
}

export {
  deduplicateLocaleAlternateRoutes,
  detectExplicitPageCount,
  extractAppRoutePathsFromFilePaths,
  normalizeRoutePath,
  routePatternToRegex,
};
