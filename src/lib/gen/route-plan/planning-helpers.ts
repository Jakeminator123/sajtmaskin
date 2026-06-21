import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "../scaffolds/types";
import { APP_ROUTE_PATTERNS, type RoutePatternEntry, WEBSITE_ROUTE_PATTERNS } from "./route-patterns";
import { normalizeRoutePath } from "./path-utils";

type BriefPageLike = {
  path?: unknown;
  name?: unknown;
  purpose?: unknown;
};

type RouteLike = {
  path: string;
  name: string;
  intent: string;
  required: boolean;
};

// Keep removal language explicit so "utan ..." copy/layout phrasing
// does not silently delete routes during follow-ups.
const ROUTE_REMOVAL_VERB_RE =
  /\b(remove|delete|drop|ta bort|plocka bort|radera)\b/i;
const ROUTE_REMOVAL_CONTEXT_RE =
  /\b(page|pages|route|routes|sida|sidor|sidan|sidorna)\b|[a-zåäö]+sida(?:n|rna)?\b/i;
const ROUTE_PATH_MENTION_RE = /\/[a-z0-9/_-]*/gi;
// A location preposition directly before a path mention ("remove the hero from
// /about", "ta bort knappen på /priser") means the removal targets content ON
// that page, not the page/route itself — so it must NOT delete the route.
const LOCATION_PREPOSITION_BEFORE_PATH_RE =
  /\b(?:from|on|in|into|inside|within|at|på|i|från|ur|inuti|hos)\s+$/i;

const EXPLICIT_ADD_ROUTE_PATTERNS = [
  /\b(?:add|create|make)\b[\s\S]{0,32}\b(?:new\s+)?(?:page|route)\b/i,
  /\b(?:new\s+)(?:page|route)\b/i,
  /\b(?:lägg till|skapa)\b[\s\S]{0,32}\b(?:en\s+ny\s+|ny\s+)?(?:sida|route)\b/i,
  /\b(?:ny\s+)(?:sida|route)\b/i,
];

const EXPLICIT_PAGE_COUNT_RE =
  /\b(\d{1,2})\s*(?:sidor|sida|pages?|routes?|vyer?|views?)\b/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferPathFromPageName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "/";
  if (/^(home|hem|start|startsida|homepage)$/i.test(trimmed)) return "/";
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "/";
  return normalizeRoutePath(`/${normalized}`);
}

export function upsertRoute(routes: RouteLike[], route: RouteLike): void {
  const normalizedPath = normalizeRoutePath(route.path);
  const existing = routes.find((item) => item.path === normalizedPath);
  if (existing) {
    if (!existing.intent && route.intent) existing.intent = route.intent;
    existing.required = existing.required || route.required;
    return;
  }
  routes.push({
    ...route,
    path: normalizedPath,
  });
}

export function collectExplicitRouteRemovals(
  prompt: string,
  buildIntent: BuildIntent,
  existingPaths: string[],
): Set<string> {
  const removals = new Set<string>();
  const normalizedExisting = new Set(existingPaths.map((path) => normalizeRoutePath(path)));
  if (!ROUTE_REMOVAL_VERB_RE.test(prompt)) return removals;

  for (const match of prompt.matchAll(ROUTE_PATH_MENTION_RE)) {
    const normalized = normalizeRoutePath(match[0]);
    if (normalized === "/" || !normalizedExisting.has(normalized)) continue;
    // Skip "remove <content> from/på <path>" — the removal targets something ON
    // the page, not the page itself. Deleting the route here would silently drop
    // a page the user only asked to edit (the failure the removal-verb gate and
    // the line-19 comment exist to prevent). Bias toward keeping the route.
    const preceding = prompt.slice(0, match.index ?? 0);
    if (LOCATION_PREPOSITION_BEFORE_PATH_RE.test(preceding)) continue;
    removals.add(normalized);
  }

  // Keep keyword-based removals conservative: require route/page wording in the same prompt.
  if (!ROUTE_REMOVAL_CONTEXT_RE.test(prompt)) return removals;

  const candidatePatterns =
    buildIntent === "app"
      ? [...APP_ROUTE_PATTERNS, ...WEBSITE_ROUTE_PATTERNS]
      : [...WEBSITE_ROUTE_PATTERNS, ...APP_ROUTE_PATTERNS];

  for (const candidate of candidatePatterns) {
    if (candidate.path === "/") continue;
    if (!normalizedExisting.has(candidate.path)) continue;
    if (candidate.match.test(prompt)) {
      removals.add(candidate.path);
    }
  }

  return removals;
}

