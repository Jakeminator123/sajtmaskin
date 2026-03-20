import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "./scaffolds/types";
import type { SiteProfile } from "./scaffolds/site-profile";

export type RoutePlanSiteType = "one-page" | "brochure" | "content-heavy" | "app-shell";
export type RoutePlanSource = "brief" | "prompt" | "scaffold";

export interface PlannedRoute {
  path: string;
  name: string;
  intent: string;
  required: boolean;
}

export interface RoutePlan {
  source: RoutePlanSource;
  siteType: RoutePlanSiteType;
  reason: string;
  routes: PlannedRoute[];
}

export function normalizePlannedRoutePath(path: string): string {
  return normalizeRoutePath(path);
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
  { match: /\b(about|om oss|company|story)\b/i, path: "/about", name: "About", intent: "Build trust and explain the company or creator." },
  { match: /\b(service|services|tjänst|tjänster)\b/i, path: "/services", name: "Services", intent: "Explain offers, packages, or capabilities." },
  { match: /\b(pricing|price|pris|priser|billing)\b/i, path: "/pricing", name: "Pricing", intent: "Show pricing, plans, or billing details." },
  { match: /\b(contact|kontakta|kontakt|book|booking|boka)\b/i, path: "/contact", name: "Contact", intent: "Capture leads or contact requests." },
  { match: /\b(blog|blogg|article|articles|news|newsletter)\b/i, path: "/blog", name: "Blog", intent: "Publish articles, updates, or editorial content." },
  { match: /\b(docs|documentation|kunskapsbank|guide|guides)\b/i, path: "/docs", name: "Docs", intent: "Provide structured documentation or help content." },
  { match: /\b(support|help center|faq|kundservice)\b/i, path: "/support", name: "Support", intent: "Answer common questions and support flows." },
  { match: /\b(portfolio|case study|case studies|work|projekt)\b/i, path: "/work", name: "Work", intent: "Show portfolio pieces, projects, or case studies." },
  { match: /\b(team|employees|staff|medarbetare)\b/i, path: "/team", name: "Team", intent: "Introduce people behind the company or product." },
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
  { match: /\b(report|reports|analytics|metrics|statistik)\b/i, path: "/reports", name: "Reports", intent: "Show analytics, reports, or metrics." },
  { match: /\b(login|inlogg|auth|signup|sign up|register|registr)\b/i, path: "/login", name: "Login", intent: "Provide authentication entry for the application." },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoutePath(value: string): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
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

function inferSiteType(buildIntent: BuildIntent, routeCount: number): RoutePlanSiteType {
  if (buildIntent === "app") return "app-shell";
  if (routeCount <= 1) return "one-page";
  if (routeCount <= 5) return "brochure";
  return "content-heavy";
}

function buildRoutesFromBrief(brief: Record<string, unknown> | null | undefined, buildIntent: BuildIntent): RoutePlan | null {
  const pages = Array.isArray((brief as { pages?: unknown })?.pages)
    ? ((brief as { pages?: BriefPageLike[] }).pages ?? [])
    : [];
  if (pages.length === 0) return null;

  const routes: PlannedRoute[] = [];
  for (const page of pages.slice(0, 10)) {
    const path = normalizeRoutePath(asString(page?.path) || "/");
    const name = asString(page?.name) || (path === "/" ? "Home" : "Page");
    const intent = asString(page?.purpose) || `Implement the ${name} page as planned in the brief.`;
    pushRoute(routes, {
      path,
      name,
      intent,
      required: true,
    });
  }

  return {
    source: "brief",
    siteType: inferSiteType(buildIntent, routes.length),
    reason: "Using explicit pages from the current brief/spec instead of guessing route structure from the prompt.",
    routes,
  };
}

function applyPromptPatterns(prompt: string, patterns: Array<{ match: RegExp; path: string; name: string; intent: string }>, routes: PlannedRoute[]) {
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
}

function applyScaffoldDefaults(buildIntent: BuildIntent, resolvedScaffold: ScaffoldManifest | null, routes: PlannedRoute[]) {
  switch (resolvedScaffold?.family) {
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

const CATEGORY_ROUTE_DEFAULTS: Record<string, PlannedRoute[]> = {
  "hair-salon": [
    { path: "/services", name: "Tjänster", intent: "Show available treatments, prices, and service descriptions.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact info, opening hours, and optional booking link.", required: true },
  ],
  "beauty-wellness": [
    { path: "/services", name: "Behandlingar", intent: "Show available treatments and pricing.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact info with optional booking form.", required: true },
  ],
  "restaurant-cafe": [
    { path: "/menu", name: "Meny", intent: "Show the food and drink menu.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Location, opening hours, and optional table reservation.", required: true },
  ],
  "accounting-firm": [
    { path: "/services", name: "Tjänster", intent: "Describe service areas: bookkeeping, tax, advisory.", required: true },
    { path: "/about", name: "Om oss", intent: "Team, expertise, and trust-building information.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact form and office details.", required: true },
  ],
  "law-firm": [
    { path: "/services", name: "Rättsområden", intent: "Describe legal practice areas.", required: true },
    { path: "/about", name: "Om byrån", intent: "Team, credentials, and firm history.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact form and office details.", required: true },
  ],
  "construction": [
    { path: "/services", name: "Tjänster", intent: "Construction services overview with examples.", required: true },
    { path: "/projects", name: "Projekt", intent: "Photo gallery of completed projects.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact and quote request form.", required: true },
  ],
  "cleaning-service": [
    { path: "/services", name: "Tjänster", intent: "Cleaning service packages and pricing.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact and booking form.", required: true },
  ],
  "rural-general-store": [
    { path: "/products", name: "Sortiment", intent: "Overview of product categories and local specialties.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Location, opening hours, and directions.", required: true },
  ],
  "car-workshop": [
    { path: "/services", name: "Tjänster", intent: "Service types, pricing, and booking.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Location, opening hours, and contact.", required: true },
  ],
  "advertising-agency": [
    { path: "/services", name: "Tjänster", intent: "Service offerings and specializations.", required: true },
    { path: "/work", name: "Case", intent: "Portfolio of previous campaigns and projects.", required: true },
    { path: "/about", name: "Om oss", intent: "Team and agency story.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact form.", required: true },
  ],
  "medical-clinic": [
    { path: "/services", name: "Behandlingar", intent: "List available treatments, examinations, and healthcare services.", required: true },
    { path: "/team", name: "Vårt team", intent: "Doctor/staff profiles with credentials and specialties.", required: true },
    { path: "/about", name: "Om kliniken", intent: "Clinic history, values, and patient-facing information.", required: false },
    { path: "/contact", name: "Kontakt", intent: "Address, opening hours, phone, and appointment booking.", required: true },
  ],
  "dental-clinic": [
    { path: "/services", name: "Behandlingar", intent: "Dental treatments, pricing, and descriptions.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Address, opening hours, and booking.", required: true },
  ],
  "school-education": [
    { path: "/courses", name: "Kurser", intent: "Course catalog with descriptions, schedules, and enrollment info.", required: true },
    { path: "/teachers", name: "Lärare", intent: "Teacher/instructor profiles.", required: true },
    { path: "/enrollment", name: "Ansökan", intent: "Application form, dates, and requirements.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact info and campus directions.", required: true },
  ],
  "event-agency": [
    { path: "/schedule", name: "Schema", intent: "Event schedule with times, speakers, and sessions.", required: true },
    { path: "/speakers", name: "Talare", intent: "Speaker profiles with bios and topics.", required: true },
    { path: "/tickets", name: "Biljetter", intent: "Ticket tiers, pricing, and registration.", required: true },
    { path: "/venue", name: "Plats", intent: "Venue info, directions, and practical details.", required: true },
  ],
  "electrician": [
    { path: "/services", name: "Tjänster", intent: "Electrical services and pricing.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact and quote request.", required: true },
  ],
  "plumber-hvac": [
    { path: "/services", name: "Tjänster", intent: "Plumbing/HVAC services and emergency contact.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact and emergency number.", required: true },
  ],
  "painter": [
    { path: "/services", name: "Tjänster", intent: "Painting services with examples.", required: true },
    { path: "/projects", name: "Projekt", intent: "Before/after gallery of completed work.", required: false },
    { path: "/contact", name: "Kontakt", intent: "Contact and quote request.", required: true },
  ],
  "transport-logistics": [
    { path: "/services", name: "Tjänster", intent: "Transport and logistics services.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact and booking.", required: true },
  ],
  "real-estate": [
    { path: "/services", name: "Tjänster", intent: "Real estate services: buying, selling, valuation.", required: true },
    { path: "/listings", name: "Objekt", intent: "Current property listings.", required: true },
    { path: "/about", name: "Om oss", intent: "Team and agency credentials.", required: false },
    { path: "/contact", name: "Kontakt", intent: "Contact form and office info.", required: true },
  ],
  "consulting": [
    { path: "/services", name: "Tjänster", intent: "Consulting areas and methodology.", required: true },
    { path: "/about", name: "Om oss", intent: "Team, credentials, and approach.", required: true },
    { path: "/contact", name: "Kontakt", intent: "Contact form.", required: true },
  ],
  "insurance": [
    { path: "/services", name: "Försäkringar", intent: "Insurance types and coverage.", required: true },
    { path: "/about", name: "Om oss", intent: "Company information and trust signals.", required: false },
    { path: "/contact", name: "Kontakt", intent: "Contact and claims.", required: true },
  ],
};

function applyCategoryDefaults(category: string, routes: PlannedRoute[]): void {
  const defaults = CATEGORY_ROUTE_DEFAULTS[category];
  if (!defaults) return;
  for (const route of defaults) {
    pushRoute(routes, route);
  }
}

function trimRoutesToBucket(routes: PlannedRoute[], pageBucket: number): PlannedRoute[] {
  if (routes.length <= pageBucket) return routes;
  const required = routes.filter((r) => r.required);
  const optional = routes.filter((r) => !r.required);
  const trimmed = [...required];
  for (const route of optional) {
    if (trimmed.length >= pageBucket) break;
    trimmed.push(route);
  }
  return trimmed.slice(0, pageBucket);
}

export function buildRoutePlan(params: {
  prompt: string;
  buildIntent: BuildIntent;
  brief?: Record<string, unknown> | null;
  resolvedScaffold: ScaffoldManifest | null;
  siteProfile?: SiteProfile | null;
}): RoutePlan {
  const { prompt, buildIntent, brief, resolvedScaffold, siteProfile } = params;
  const briefPlan = buildRoutesFromBrief(brief, buildIntent);
  if (briefPlan) return briefPlan;

  const routes: PlannedRoute[] = [];
  if (buildIntent === "app") {
    pushRoute(routes, {
      path: "/",
      name: "Dashboard",
      intent: "Use the root route as the main product workspace or dashboard.",
      required: true,
    });
    applyPromptPatterns(prompt, APP_ROUTE_PATTERNS, routes);
  } else {
    pushRoute(routes, {
      path: "/",
      name: "Home",
      intent: "Use the root route for the primary landing page or homepage.",
      required: true,
    });
    applyPromptPatterns(prompt, WEBSITE_ROUTE_PATTERNS, routes);
  }

  applyScaffoldDefaults(buildIntent, resolvedScaffold, routes);

  if (siteProfile && siteProfile.confidence !== "low") {
    applyCategoryDefaults(siteProfile.businessCategory, routes);
  }

  const pageBucket = siteProfile?.pageBucket ?? null;
  const finalRoutes = pageBucket ? trimRoutesToBucket(routes, pageBucket) : routes;

  return {
    source: resolvedScaffold ? "prompt" : "prompt",
    siteType: inferSiteType(buildIntent, finalRoutes.length),
    reason:
      finalRoutes.length > 1
        ? `Prompt analysis suggests a multi-route build (page budget: ${pageBucket ?? "auto"}); keep real App Router pages instead of collapsing everything into one page.`
        : "Prompt analysis suggests a compact default route structure unless the model has strong evidence to add more pages.",
    routes: finalRoutes,
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

export function findMissingPlannedRoutes(
  routePlan: RoutePlan | null | undefined,
  actualRoutes: string[],
): PlannedRoute[] {
  if (!routePlan || routePlan.routes.length === 0) return [];
  const matchers = actualRoutes.map(routePatternToRegex);
  return routePlan.routes.filter((route) => {
    if (!route.required) return false;
    const plannedPath = normalizeRoutePath(route.path);
    return !matchers.some((matcher) => matcher.test(plannedPath));
  });
}
