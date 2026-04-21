import type { BuildIntent } from "@/lib/builder/build-intent";
import { debugLog } from "@/lib/utils/debug";
import type { ScaffoldManifest } from "./scaffolds/types";

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

type BriefPageLike = {
  path?: unknown;
  name?: unknown;
  purpose?: unknown;
};

const WEBSITE_ROUTE_PATTERNS: Array<{
  match: RegExp;
  path: string;
  name: string;
  intent: string;
}> = [
  {
    match: /\bom\s+oss\b/i,
    path: "/om",
    name: "Om oss",
    intent: "Build trust and explain the company or creator (Swedish sites: use /om).",
  },
  {
    match: /\b(about|company|story)\b/i,
    path: "/about",
    name: "About",
    intent: "Build trust and explain the company or creator.",
  },
  {
    match: /\b(booking\s+page|bookings?\s+page|bokningssida|bokningssidan|bookings?|booking|boka|reservation|reserve)\b/i,
    path: "/booking",
    name: "Booking",
    intent: "Provide a dedicated booking/reservation flow.",
  },
  { match: /\b(services?\s+page|tjänste?r?\s*sida|our services|våra tjänster)\b/i, path: "/services", name: "Services", intent: "Explain offers, packages, or capabilities." },
  { match: /\b(pricing|price|pris|priser|billing)\b/i, path: "/pricing", name: "Pricing", intent: "Show pricing, plans, or billing details." },
  { match: /\b(contact|kontakta|kontakt|kontaktsida|kontaktsidan)\b/i, path: "/contact", name: "Contact", intent: "Capture leads or contact requests." },
  { match: /\b(blog|blogg|articles?|newsletter)\b/i, path: "/blog", name: "Blog", intent: "Publish articles, updates, or editorial content." },
  { match: /\b(docs|documentation|kunskapsbank|guide|guides)\b/i, path: "/docs", name: "Docs", intent: "Provide structured documentation or help content." },
  { match: /\b(support|help center|faq|kundservice)\b/i, path: "/support", name: "Support", intent: "Answer common questions and support flows." },
  { match: /\b(portfolio|case study|case studies|work|projekt)\b/i, path: "/work", name: "Work", intent: "Show portfolio pieces, projects, or case studies." },
  { match: /\b(team\s+page|employees|staff\s+page|medarbetare\s*sida|our team|vårt team)\b/i, path: "/team", name: "Team", intent: "Introduce people behind the company or product." },
  { match: /\b(testimonial|reviews|recensioner|omdömen)\b/i, path: "/testimonials", name: "Testimonials", intent: "Show social proof and customer outcomes." },
  { match: /\b(shop|store|butik|products|product|catalog|katalog)\b/i, path: "/products", name: "Products", intent: "Show product catalog or product overview." },
  { match: /\b(cart|varukorg)\b/i, path: "/cart", name: "Cart", intent: "Show selected products before checkout." },
  { match: /\b(checkout|kassa)\b/i, path: "/checkout", name: "Checkout", intent: "Complete the purchase flow." },
];

const APP_ROUTE_PATTERNS: Array<{
  match: RegExp;
  path: string;
  name: string;
  intent: string;
}> = [
  { match: /\b(settings|inställningar)\b/i, path: "/settings", name: "Settings", intent: "Manage account, workspace, or application settings." },
  { match: /\b(user|users|team|members|användare)\b/i, path: "/users", name: "Users", intent: "Manage users, roles, or members." },
  { match: /\b(billing|subscription|invoice|faktur)\b/i, path: "/billing", name: "Billing", intent: "Manage billing, subscriptions, or invoices." },
  { match: /\b(analytics|metrics|statistik|analys)\b/i, path: "/analytics", name: "Analytics", intent: "Show analytics, metrics, or statistical dashboards." },
  { match: /\b(report|reports|rapport|rapporter)\b/i, path: "/reports", name: "Reports", intent: "Show reports or exportable summaries." },
  { match: /\b(sign.?up|register|registr(?:era|ering)?)\b/i, path: "/signup", name: "Signup", intent: "Provide account registration for the application." },
  { match: /\b(forgot.?password|reset.?password|glömt lösenord|återställ)\b/i, path: "/forgot-password", name: "Forgot Password", intent: "Provide password recovery in the authentication flow." },
  { match: /\b(login|inlogg|auth|sign.?in|logga in)\b/i, path: "/login", name: "Login", intent: "Provide authentication entry for the application." },
];

// Keep removal language explicit so "utan ..." copy/layout phrasing
// does not silently delete routes during follow-ups.
const ROUTE_REMOVAL_VERB_RE =
  /\b(remove|delete|drop|ta bort|plocka bort|radera)\b/i;
const ROUTE_REMOVAL_CONTEXT_RE =
  /\b(page|pages|route|routes|sida|sidor|sidan|sidorna)\b|[a-zåäö]+sida(?:n|rna)?\b/i;
