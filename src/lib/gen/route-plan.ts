import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "./scaffolds/types";

export type RoutePlanSiteType = "one-page" | "brochure" | "content-heavy" | "app-shell";
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
  if (
    siteType !== "one-page" &&
    siteType !== "brochure" &&
    siteType !== "content-heavy" &&
    siteType !== "app-shell"
  ) {
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
    path: "/om-oss",
    name: "Om oss",
    intent: "Build trust and explain the company or creator. File: app/om-oss/page.tsx",
  },
  {
    match: /\b(about|company|story)\b/i,
    path: "/om-oss",
    name: "Om oss",
    intent: "Build trust and explain the company or creator. Swedish slug: /om-oss. File: app/om-oss/page.tsx",
  },
  {
    match: /\b(booking\s+page|bookings?\s+page|bokningssida|bokningssidan|bookings?|booking|boka|reservation|reserve)\b/i,
    path: "/boka",
    name: "Boka",
    intent: "Provide a dedicated booking/reservation flow. File: app/boka/page.tsx",
  },
  { match: /\b(services?\s+page|tjänste?r?\s*sida|our services|våra tjänster)\b/i, path: "/tjanster", name: "Tjänster", intent: "Explain offers, packages, or capabilities. File: app/tjanster/page.tsx" },
  { match: /\b(pricing|price|pris|priser|billing)\b/i, path: "/priser", name: "Priser", intent: "Show pricing, plans, or billing details. File: app/priser/page.tsx" },
  { match: /\b(contact|kontakta|kontakt|kontaktsida|kontaktsidan)\b/i, path: "/kontakt", name: "Kontakt", intent: "Capture leads or contact requests. File: app/kontakt/page.tsx" },
  { match: /\b(blog|blogg|articles?|newsletter)\b/i, path: "/blogg", name: "Blogg", intent: "Publish articles, updates, or editorial content. File: app/blogg/page.tsx" },
  { match: /\b(docs|documentation|kunskapsbank|guide|guides)\b/i, path: "/docs", name: "Docs", intent: "Provide structured documentation or help content. File: app/docs/page.tsx" },
  { match: /\b(support|help center|faq|kundservice)\b/i, path: "/support", name: "Support", intent: "Answer common questions and support flows. File: app/support/page.tsx" },
  { match: /\b(portfolio|case study|case studies|work|projekt)\b/i, path: "/projekt", name: "Projekt", intent: "Show portfolio pieces, projects, or case studies. File: app/projekt/page.tsx" },
  { match: /\b(team\s+page|employees|staff\s+page|medarbetare\s*sida|our team|vårt team)\b/i, path: "/teamet", name: "Teamet", intent: "Introduce people behind the company or product. File: app/teamet/page.tsx" },
  { match: /\b(testimonial|reviews|recensioner|omdömen)\b/i, path: "/omdomen", name: "Omdömen", intent: "Show social proof and customer outcomes. File: app/omdomen/page.tsx" },
  { match: /\b(shop|store|butik|products|product|catalog|katalog)\b/i, path: "/produkter", name: "Produkter", intent: "Show product catalog or product overview. File: app/produkter/page.tsx" },
  { match: /\b(cart|varukorg)\b/i, path: "/varukorg", name: "Varukorg", intent: "Show selected products before checkout. File: app/varukorg/page.tsx" },
  { match: /\b(checkout|kassa)\b/i, path: "/kassa", name: "Kassa", intent: "Complete the purchase flow. File: app/kassa/page.tsx" },
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
  { match: /\b(report|reports|analytics|metrics|statistik)\b/i, path: "/reports", name: "Reports", intent: "Show analytics, reports, or metrics." },
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
  /\b(?:lägg till|skapa)\b[\s\S]{0,32}\b(?:en\s+ny\s+|ny\s+)?(?:\w*sida|route)\b/i,
  /\b(?:ny\s+)(?:\w*sida|route)\b/i,
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
        path: "/blogg",
        name: "Blogg",
        intent: "Keep an editorial route for articles and archives. File: app/blogg/page.tsx",
        required: buildIntent !== "app",
      });
      break;
    case "ecommerce":
      pushRoute(routes, {
        path: "/produkter",
        name: "Produkter",
        intent: "Keep a storefront route for the product catalog. File: app/produkter/page.tsx",
        required: true,
      });
      pushRoute(routes, {
        path: "/varukorg",
        name: "Varukorg",
        intent: "Keep a cart route for purchase flow continuity. File: app/varukorg/page.tsx",
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
}): RoutePlan {
  const { prompt, buildIntent, brief, resolvedScaffold, generationMode, existingRoutePaths = [] } = params;
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

  if (hasBriefRoutes) {
    if (useFollowUpFreeze && !explicitAddRouteIntent) {
      const existingSet = new Set(routes.map((route) => normalizeRoutePath(route.path)));
      for (const briefRoute of briefRoutes) {
        const normalizedBriefPath = normalizeRoutePath(briefRoute.path);
        if (!existingSet.has(normalizedBriefPath)) continue;
        pushRoute(routes, briefRoute);
      }
    } else {
      for (const briefRoute of briefRoutes) {
        pushRoute(routes, briefRoute);
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

  if (useFollowUpFreeze && explicitRouteRemovals.size > 0) {
    for (let i = routes.length - 1; i >= 0; i -= 1) {
      const normalizedPath = normalizeRoutePath(routes[i]!.path);
      if (normalizedPath !== "/" && explicitRouteRemovals.has(normalizedPath)) {
        routes.splice(i, 1);
      }
    }
  }

  const pathsBeforeScaffoldDefaults = new Set(
    routes.map((route) => normalizeRoutePath(route.path)),
  );
  if (!useFollowUpFreeze) {
    applyScaffoldDefaults(buildIntent, resolvedScaffold, routes);
  }
  const scaffoldAddedRoutes = routes.some(
    (route) => !pathsBeforeScaffoldDefaults.has(normalizeRoutePath(route.path)),
  );

  const sources: RoutePlanSource[] = [];
  if (hasBriefRoutes) sources.push("brief");
  if (promptAddedRoutes || sources.length === 0) sources.push("prompt");
  if (scaffoldAddedRoutes) sources.push("scaffold");
  const primarySource: RoutePlanSource = hasBriefRoutes
    ? "brief"
    : scaffoldAddedRoutes
      ? "scaffold"
      : "prompt";

  const reason = useFollowUpFreeze
    ? explicitRouteRemovals.size > 0
      ? "Follow-up mode preserves existing App Router routes by default, while explicit route-removal intent can remove selected pages."
      : "Follow-up mode preserves existing App Router routes by default; only explicit user intent should add new pages."
    : hasBriefRoutes && promptAddedRoutes
      ? "Route structure merges brief-defined pages with explicit prompt route requests."
      : hasBriefRoutes && scaffoldAddedRoutes
        ? "Route structure starts from brief pages and adds scaffold defaults when relevant."
    : scaffoldAddedRoutes
    ? "Scaffold defaults added routes on top of prompt-inferred structure; keep real App Router pages for each planned path."
    : routes.length > 1
      ? "Prompt analysis suggests a multi-route build; keep real App Router pages instead of collapsing everything into one page."
      : "Prompt analysis suggests a compact default route structure unless the model has strong evidence to add more pages.";

  return {
    provenance: { primarySource, sources },
    siteType: inferSiteType(buildIntent, routes.length),
    reason,
    routes,
  };
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

function routePatternToRegex(route: string): RegExp {
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