export function hasExplicitAddRouteIntent(prompt: string): boolean {
  return EXPLICIT_ADD_ROUTE_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * Detect when the user explicitly states a page count ("3 sidor", "5 pages").
 * Returns the count or null when no match is found.
 */
export function detectExplicitPageCount(prompt: string): number | null {
  const match = prompt.match(EXPLICIT_PAGE_COUNT_RE);
  if (!match) return null;
  const count = parseInt(match[1]!, 10);
  return count >= 1 && count <= 20 ? count : null;
}

export function buildRoutesFromBrief(
  brief: Record<string, unknown> | null | undefined,
): RouteLike[] {
  const pages = Array.isArray((brief as { pages?: unknown })?.pages)
    ? ((brief as { pages?: BriefPageLike[] }).pages ?? [])
    : [];
  if (pages.length === 0) return [];

  const routes: RouteLike[] = [];
  for (const page of pages.slice(0, 10)) {
    const explicitPath = asString(page?.path);
    const inferredPath = inferPathFromPageName(asString(page?.name));
    const path = normalizeRoutePath(explicitPath || inferredPath || "/");
    const name = asString(page?.name) || (path === "/" ? "Home" : "Page");
    const purpose = asString(page?.purpose);
    const intent = purpose
      ? `Route purpose: ${purpose}`
      : `Implement the ${name} route.`;
    upsertRoute(routes, {
      path,
      name,
      intent,
      required: true,
    });
  }
  return routes;
}

export function applyPromptPatterns(
  prompt: string,
  patterns: RoutePatternEntry[],
  routes: RouteLike[],
): boolean {
  const before = new Set(routes.map((route) => normalizeRoutePath(route.path)));
  for (const pattern of patterns) {
    if (pattern.match.test(prompt)) {
      upsertRoute(routes, {
        path: pattern.path,
        name: pattern.name,
        intent: pattern.intent,
        required: true,
      });
    }
  }
  return routes.some((route) => !before.has(normalizeRoutePath(route.path)));
}

export function applyScaffoldDefaults(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
  routes: RouteLike[],
): void {
  switch (resolvedScaffold?.id) {
    case "blog":
      upsertRoute(routes, {
        path: "/blog",
        name: "Blog",
        intent: "Keep an editorial route for articles and archives.",
        required: buildIntent !== "app",
      });
      break;
    case "ecommerce":
      upsertRoute(routes, {
        path: "/products",
        name: "Products",
        intent: "Keep a storefront route for the product catalog.",
        required: true,
      });
      upsertRoute(routes, {
        path: "/cart",
        name: "Cart",
        intent: "Keep a cart route for purchase flow continuity.",
        required: false,
      });
      break;
    case "auth-pages":
      upsertRoute(routes, {
        path: "/login",
        name: "Login",
        intent: "Keep a dedicated authentication entry route.",
        required: true,
      });
      upsertRoute(routes, {
        path: "/signup",
        name: "Signup",
        intent: "Keep a dedicated registration route when auth is in scope.",
        required: false,
      });
      break;
    case "dashboard":
      if (buildIntent === "app") {
        upsertRoute(routes, {
          path: "/analytics",
          name: "Analytics",
          intent: "Dashboard apps benefit from an analytics or metrics route.",
          required: false,
        });
        upsertRoute(routes, {
          path: "/settings",
          name: "Settings",
          intent: "App shells should usually expose at least one management/settings route.",
          required: false,
        });
      }
      break;
    case "app-shell":
      if (buildIntent === "app") {
        upsertRoute(routes, {
          path: "/settings",
          name: "Settings",
          intent: "App shells should usually expose at least one management/settings route.",
          required: false,
        });
      }
      break;
    default:
      break;
  }
}