const ROUTE_PATH_MENTION_RE = /\/[a-z0-9/_-]*/gi;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRoutePath(value: string): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalizedSegments = withLeadingSlash
    .replace(/\/{2,}/g, "/")
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const paramName = segment.slice(1).trim();
      return paramName ? `[${paramName}]` : segment;
    })
    .join("/");
  return normalizedSegments.replace(/\/$/, "") || "/";
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

function pushRoute(routes: PlannedRoute[], route: PlannedRoute): void {
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

function collectExplicitRouteRemovals(
  prompt: string,
  buildIntent: BuildIntent,
  existingPaths: string[],
): Set<string> {
  const removals = new Set<string>();
  const normalizedExisting = new Set(existingPaths.map((path) => normalizeRoutePath(path)));
  if (!ROUTE_REMOVAL_VERB_RE.test(prompt)) return removals;

  for (const rawPath of prompt.match(ROUTE_PATH_MENTION_RE) ?? []) {
    const normalized = normalizeRoutePath(rawPath);
    if (normalized !== "/" && normalizedExisting.has(normalized)) {
      removals.add(normalized);
    }
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

const EXPLICIT_ADD_ROUTE_PATTERNS = [
  /\b(?:add|create|make)\b[\s\S]{0,32}\b(?:new\s+)?(?:page|route)\b/i,
  /\b(?:new\s+)(?:page|route)\b/i,
  /\b(?:lägg till|skapa)\b[\s\S]{0,32}\b(?:en\s+ny\s+|ny\s+)?(?:sida|route)\b/i,
  /\b(?:ny\s+)(?:sida|route)\b/i,
];

function hasExplicitAddRouteIntent(prompt: string): boolean {
  return EXPLICIT_ADD_ROUTE_PATTERNS.some((pattern) => pattern.test(prompt));
}

function inferSiteType(buildIntent: BuildIntent, routeCount: number): RoutePlanSiteType {
  if (buildIntent === "app") return "app-shell";
  if (routeCount <= 1) return "one-page";
  if (routeCount <= 5) return "brochure";
  return "content-heavy";
}

const EXPLICIT_PAGE_COUNT_RE =
  /\b(\d{1,2})\s*(?:sidor|sida|pages?|routes?|vyer?|views?)\b/i;

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

function buildRoutesFromBrief(
  brief: Record<string, unknown> | null | undefined,
): PlannedRoute[] {
  const pages = Array.isArray((brief as { pages?: unknown })?.pages)
    ? ((brief as { pages?: BriefPageLike[] }).pages ?? [])
    : [];
  if (pages.length === 0) return [];

  const routes: PlannedRoute[] = [];
  for (const page of pages.slice(0, 10)) {
    const explicitPath = asString(page?.path);
    const inferredPath = inferPathFromPageName(asString(page?.name));
    const path = normalizeRoutePath(explicitPath || inferredPath || "/");
    const name = asString(page?.name) || (path === "/" ? "Home" : "Page");
    const purpose = asString(page?.purpose);
    const intent = purpose
      ? `Route purpose: ${purpose}`
      : `Implement the ${name} route.`;
    pushRoute(routes, {
      path,
      name,
      intent,
      required: true,
    });
  }
  return routes;
}

function applyPromptPatterns(
  prompt: string,
  patterns: Array<{ match: RegExp; path: string; name: string; intent: string }>,
  routes: PlannedRoute[],
): boolean {
  const before = new Set(routes.map((route) => normalizeRoutePath(route.path)));
  for (const pattern of patterns) {
    if (pattern.match.test(prompt)) {
      pushRoute(routes, {
        path: pattern.path,
        name: pattern.name,
        intent: pattern.intent,
        required: true,
      });
    }
  }
  return routes.some((route) => !before.has(normalizeRoutePath(route.path)));
}

function applyScaffoldDefaults(buildIntent: BuildIntent, resolvedScaffold: ScaffoldManifest | null, routes: PlannedRoute[]) {
  switch (resolvedScaffold?.id) {
    case "blog":
      pushRoute(routes, {
        path: "/blog",
        name: "Blog",
        intent: "Keep an editorial route for articles and archives.",
        required: buildIntent !== "app",
      });
      break;
    case "ecommerce":
      pushRoute(routes, {
        path: "/products",
        name: "Products",
        intent: "Keep a storefront route for the product catalog.",
        required: true,
      });
      pushRoute(routes, {
        path: "/cart",
        name: "Cart",
        intent: "Keep a cart route for purchase flow continuity.",
        required: false,
      });
      break;
    case "auth-pages":
      pushRoute(routes, {
        path: "/login",
        name: "Login",
        intent: "Keep a dedicated authentication entry route.",
        required: true,
      });
      pushRoute(routes, {
        path: "/signup",
        name: "Signup",
        intent: "Keep a dedicated registration route when auth is in scope.",
        required: false,
      });
      break;
    case "dashboard":
      if (buildIntent === "app") {
        pushRoute(routes, {
          path: "/analytics",
          name: "Analytics",
          intent: "Dashboard apps benefit from an analytics or metrics route.",
          required: false,
        });
        pushRoute(routes, {
          path: "/settings",
          name: "Settings",
          intent: "App shells should usually expose at least one management/settings route.",
          required: false,
        });
      }
      break;
    case "app-shell":
      if (buildIntent === "app") {
        pushRoute(routes, {
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
      pushRoute(routes, {
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
        pushRoute(routes, briefRoute);
        briefRoutePaths.add(normalizedBriefPath);
      }
    } else {
      for (const briefRoute of briefRoutes) {
        pushRoute(routes, briefRoute);
        briefRoutePaths.add(normalizeRoutePath(briefRoute.path));
      }
    }
  }

  if (buildIntent === "app") {
    if (!useFollowUpFreeze && !hasBriefRoutes) {
      pushRoute(routes, {
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
      pushRoute(routes, {
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
    pushRoute(routes, {
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
 * In-place dedupe of locale-alternate `PlannedRoute` pairs (e.g. `/blog` vs
 * `/blogg`) before the route plan is sent to the LLM. Without this, a brief
 * defining `/blogg` plus a scaffold/prompt-pattern adding `/blog` produces a
 * route plan with both variants — the LLM then often emits inconsistent
 * `<Link href="/blog/${slug}">` against an actual `/blogg/[slug]` route,
 * which fails the verifier's `navigation-placeholder-actions` rule.
 *
 * Kept route preserves its existing `name`, `intent`, and `required` flags;
 * the dropped variant's `required` flag is OR-merged into the kept one.
 */
function dedupePlannedRoutesInPlaceByLocale(
  routes: PlannedRoute[],
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

export function extractAppRoutePathsFromFilePaths(filePaths: string[]): string[] {
  const routes = new Set<string>();
  for (const rawFilePath of filePaths) {
    const rawName = rawFilePath.replace(/^\/+/, "");
    if (/^page\.(t|j)sx?$/.test(rawName)) {
      routes.add("/");
      continue;
    }
    let rest: string | null = null;
    if (rawName.startsWith("src/app/")) rest = rawName.slice("src/app/".length);
    if (rawName.startsWith("app/")) rest = rawName.slice("app/".length);
    if (!rest) continue;
    if (!/page\.(t|j)sx?$/.test(rest)) continue;
    const parts = rest.split("/");
    parts.pop();
    const segments = parts
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
      .filter((segment) => !segment.startsWith("@"));
    const route = `/${segments.join("/")}`;
    routes.add(route === "/" ? "/" : route.replace(/\/+$/, ""));
  }
  return Array.from(routes);
}

export function routePatternToRegex(route: string): RegExp {
  const cleaned = normalizeRoutePath(route);
  if (cleaned === "/") return /^\/$/;
  const segments = cleaned.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      pattern += "(?:/.*)?";
      break;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      pattern += "/.+";
      continue;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      pattern += "/[^/]+";
      continue;
    }
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function dynamicPrefixCoversPath(actualRoute: string, plannedPath: string): boolean {
  const actual = normalizeRoutePath(actualRoute);
  const planned = normalizeRoutePath(plannedPath);
  if (actual === planned) return true;

  const segments = actual.split("/").filter(Boolean);
  const firstDynamicIndex = segments.findIndex(
    (segment) =>
      (segment.startsWith("[") && segment.endsWith("]")) ||
      (segment.startsWith("[...") && segment.endsWith("]")) ||
      (segment.startsWith("[[...") && segment.endsWith("]]")),
  );
  if (firstDynamicIndex < 0) return false;

  const prefixSegments = segments.slice(0, firstDynamicIndex);
  const prefixPath = prefixSegments.length > 0 ? `/${prefixSegments.join("/")}` : "/";
  return planned === prefixPath;
}

export function findMissingPlannedRoutes(
  routePlan: RoutePlan | null | undefined,
  actualRoutes: string[],
): PlannedRoute[] {
  if (!routePlan || routePlan.routes.length === 0) return [];
  const normalizedActualRoutes = actualRoutes.map((route) => normalizeRoutePath(route));
  const matchers = normalizedActualRoutes.map(routePatternToRegex);
  return routePlan.routes.filter((route) => {
    if (!route.required) return false;
    const plannedPath = normalizeRoutePath(route.path);
    return !matchers.some((matcher, index) => {
      if (matcher.test(plannedPath)) return true;
      return dynamicPrefixCoversPath(normalizedActualRoutes[index]!, plannedPath);
    });
  });
}
