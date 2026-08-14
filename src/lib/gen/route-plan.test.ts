import { describe, expect, it } from "vitest";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getScaffoldById, getScaffoldIds } from "./scaffolds/registry";
import {
  applyScaffoldDefaults,
  collectScaffoldRequiredPaths,
  extractExplicitNamedPages,
  hasExplicitAddRouteIntent,
  neutralizeExplicitPageNameLiterals,
} from "./route-plan/planning-helpers";
import {
  ABSOLUTE_MAX_ROUTES_PER_GENERATION,
  MAX_ROUTES_PER_GENERATION,
} from "./route-plan/route-plan-builder";
import {
  countsTowardPageCeiling,
  extractAppRoutePathsFromFilePaths,
  getRoutePlanDepth,
} from "./route-plan/path-utils";
import {
  buildRoutePlan,
  deduplicateLocaleAlternateRoutes,
  detectExplicitPageCount,
  findSupersededScaffoldRoutes,
  findMissingPlannedRoutes,
  parseRoutePlanFromUnknown,
} from "./route-plan";

describe("buildRoutePlan", () => {
  const websiteBase = {
    buildIntent: "website" as const,
    resolvedScaffold: null,
    brief: undefined as undefined,
  };

  it("maps Swedish om oss to /om", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Vi behöver en tydlig sida om oss för byrån.",
    });
    expect(plan.routes.some((r) => r.path === "/om" && r.name === "Om oss")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/about")).toBe(false);
  });

  it("maps English about/company to /about", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Add an about page and our company story.",
    });
    expect(plan.routes.some((r) => r.path === "/about" && r.name === "About")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/om")).toBe(false);
  });

  it("does not add /services for a simple one-page bakery prompt", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "En enkelsidig landningssida för ett bageri i Majorna, Göteborg.",
    });
    expect(plan.routes.some((r) => r.path === "/services")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/team")).toBe(false);
    expect(plan.siteType).toBe("one-page");
  });

  it("adds /services when the prompt explicitly says services page", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg en sajt med en services page där vi listar allt vi erbjuder.",
    });
    expect(plan.routes.some((r) => r.path === "/services")).toBe(true);
  });

  it("does not add /blog for incidental use of 'post' or 'article'", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Vi ska posta information om vårt bageri online.",
    });
    expect(plan.routes.some((r) => r.path === "/blog")).toBe(false);
  });

  it("adds /blog when the prompt explicitly says blog", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Sajten behöver en blogg där vi delar recept.",
    });
    expect(plan.routes.some((r) => r.path === "/blog")).toBe(true);
  });

  it("maps booking intent to /booking instead of /contact", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Skapa en bokningssida för reservationer och tider.",
    });
    expect(plan.routes.some((r) => r.path === "/booking")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(false);
  });

  it("normalizes colon-style dynamic brief paths into App Router segment syntax", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { path: "/produkt/:slug", name: "Produkt", purpose: "Produktdetalj" },
        ],
      },
    });
    expect(plan.routes.some((r) => r.path === "/produkt/[slug]")).toBe(true);
  });

  it("uses brief-based routes when brief has pages", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "En sajt med massa grejer.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
        ],
      },
    });
    expect(plan.provenance.primarySource).toBe("brief");
    expect(plan.provenance.sources).toEqual(["brief"]);
    expect(plan.routes).toHaveLength(1);
    expect(plan.routes[0].path).toBe("/");
  });

  it("infers route paths from brief page names when path is missing", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { name: "Home", purpose: "Start" },
          { name: "About Us", purpose: "Om oss" },
          { name: "Contact", purpose: "Kontakt" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/about-us", "/contact"]);
    expect(plan.provenance.primarySource).toBe("brief");
  });

  it("falls back to root for brief page without path and name", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { purpose: "Hemsida" },
        ],
      },
    });
    expect(plan.routes).toHaveLength(1);
    expect(plan.routes[0]?.path).toBe("/");
  });

  it("marks route plan source as prompt when scaffold defaults do not add routes", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "En enkelsidig landningssida för ett bageri.",
      resolvedScaffold: getScaffoldById("landing-page"),
    });
    expect(plan.provenance.primarySource).toBe("prompt");
    expect(plan.provenance.sources).toEqual(["prompt"]);
  });

  it("marks route plan source as scaffold when scaffold defaults add routes", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "En enkelsidig landningssida för ett bageri.",
      resolvedScaffold: blogScaffold,
    });
    expect(plan.provenance.primarySource).toBe("scaffold");
    expect(plan.provenance.sources).toEqual(["prompt", "scaffold"]);
    expect(plan.routes.some((r) => r.path === "/blog")).toBe(true);
  });

  it("does not plan /cart from ecommerce scaffold defaults at init", () => {
    const ecommerceScaffold = getScaffoldById("ecommerce");
    expect(ecommerceScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg en webbutik med produkter.",
      resolvedScaffold: ecommerceScaffold,
    });
    expect(plan.routes.some((r) => r.path === "/products")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/cart")).toBe(false);
  });

  it("follow-up keeps existing routes and does not add scaffold defaults by default", () => {
    const ecommerceScaffold = getScaffoldById("ecommerce");
    expect(ecommerceScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Byt hero-text och uppdatera färgerna.",
      resolvedScaffold: ecommerceScaffold,
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/om"]);
    expect(plan.routes.some((r) => r.path === "/products")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/cart")).toBe(false);
    expect(plan.reason).toContain("Follow-up mode preserves existing App Router routes");
  });

  it("follow-up does not add routes from incidental keyword matches without explicit add intent", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Ändra contact text i footern och uppdatera färgerna.",
      resolvedScaffold: getScaffoldById("landing-page"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/om"]);
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(false);
  });

  it("follow-up can still add explicitly requested new routes", () => {
    const ecommerceScaffold = getScaffoldById("ecommerce");
    expect(ecommerceScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Lägg till en tydlig contact-sida.",
      resolvedScaffold: ecommerceScaffold,
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om"],
    });
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/products")).toBe(false);
  });

  it("maps Swedish bilder/galleri keywords to /bilder with unicode word boundaries", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Vi behöver en bilder-sida och ett galleri för foton.",
    });
    expect(plan.routes.some((r) => r.path === "/bilder")).toBe(true);
  });

  it("maps English gallery/images keywords to /gallery", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Add a gallery page for product images.",
    });
    expect(plan.routes.some((r) => r.path === "/gallery")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/bilder")).toBe(false);
  });

  it("explicit page name wins over focus-point PORTFOLIO text (no /work)", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: [
        'Skapa en ny sida som ska heta "Bilder".',
        "",
        "Användarens markerade fokuspunkter i preview:",
        "- Punkt 1: x=12.0%, y=8.0%",
        "  - Träff-text: PORTFOLIO",
        "  - href: #portfolio",
      ].join("\n"),
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((r) => r.path === "/bilder")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/work")).toBe(false);
  });

  it('extracts "en ny sida som ska heta Bilder" as /bilder', () => {
    const named = extractExplicitNamedPages('Skapa en ny sida som ska heta "Bilder".');
    expect(named).toEqual([{ name: "Bilder", path: "/bilder" }]);
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: 'en ny sida som ska heta "Bilder"',
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((r) => r.path === "/bilder")).toBe(true);
  });

  it("does not treat copy-edit ska heta as a new page", () => {
    for (const prompt of [
      'Rubriken ska heta "Välkommen"',
      'Knappen ska heta "Skicka"',
    ]) {
      expect(extractExplicitNamedPages(prompt)).toEqual([]);
      expect(hasExplicitAddRouteIntent(prompt)).toBe(false);
      const plan = buildRoutePlan({
        ...websiteBase,
        prompt,
        generationMode: "followUp",
        existingRoutePaths: ["/"],
      });
      expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
      expect(plan.routes.some((r) => r.path === "/valkommen")).toBe(false);
      expect(plan.routes.some((r) => r.path === "/skicka")).toBe(false);
    }
  });

  it("does not treat incidental English page called phrasing as a new page", () => {
    const prompt = "Fix the login page called from the navbar";
    expect(extractExplicitNamedPages(prompt)).toEqual([]);
    expect(hasExplicitAddRouteIntent(prompt)).toBe(false);
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt,
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
    expect(plan.routes.some((r) => r.path === "/from")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/login")).toBe(false);
  });

  it("extracts English create/new page called|named intents", () => {
    expect(extractExplicitNamedPages('create a page named "Gallery"')).toEqual([
      { name: "Gallery", path: "/gallery" },
    ]);
    expect(extractExplicitNamedPages('new page called "Images"')).toEqual([
      { name: "Images", path: "/images" },
    ]);
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: 'create a page named "Gallery"',
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((r) => r.path === "/gallery")).toBe(true);
  });

  it("neutralizeExplicitPageNameLiterals does not strip short names inside other words", () => {
    const out = neutralizeExplicitPageNameLiterals(
      'Skapa en sida som ska heta "Art". This is part of our contact page.',
      ["Art"],
    );
    expect(out).toContain("part");
    expect(out).toMatch(/contact/i);
    expect(out).not.toMatch(/(?<![\p{L}\p{N}_])Art(?![\p{L}\p{N}_])/u);
  });

  it("explicit short page name Art does not break unrelated keyword routes", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt:
        'Skapa en ny sida som ska heta "Art". Add a contact page as part of the site.',
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((r) => r.path === "/art")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(true);
  });

  it("merges brief routes with prompt-requested additions instead of early returning brief only", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Lägg till en tydlig blog-sida.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
        ],
      },
      resolvedScaffold: getScaffoldById("landing-page"),
    });
    expect(plan.routes.some((r) => r.path === "/om")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/blog")).toBe(true);
    expect(plan.provenance.sources).toEqual(["brief", "prompt"]);
  });

  it("follow-up can remove an existing route when prompt explicitly removes route path", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Ta bort /om route och uppdatera bara startsidan.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om", "/pricing"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/pricing"]);
    expect(plan.reason).toContain("route-removal intent");
  });

  // BUG-SWARM rank 6: the path-mention removal branch ran before the route/page
  // context gate, so "remove <content> on /path" deleted the whole page.
  it("does NOT remove a route when the removal targets content ON that page (Swedish preposition)", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Ta bort den gröna knappen på /priser.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/priser", "/om"],
    });
    expect(plan.routes.some((r) => r.path === "/priser")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/om")).toBe(true);
  });

  it("does NOT remove a route for English 'remove X from /path' content edits", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Remove the hero image from /about and tighten the spacing.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/about", "/pricing"],
    });
    expect(plan.routes.some((r) => r.path === "/about")).toBe(true);
  });

  it("still removes a route for a terse verb-adjacent path removal (no page word needed)", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Ta bort /om.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om", "/pricing"],
    });
    expect(plan.routes.some((r) => r.path === "/om")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/pricing")).toBe(true);
  });

  it("follow-up can remove an existing route when prompt explicitly removes page by name", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Ta bort kontaktsidan och behåll resten oförändrat.",
      resolvedScaffold: getScaffoldById("landing-page"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/contact", "/om"],
    });
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/om")).toBe(true);
  });

  it("does not treat generic 'utan' phrasing as route removal intent", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Gor startsidan utan bokningskansla men behall kontaktsidan.",
      resolvedScaffold: getScaffoldById("landing-page"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/contact", "/om"],
    });
    expect(plan.routes.some((r) => r.path === "/contact")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/om")).toBe(true);
  });

  it("dedupes /blog↔/blogg when brief has /blogg and blog scaffold adds /blog (sv default)", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "En personlig blogg om kaffe och böcker.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/blogg", name: "Blogg", purpose: "Inlägg om vardagsro" },
        ],
      },
      resolvedScaffold: blogScaffold,
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/blogg");
    expect(paths).not.toContain("/blog");
  });

  it("dedupes /blog↔/blogg when prompt-pattern-added /blog meets brief /blogg", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Vi behöver en blog-sida för nyheter.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/blogg", name: "Blogg", purpose: "Nyheter" },
        ],
      },
      resolvedScaffold: null,
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/blogg");
    expect(paths).not.toContain("/blog");
  });

  it("keeps /blog when locale is explicitly en even with /blogg present", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "We need a blog page.",
      brief: {
        pages: [
          { path: "/", name: "Home", purpose: "Landing" },
          { path: "/blogg", name: "Blogg", purpose: "Posts" },
        ],
      },
      resolvedScaffold: null,
      locale: "en",
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/blog");
    expect(paths).not.toContain("/blogg");
  });

  it("preserves required=true from dropped variant onto kept locale alternate", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Personlig blogg.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/blogg", name: "Blogg", purpose: "Inlägg" },
        ],
      },
      resolvedScaffold: blogScaffold,
    });
    const bloggRoute = plan.routes.find((r) => r.path === "/blogg");
    expect(bloggRoute?.required).toBe(true);
  });

  it("parseRoutePlanFromUnknown accepts legacy JSON with source only", () => {
    const parsed = parseRoutePlanFromUnknown({
      source: "brief",
      siteType: "one-page",
      reason: "legacy",
      routes: [{ path: "/", name: "Hem", intent: "Home", required: true }],
    });
    expect(parsed?.provenance.primarySource).toBe("brief");
    expect(parsed?.provenance.sources).toEqual(["brief"]);
  });

  it("parseRoutePlanFromUnknown keeps legacy routes even when intent is missing", () => {
    const parsed = parseRoutePlanFromUnknown({
      source: "prompt",
      siteType: "brochure",
      reason: "legacy-missing-intent",
      routes: [{ path: "/contact", name: "Contact", required: true }],
    });
    expect(parsed?.routes).toEqual([
      {
        path: "/contact",
        name: "Contact",
        intent: "Implement the Contact route as planned.",
        required: true,
      },
    ]);
  });
});

describe("buildRoutePlan app auth mappings", () => {
  const appBase = {
    buildIntent: "app" as const,
    resolvedScaffold: null,
    brief: undefined as undefined,
  };

  it("adds /signup for signup/register prompts", () => {
    const plan = buildRoutePlan({
      ...appBase,
      prompt: "Lägg till signup och registrering i appen.",
    });
    expect(plan.routes.some((r) => r.path === "/signup")).toBe(true);
  });

  it("adds /forgot-password for password reset prompts", () => {
    const plan = buildRoutePlan({
      ...appBase,
      prompt: "Vi behöver forgot password och återställ lösenord.",
    });
    expect(plan.routes.some((r) => r.path === "/forgot-password")).toBe(true);
  });
});

describe("findMissingPlannedRoutes", () => {
  it("does not warn when a dynamic route covers the planned static parent path", () => {
    const routePlan = {
      provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
      siteType: "brochure" as const,
      reason: "test",
      routes: [
        { path: "/blog", name: "Blog", intent: "Blog archive", required: true },
      ],
    };

    const missing = findMissingPlannedRoutes(routePlan, ["/blog/[slug]"]);
    expect(missing).toEqual([]);
  });

  it("keeps warning when planned route is truly missing", () => {
    const routePlan = {
      provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
      siteType: "brochure" as const,
      reason: "test",
      routes: [
        { path: "/pricing", name: "Pricing", intent: "Pricing details", required: true },
      ],
    };

    const missing = findMissingPlannedRoutes(routePlan, ["/blog/[slug]"]);
    expect(missing.map((route) => route.path)).toEqual(["/pricing"]);
  });
});

describe("buildRoutePlan — dashboard scaffold with app intent", () => {
  it("produces app-shell siteType and Dashboard root for dashboard scaffold + app intent", () => {
    const dashboardScaffold = getScaffoldById("dashboard");
    expect(dashboardScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "En dashboard för att granska grafer och aktier med logga in och mörkt tema",
      buildIntent: "app",
      resolvedScaffold: dashboardScaffold,
    });
    expect(plan.siteType).toBe("app-shell");
    expect(plan.routes[0]?.name).toBe("Dashboard");
    expect(plan.routes.some((r) => r.path === "/login")).toBe(true);
  });

  it("does not produce website-style brochure routes for dashboard scaffold + app intent", () => {
    const dashboardScaffold = getScaffoldById("dashboard");
    expect(dashboardScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "Bygg en säkerhets-dashboard med grafer",
      buildIntent: "app",
      resolvedScaffold: dashboardScaffold,
    });
    expect(plan.routes.every((r) => r.name !== "Home")).toBe(true);
    const websiteOnlyPaths = ["/about", "/om", "/services", "/testimonials", "/contact"];
    for (const path of websiteOnlyPaths) {
      expect(plan.routes.some((r) => r.path === path)).toBe(false);
    }
  });

  it("adds /settings scaffold default for dashboard + app intent", () => {
    const dashboardScaffold = getScaffoldById("dashboard");
    expect(dashboardScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "Instrumentpanel med statistik",
      buildIntent: "app",
      resolvedScaffold: dashboardScaffold,
    });
    expect(plan.routes.some((r) => r.path === "/settings")).toBe(true);
  });

  it("adds /analytics scaffold default for dashboard + app intent", () => {
    const dashboardScaffold = getScaffoldById("dashboard");
    expect(dashboardScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "Dashboard-app för besöksdata",
      buildIntent: "app",
      resolvedScaffold: dashboardScaffold,
    });
    expect(plan.routes.some((r) => r.path === "/analytics")).toBe(true);
  });

  it("maps analytics keyword to /analytics instead of /reports for app intent", () => {
    const plan = buildRoutePlan({
      prompt: "App med analytics och statistik",
      buildIntent: "app",
      resolvedScaffold: null,
    });
    expect(plan.routes.some((r) => r.path === "/analytics")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/reports")).toBe(false);
  });
});

describe("deduplicateLocaleAlternateRoutes", () => {
  it("route-plan deduplicates /contact + /kontakt", () => {
    expect(
      deduplicateLocaleAlternateRoutes(["/", "/contact", "/kontakt", "/meny"], "sv"),
    ).toEqual(["/", "/kontakt", "/meny"]);
  });

  it("keeps the English variant when locale is en", () => {
    expect(
      deduplicateLocaleAlternateRoutes(["/", "/contact", "/kontakt", "/meny"], "en"),
    ).toEqual(["/", "/contact", "/meny"]);
  });

  it("dedupes /about ↔ /om and /services ↔ /tjanster pairs", () => {
    expect(
      deduplicateLocaleAlternateRoutes(
        ["/", "/about", "/om", "/services", "/tjanster"],
        "sv",
      ),
    ).toEqual(["/", "/om", "/tjanster"]);
  });

  it("dedupes /blog ↔ /blogg", () => {
    expect(
      deduplicateLocaleAlternateRoutes(["/", "/blog", "/blogg"], "sv"),
    ).toEqual(["/", "/blogg"]);
    expect(
      deduplicateLocaleAlternateRoutes(["/", "/blog", "/blogg"], "en"),
    ).toEqual(["/", "/blog"]);
  });

  it("leaves routes alone when only one variant is present", () => {
    expect(deduplicateLocaleAlternateRoutes(["/", "/kontakt"], "sv")).toEqual([
      "/",
      "/kontakt",
    ]);
    expect(deduplicateLocaleAlternateRoutes(["/", "/about"], "en")).toEqual([
      "/",
      "/about",
    ]);
  });

  it("normalizes input paths and removes duplicates", () => {
    expect(
      deduplicateLocaleAlternateRoutes(["/", "/contact/", "/kontakt"], "sv"),
    ).toEqual(["/", "/kontakt"]);
  });
});

// Regression: the blog scaffold ships `/blog`, the Swedish plan settles on
// `/blogg`, and the model emits `app/blogg/**`. Both used to survive into the
// finished project, leaving `/blog` and `/blog/[slug]` with nothing linking to
// them (2026-07-31 — the user saw six pages, three unreachable).
describe("findSupersededScaffoldRoutes", () => {
  it("supersedes the scaffold's /blog when the model emitted /blogg", () => {
    expect(
      findSupersededScaffoldRoutes(["/", "/blogg", "/blogg/[slug]"], ["/", "/blog"]),
    ).toEqual(["/blog"]);
  });

  it("supersedes every alternate the model replaced, not just the first", () => {
    expect(
      findSupersededScaffoldRoutes(["/", "/om", "/blogg"], ["/", "/about", "/blog"]),
    ).toEqual(["/about", "/blog"]);
  });

  it("supersedes nothing when the model kept the scaffold's own route", () => {
    expect(
      findSupersededScaffoldRoutes(["/", "/blog", "/blog/[slug]"], ["/", "/blog"]),
    ).toEqual([]);
  });

  it("never supersedes when the model deliberately emitted both variants", () => {
    expect(findSupersededScaffoldRoutes(["/", "/blog", "/blogg"], ["/", "/blog"])).toEqual(
      [],
    );
  });

  // The mirror case. A locale-parameterised version defaulting to `sv` reported
  // nothing here, so an English build silently kept the orphaned Swedish page.
  it("supersedes a Swedish scaffold route when the model emitted the English one", () => {
    expect(findSupersededScaffoldRoutes(["/", "/contact"], ["/", "/kontakt"])).toEqual([
      "/kontakt",
    ]);
  });

  it("supersedes nothing when the scaffold does not ship the alternate", () => {
    expect(findSupersededScaffoldRoutes(["/", "/blogg"], ["/", "/meny"])).toEqual([]);
  });

  it("returns nothing for a project with no locale-alternate routes", () => {
    expect(findSupersededScaffoldRoutes(["/", "/meny", "/galleri"], ["/", "/meny"])).toEqual(
      [],
    );
  });
});

describe("detectExplicitPageCount", () => {
  const TVSPEL_BLOG_ONE_PAGE_PROMPT =
    "En hemsida om tvspel. Jag vill ha en sajt som är en blogg. Bloggen ska bara finnas på den enda sida som faktist min sajt ska bestå av";

  it("detects Swedish page count", () => {
    expect(detectExplicitPageCount("Jag vill ha 3 sidor")).toBe(3);
    expect(detectExplicitPageCount("5 sidor med bra design")).toBe(5);
    expect(detectExplicitPageCount("en sida om kakor")).toBeNull();
  });

  it("detects English page count", () => {
    expect(detectExplicitPageCount("I want 4 pages")).toBe(4);
    expect(detectExplicitPageCount("create a 2 page site")).toBe(2);
  });

  it("rejects unreasonable counts", () => {
    expect(detectExplicitPageCount("jag vill ha 0 sidor")).toBeNull();
    expect(detectExplicitPageCount("50 pages of nonsense")).toBeNull();
  });

  it.each([
    ["2 sidor", 2],
    ["5 pages", 5],
  ] as const)("still detects digit counts: %s", (prompt, expected) => {
    expect(detectExplicitPageCount(prompt)).toBe(expected);
  });

  it.each([
    ["två sidor", 2],
    ["tre sidor", 3],
    ["fyra sidor", 4],
    ["fem sidor", 5],
    ["sex sidor", 6],
    ["sju sidor", 7],
    ["åtta sidor", 8],
    ["nio sidor", 9],
    ["tio sidor", 10],
    ["two pages", 2],
    ["three pages", 3],
    ["four pages", 4],
    ["five pages", 5],
    ["six pages", 6],
    ["seven pages", 7],
    ["eight pages", 8],
    ["nine pages", 9],
    ["ten pages", 10],
    ["two routes", 2],
    ["tre vyer", 3],
  ] as const)("detects plural number words: %s", (prompt, expected) => {
    expect(detectExplicitPageCount(prompt)).toBe(expected);
  });

  it.each([
    ["bara en sida", 1],
    ["endast en sida", 1],
    ["en enda sida", 1],
    ["skapa en enda sida", 1],
    ["den enda sida som sajten består av", 1],
    ["enbart en sida", 1],
    ["en (1) sida", 1],
    ["max en sida", 1],
    ["högst en sida", 1],
    ["bara på en sida", 1],
    ["allt på en sida", 1],
    ["en sida totalt", 1],
    ["only one page", 1],
    ["just one page", 1],
    ["a single page", 1],
    ["single-page", 1],
    ["one page only", 1],
    ["just on one page", 1],
    ["all on one page", 1],
    ["only on one page", 1],
  ] as const)("detects restrictive one-page phrasing: %s", (prompt, expected) => {
    expect(detectExplicitPageCount(prompt)).toBe(expected);
  });

  it("detects the production tvspel-blog prompt as a one-page cap", () => {
    expect(detectExplicitPageCount(TVSPEL_BLOG_ONE_PAGE_PROMPT)).toBe(1);
  });

  it("plans exactly the root route for the production tvspel-blog prompt", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: TVSPEL_BLOG_ONE_PAGE_PROMPT,
      buildIntent: "website",
      resolvedScaffold: blogScaffold,
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
    expect(plan.routes).toHaveLength(1);
    expect(detectExplicitPageCount(TVSPEL_BLOG_ONE_PAGE_PROMPT)).toBe(1);
  });

  // Prod-körningen hade en brief (brief_influenced_selection = true).
  // buildRoutesFromBrief sätter required:true på brief.pages[], så utan brief
  // i testet täcks inte den konfiguration som faktiskt levererade tre sidor.
  it("plans only the root route for the tvspel-blog prompt even when the brief lists a blog page", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: TVSPEL_BLOG_ONE_PAGE_PROMPT,
      buildIntent: "website",
      resolvedScaffold: blogScaffold,
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Startsida med bloggflöde" },
          { path: "/blog", name: "Blogg", purpose: "Inläggslista" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
    expect(plan.routes).toHaveLength(1);
  });

  it.each([
    ["Only one page; the one page should have a footer", 1],
    ["Bara en sida; den enda sidan ska ha en footer", 1],
    ["Only one page, a landing page for the product", 1],
    ["Only one page, and on the one page include pricing", 1],
    ["Bara en sida, och på den enda sidan ska priser finnas", 1],
  ] as const)("keeps the one-page cap across anaphora/apposition: %s", (prompt, expected) => {
    expect(detectExplicitPageCount(prompt)).toBe(expected);
  });

  it("plans only the root route when the same page is restated anaphorically", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "Only one page; the one page should have a footer",
      buildIntent: "website",
      resolvedScaffold: blogScaffold,
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
    expect(plan.routes).toHaveLength(1);
  });

  it("plans only the root route when a comma names the same page in apposition", () => {
    const blogScaffold = getScaffoldById("blog");
    expect(blogScaffold).not.toBeNull();
    const plan = buildRoutePlan({
      prompt: "Only one page, a landing page for the product",
      buildIntent: "website",
      resolvedScaffold: blogScaffold,
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/"]);
    expect(plan.routes).toHaveLength(1);
  });

  it.each([
    "En hemsida om tvspel",
    "Jag vill ha en sida med priser och en sida med kontakt",
    "en sida i taget",
    "lägg till en sida",
    "gör en snygg sida",
    "one of the pages should be about us",
    "every single page should have a footer",
    "on one page",
    "put the contact form on one page and prices on another",
    "lägg till bara en sida",
    "add just one page",
    "single-page landing plus an about page",
    "only one page and an about page",
    "Only one page, a landing page and a contact page",
    "only one page for prices and one page for contact",
    "only one page for prices and the one page for contact",
    "only one page for prices and also the one page for contact",
    "only one page for prices and then the one page for contact",
    "contact only on one page and pricing on another",
    "endast en sida till",
    "bara en sida till",
    "lägg till 1 sida",
    "add 1 page",
  ])("does not treat %s as a page-count cap", (prompt) => {
    expect(detectExplicitPageCount(prompt)).toBeNull();
  });

  it("does not read an add-page follow-up as a one-page cap", () => {
    const prompt = "lägg till en sida";
    expect(hasExplicitAddRouteIntent(prompt)).toBe(true);
    expect(detectExplicitPageCount(prompt)).toBeNull();
    const plan = buildRoutePlan({
      prompt,
      buildIntent: "website",
      resolvedScaffold: getScaffoldById("landing-page"),
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/om"]);
  });
});

describe("buildRoutePlan — structured pageCountHint (Byggval)", () => {
  it("applies the hint without any page-count text in the prompt", () => {
    const plan = buildRoutePlan({
      prompt: "En hemsida om en arkad.",
      buildIntent: "website",
      resolvedScaffold: null,
      pageCountHint: 3,
    });
    expect(plan.siteType).not.toBe("one-page");
    expect(plan.explicitPageCount).toBe(3);
  });

  it("prefers the structured hint over prompt-text detection", () => {
    const plan = buildRoutePlan({
      prompt: "En hemsida om en arkad. 5 sidor.",
      buildIntent: "website",
      resolvedScaffold: null,
      pageCountHint: 2,
    });
    expect(plan.explicitPageCount).toBe(2);
  });

  it("trims optional routes down to the hinted count", () => {
    const plan = buildRoutePlan({
      prompt: "Snickerifirma med kontakt, tjänster, blogg och priser.",
      buildIntent: "website",
      resolvedScaffold: null,
      pageCountHint: 2,
    });
    expect(plan.routes.length).toBe(2);
    expect(plan.routes.some((r) => r.path === "/")).toBe(true);
    expect(plan.reason).toMatch(/trimmed/i);
  });

  it("ignores out-of-range hints and falls back to prompt detection", () => {
    const plan = buildRoutePlan({
      prompt: "En hemsida om en arkad. 3 sidor.",
      buildIntent: "website",
      resolvedScaffold: null,
      pageCountHint: 50,
    });
    expect(plan.explicitPageCount).toBe(3);
  });
});

describe("buildRoutePlan — explicit page count", () => {
  it("elevates siteType from one-page when user says '3 sidor'", () => {
    const plan = buildRoutePlan({
      prompt: "En hemsida om en arkad. 3 sidor.",
      buildIntent: "website",
      resolvedScaffold: null,
    });
    expect(plan.siteType).not.toBe("one-page");
    expect(plan.explicitPageCount).toBe(3);
    expect(plan.reason).toContain("3 pages");
  });

  it("does not override siteType when routes already exceed count", () => {
    const plan = buildRoutePlan({
      prompt: "3 sidor med kontakt och blogg och priser",
      buildIntent: "website",
      resolvedScaffold: null,
    });
    expect(plan.routes.length).toBeGreaterThanOrEqual(3);
  });

  it("trims optional routes when explicit page count is below planned routes", () => {
    const plan = buildRoutePlan({
      prompt: "Snickerifirma med kontakt, tjänster, blogg och priser. 2 sidor.",
      buildIntent: "website",
      resolvedScaffold: null,
    });
    expect(plan.routes.length).toBe(2);
    expect(plan.routes.some((r) => r.path === "/")).toBe(true);
    expect(plan.explicitPageCount).toBe(2);
    expect(plan.reason).toMatch(/trimmed/i);
  });

  it("never trims the root route during cap enforcement", () => {
    const plan = buildRoutePlan({
      prompt: "Bygg en sajt med kontakt, blogg och priser. 1 sida.",
      buildIntent: "website",
      resolvedScaffold: null,
    });
    expect(plan.routes.some((r) => r.path === "/")).toBe(true);
    expect(plan.routes.length).toBeLessThanOrEqual(2);
  });

  it("skips ecommerce scaffold defaults when explicit page count cap is already reached", () => {
    const ecommerce = getScaffoldById("ecommerce");
    const plan = buildRoutePlan({
      prompt: "En liten butik. 1 sida.",
      buildIntent: "website",
      resolvedScaffold: ecommerce ?? null,
    });
    expect(plan.routes.some((r) => r.path === "/products")).toBe(false);
    expect(plan.routes.some((r) => r.path === "/cart")).toBe(false);
    expect(plan.routes.length).toBeLessThanOrEqual(1);
  });
});

// Per-round ceiling (ägarbeslut 2026-08-11, djupmedvetet 2026-08-14).
// Byggval's slider still stops at three; the route-plan cap is four level-1/2
// pages. A brief, prompt text and scaffold defaults could each exceed it
// independently — so the ceiling is enforced after every source has merged.
describe("buildRoutePlan — per-round page ceiling", () => {
  const websiteBase = {
    buildIntent: "website" as const,
    resolvedScaffold: null,
    brief: undefined as undefined,
  };

  it("exposes the ceiling as a constant", () => {
    expect(MAX_ROUTES_PER_GENERATION).toBe(4);
    expect(ABSOLUTE_MAX_ROUTES_PER_GENERATION).toBe(8);
  });

  it("trims a brief with more pages than the ceiling", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
          { path: "/kontakt", name: "Kontakt", purpose: "Kontaktuppgifter" },
        ],
      },
    });
    expect(plan.routes).toHaveLength(MAX_ROUTES_PER_GENERATION);
    expect(plan.routes.some((r) => r.path === "/")).toBe(true);
    expect(plan.reason).toMatch(/ceiling/i);
  });

  it("keeps the earliest brief pages and drops the trailing ones", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/om", "/tjanster", "/priser"]);
  });

  it("clamps an explicit page count above the ceiling instead of promising more", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg en sajt med kontakt, blogg, priser och om oss. 6 sidor.",
    });
    expect(plan.routes.length).toBeLessThanOrEqual(MAX_ROUTES_PER_GENERATION);
    expect(plan.explicitPageCount).toBe(MAX_ROUTES_PER_GENERATION);
    expect(plan.reason).not.toMatch(/6 pages/);
  });

  // The explicit-count trim exempts brief routes, so a five-page brief against
  // "2 sidor" reaches the ceiling pass with five routes. Applying only the
  // ceiling would settle on three and quietly ignore the stricter choice.
  it("honors a page hint that is STRICTER than the ceiling, even for brief pages", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      pageCountHint: 2,
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
          { path: "/kontakt", name: "Kontakt", purpose: "Kontaktuppgifter" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual(["/", "/om"]);
    expect(plan.reason).toMatch(/ceiling of 2/i);
  });

  it("still applies the ceiling when the page hint is looser than it", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen. 6 sidor.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
          { path: "/kontakt", name: "Kontakt", purpose: "Kontaktuppgifter" },
        ],
      },
    });
    expect(plan.routes).toHaveLength(MAX_ROUTES_PER_GENERATION);
  });

  it("caps scaffold defaults stacked on top of prompt patterns", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Webbutik med kontaktsida, blogg, prissida och om oss.",
      resolvedScaffold: getScaffoldById("ecommerce"),
    });
    expect(plan.routes.some((r) => r.path === "/products")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/cart")).toBe(false);
    expect(plan.routes.length).toBeGreaterThan(MAX_ROUTES_PER_GENERATION);
    expect(plan.routes.length).toBeLessThanOrEqual(ABSOLUTE_MAX_ROUTES_PER_GENERATION);
  });

  it("never trims frozen existing routes on a follow-up, even above the ceiling", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Putsa typografin lite.",
      generationMode: "followUp",
      existingRoutePaths: ["/", "/om", "/tjanster", "/priser", "/kontakt"],
    });
    expect(plan.routes.map((r) => r.path)).toEqual([
      "/",
      "/om",
      "/tjanster",
      "/priser",
      "/kontakt",
    ]);
  });

  it("caps how many NEW routes one follow-up round may add", () => {
    const existing = ["/", "/tjanster"];
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Lägg till en ny sida för kontakt, en blogg, priser, om oss och vårt team.",
      generationMode: "followUp",
      existingRoutePaths: existing,
    });
    const added = plan.routes.filter((r) => !existing.includes(r.path));
    expect(added.length).toBe(MAX_ROUTES_PER_GENERATION);
    for (const path of existing) {
      expect(plan.routes.some((r) => r.path === path)).toBe(true);
    }
  });

  // Live 2026-08-13: Atelier Nord listed four pages in the prompt; the ceiling
  // dropped /kontakt and the model faked it as a dialog. Named pages must stay.
  it("keeps every page the user named even when that exceeds the soft ceiling", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Atelier Nord. Sidor: start, projekt, om oss, kontakt",
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toHaveLength(4);
    expect(paths).toContain("/");
    expect(paths.some((path) => path === "/projekt" || path === "/work")).toBe(true);
    expect(paths.some((path) => path === "/om" || path === "/om-oss")).toBe(true);
    expect(paths.some((path) => path === "/kontakt" || path === "/contact")).toBe(true);
  });

  it("keeps a required scaffold companion on top of a three-page brief", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
        ],
      },
    });
    expect(plan.routes.some((r) => r.path === "/products")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/cart")).toBe(false);
    expect(plan.routes).toHaveLength(4);
  });

  // pr-ai-review: required-klassningen tittade bara på rutter som
  // applyScaffoldDefaults själv la till. /products från briefen blev "brief"
  // och trimmas vid mjuka taket — samma path måste räknas required oavsett källa.
  it("keeps brief /products as required when the ecommerce scaffold already demands it", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      resolvedScaffold: getScaffoldById("ecommerce"),
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/products", name: "Produkter", purpose: "Katalog" },
        ],
      },
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/products");
    expect(paths).not.toContain("/cart");
    expect(plan.routes).toHaveLength(4);
  });

  it("caps a fourteen-name list at the absolute brake and keeps named pages", () => {
    const names = [
      "alfa",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa",
      "lambda",
      "my",
      "ny",
      "xi",
    ];
    const namedPaths = new Set(names.map((name) => `/${name}`));
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: `Sidor: ${names.join(", ")}`,
    });
    expect(plan.routes).toHaveLength(ABSOLUTE_MAX_ROUTES_PER_GENERATION);
    expect(plan.routes.some((r) => r.path === "/")).toBe(true);
    for (const route of plan.routes) {
      if (route.path === "/") continue;
      expect(namedPaths.has(route.path)).toBe(true);
    }
    expect(plan.reason).toMatch(/ceiling of 8/i);
  });

  // Scaffoldens egna filer länkar hårdkodat till sina required-rutter (ecommerce
  // länkar /products från header, footer och hero), så en kapad required-rutt ger
  // döda länkar. Vid nödbromsen får en namngiven sida vika i stället — den syns
  // för användaren och kan begäras igen i nästa runda.
  it("keeps the required scaffold route and cuts a named page at the absolute brake", () => {
    const names = [
      "start",
      "projekt",
      "om oss",
      "kontakt",
      "priser",
      "team",
      "blogg",
      "villkor",
    ];
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: `Webbutik. Sidor: ${names.join(", ")}`,
      resolvedScaffold: getScaffoldById("ecommerce"),
    });
    const paths = plan.routes.map((r) => r.path);
    expect(plan.routes).toHaveLength(ABSOLUTE_MAX_ROUTES_PER_GENERATION);
    expect(paths).toContain("/products");
    expect(
      paths.filter((path) => path !== "/" && path !== "/products").length,
    ).toBeLessThan(names.length);
  });

  // Regression: när användaren själv namnger /products blir rutten både named
  // och required. Klassningen måste välja den mest skyddade klassen i den
  // aktiva trimordningen — annars kapas /products som named före taket 8 medan
  // scaffolden fortfarande länkar dit.
  it("keeps named+required /products at the absolute brake when the user listed it", () => {
    const names = [
      "alfa",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "products",
    ];
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: `Webbutik. Sidor: ${names.join(", ")}`,
      resolvedScaffold: getScaffoldById("ecommerce"),
    });
    const paths = plan.routes.map((r) => r.path);
    expect(plan.routes).toHaveLength(ABSOLUTE_MAX_ROUTES_PER_GENERATION);
    expect(paths).toContain("/products");
  });

  // Explicit sidantal trimmar required före named. En named+required-rutt ska
  // därför fortfarande räknas som named här (oförändrat mot pre-fix).
  it("keeps named+required /products over a pure named page under an explicit page count", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "2 sidor. Webbutik. Sidor: products, kontakt",
      resolvedScaffold: getScaffoldById("ecommerce"),
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toEqual(["/", "/products"]);
  });

  // Ren required vs ren named vid nödbromsen: named viker först — utan att
  // blanda in dubbelklassningen ovan.
  it("cuts a pure named page before a pure required scaffold route at the absolute brake", () => {
    const names = [
      "alfa",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
    ];
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: `Webbutik. Sidor: ${names.join(", ")}`,
      resolvedScaffold: getScaffoldById("ecommerce"),
    });
    const paths = plan.routes.map((r) => r.path);
    expect(plan.routes).toHaveLength(ABSOLUTE_MAX_ROUTES_PER_GENERATION);
    expect(paths).toContain("/products");
    expect(paths).not.toContain("/iota");
  });

  it("lets an explicit lower page count win over four named pages", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "2 sidor. Sidor: start, projekt, om oss, kontakt",
    });
    expect(plan.routes).toHaveLength(2);
  });

  it("does not count level-3 routes against the soft ceiling", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
          { path: "/blog/[slug]", name: "Artikel", purpose: "Mall" },
          { path: "/product/[id]", name: "Produkt", purpose: "Mall" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual([
      "/",
      "/om",
      "/tjanster",
      "/priser",
      "/blog/[slug]",
      "/product/[id]",
    ]);
  });

  it("trims a fifth level-1/2 page but keeps the level-3 template", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Bygg enligt briefen.",
      brief: {
        pages: [
          { path: "/", name: "Hem", purpose: "Landningssida" },
          { path: "/om", name: "Om oss", purpose: "Företaget" },
          { path: "/tjanster", name: "Tjänster", purpose: "Utbud" },
          { path: "/priser", name: "Priser", purpose: "Prislista" },
          { path: "/kontakt", name: "Kontakt", purpose: "Kontaktuppgifter" },
          { path: "/blog/[slug]", name: "Artikel", purpose: "Mall" },
        ],
      },
    });
    expect(plan.routes.map((r) => r.path)).toEqual([
      "/",
      "/om",
      "/tjanster",
      "/priser",
      "/blog/[slug]",
    ]);
  });

  it("keeps five named level-1/2 pages above the soft ceiling", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Sidor: start, projekt, om oss, kontakt, priser",
    });
    const paths = plan.routes.map((r) => r.path);
    expect(paths.length).toBeGreaterThan(MAX_ROUTES_PER_GENERATION);
    expect(paths).toContain("/");
    expect(paths.some((path) => path === "/projekt" || path === "/work")).toBe(true);
    expect(paths.some((path) => path === "/om" || path === "/om-oss")).toBe(true);
    expect(paths.some((path) => path === "/kontakt" || path === "/contact")).toBe(true);
    expect(paths.some((path) => path === "/priser" || path === "/pricing")).toBe(true);
    expect(plan.reason).toMatch(/ceiling/i);
    expect(plan.reason).toMatch(/named|required|explicit/i);
  });
});

describe("route-plan depth — level 1/2 count against the ceiling", () => {
  it("classifies root, one segment, deeper and dynamic paths", () => {
    expect(getRoutePlanDepth("/")).toBe(1);
    expect(getRoutePlanDepth("/om-oss")).toBe(2);
    expect(getRoutePlanDepth("/kontakt")).toBe(2);
    expect(getRoutePlanDepth("/projekt")).toBe(2);
    expect(getRoutePlanDepth("/blog/[slug]")).toBe(3);
    expect(getRoutePlanDepth("/product/[id]")).toBe(3);
    expect(getRoutePlanDepth("/category/[slug]")).toBe(3);
    expect(getRoutePlanDepth("/blog/arkiv")).toBe(3);
    expect(getRoutePlanDepth("/[slug]")).toBe(3);
    expect(countsTowardPageCeiling("/")).toBe(true);
    expect(countsTowardPageCeiling("/om-oss")).toBe(true);
    expect(countsTowardPageCeiling("/blog/[slug]")).toBe(false);
  });
});

describe("scaffold page files fit the depth-aware ceiling", () => {
  const LEVEL3_TEMPLATES = ["/blog/[slug]", "/product/[id]", "/category/[slug]"] as const;

  it("counts only level-1/2 files against the ceiling of 4 for all ten scaffolds", () => {
    const ids = getScaffoldIds();
    expect(ids).toHaveLength(10);

    const level12ById: Record<string, number> = {};
    const seenLevel3 = new Set<string>();

    for (const id of ids) {
      const scaffold = getScaffoldById(id);
      expect(scaffold, id).not.toBeNull();
      const paths = extractAppRoutePathsFromFilePaths(
        scaffold!.files.map((file) => file.path),
      );
      const level12 = paths.filter((path) => countsTowardPageCeiling(path));
      const level3 = paths.filter((path) => !countsTowardPageCeiling(path));
      level12ById[id] = level12.length;
      expect(level12.length, `${id} level-1/2 count`).toBeLessThanOrEqual(
        MAX_ROUTES_PER_GENERATION,
      );
      for (const path of level3) {
        expect(LEVEL3_TEMPLATES, `${id} unexpected level-3 ${path}`).toContain(path);
        expect(
          scaffold!.routeContract?.dynamicRoutePatterns.includes(path),
          `${id} ${path} missing from routeContract.dynamicRoutePatterns`,
        ).toBe(true);
        seenLevel3.add(path);
      }
    }

    expect(level12ById).toEqual({
      "app-shell": 4,
      "auth-pages": 4,
      "base-nextjs": 1,
      blog: 2,
      dashboard: 4,
      ecommerce: 4,
      "landing-page": 1,
      portfolio: 1,
      "projekt-bas-app": 1,
      "saas-landing": 1,
    });
    expect([...seenLevel3].sort()).toEqual([...LEVEL3_TEMPLATES].sort());
  });
});

// Regression: en fri instruktion har varken komma eller punkt mellan titeln och
// resten av meningen, så den girige svansen slukade hela satsen och skapade
// `/bilder-och-lanka-den-i-headern`. Obundna namn kapas nu vid första
// konjunktionen/prepositionen; citerade namn lämnas hela.
describe("extractExplicitNamedPages — obundna namn kapas vid satsgräns", () => {
  const websiteBase = {
    buildIntent: "website" as const,
    resolvedScaffold: null,
    brief: undefined as undefined,
  };

  it("stannar vid svenskt 'och' i stället för att sluka hela instruktionen", () => {
    expect(
      extractExplicitNamedPages("Skapa en sida som ska heta Bilder och länka den i headern"),
    ).toEqual([{ name: "Bilder", path: "/bilder" }]);
  });

  it("stannar vid engelskt 'and'", () => {
    expect(
      extractExplicitNamedPages("create a page called Gallery and link it in the header"),
    ).toEqual([{ name: "Gallery", path: "/gallery" }]);
  });

  it.each([
    ["samt", "Skapa en ny sida som ska heta Priser samt visa den i menyn", "/priser"],
    ["eller", "Skapa en sida som ska heta Kontakt eller Support", "/kontakt"],
    ["med", "Skapa en sida som ska heta Tjänster med tre sektioner", "/tjanster"],
    ["på", "Skapa en sida som ska heta Om på svenska", "/om"],
    ["som", "Skapa en sida som ska heta Blogg som listar inlägg", "/blogg"],
  ])("kapar vid svensk konjunktion/preposition '%s'", (_word, prompt, expected) => {
    expect(extractExplicitNamedPages(prompt).map((page) => page.path)).toEqual([expected]);
  });

  it.each([
    ["with", "create a page called Pricing with three tiers", "/pricing"],
    ["that", "create a page called Blog that lists posts", "/blog"],
    ["in", "create a page called About in the footer", "/about"],
    ["then", "create a page called Team then style it", "/team"],
  ])("kapar vid engelsk konjunktion/preposition '%s'", (_word, prompt, expected) => {
    expect(extractExplicitNamedPages(prompt).map((page) => page.path)).toEqual([expected]);
  });

  it("behåller ett citerat flerordsnamn i sin helhet", () => {
    expect(
      extractExplicitNamedPages('Skapa en sida som ska heta "Bilder och video" och länka den'),
    ).toEqual([{ name: "Bilder och video", path: "/bilder-och-video" }]);
  });

  it("behåller ett citerat engelskt flerordsnamn", () => {
    expect(
      extractExplicitNamedPages('create a page called "Our Work and Cases" and link it'),
    ).toEqual([{ name: "Our Work and Cases", path: "/our-work-and-cases" }]);
  });

  it("behåller en inledande artikel — den är en del av titeln, inte en satsgräns", () => {
    expect(extractExplicitNamedPages("create a page called The Team")).toEqual([
      { name: "The Team", path: "/the-team" },
    ]);
  });

  it("bundar ett obundet namn till några få ord", () => {
    const [page] = extractExplicitNamedPages(
      "Skapa en sida som ska heta Alfa Beta Gamma Delta Epsilon Zeta",
    );
    expect(page?.name.split(" ")).toHaveLength(4);
  });

  it("parsar en kolonlista 'Sidor: start, projekt, om oss, kontakt'", () => {
    expect(
      extractExplicitNamedPages("Sidor: start, projekt, om oss, kontakt").map((page) => page.path),
    ).toEqual(["/projekt", "/om-oss", "/kontakt"]);
  });

  // pr-ai-review: kolonlistan slukade efterföljande instruktioner på samma rad
  // ("Contact. Style: minimal" → skräproute med namngivet undantag).
  it("kapar kolonlistan vid meningsgräns så efterföljande instruktion inte blir en sida", () => {
    expect(
      extractExplicitNamedPages("Pages: Home, About, Contact. Style: minimal").map(
        (page) => page.path,
      ),
    ).toEqual(["/about", "/contact"]);
    expect(
      extractExplicitNamedPages("Sidor: start, kontakt. Stil: mörk").map((page) => page.path),
    ).toEqual(["/kontakt"]);
  });

  it("planerar inte en style-skräproute från kolonlista + efterföljande instruktion", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Pages: Home, About, Contact. Style: minimal",
      locale: "en",
    });
    const paths = plan.routes.map((route) => route.path);
    expect(paths).toEqual(["/", "/about", "/contact"]);
    expect(paths.some((path) => path.includes("style"))).toBe(false);
  });

  // pr-ai-review: Oxford-komma lämnade "and Contact" / "och kontakt" som item.
  it("stripar ledande och/and efter Oxford-komma i kolonlistan", () => {
    expect(
      extractExplicitNamedPages("Pages: Home, About, and Contact").map((page) => page.path),
    ).toEqual(["/about", "/contact"]);
    expect(
      extractExplicitNamedPages("Sidor: start, om oss, och kontakt").map((page) => page.path),
    ).toEqual(["/om-oss", "/kontakt"]);
  });

  // bugbot HIGH: och/and-split matade instruktionssvansen via parseExplicitPageName
  // (utan trimBarePageName) → `/lanka-den-i-footern`, `/gor-knapparna-grona`.
  // Oxford-listor utan instruktionssvans måste fortfarande ge tre sidor.
  it("avvisar instruktionssvans efter och/and i kolonlista men behåller Oxford-sidor", () => {
    expect(
      extractExplicitNamedPages(
        "Sidor: start, projekt, kontakt och länka den i footern",
      ).map((page) => page.path),
    ).toEqual(["/projekt", "/kontakt"]);
    expect(
      extractExplicitNamedPages("Sidor: start, projekt och kontakt").map(
        (page) => page.path,
      ),
    ).toEqual(["/projekt", "/kontakt"]);
    expect(
      extractExplicitNamedPages("Sidor: Home, About and Contact").map(
        (page) => page.path,
      ),
    ).toEqual(["/about", "/contact"]);
    expect(
      extractExplicitNamedPages(
        "Sidor: start, projekt, kontakt och gör knapparna gröna",
      ).map((page) => page.path),
    ).toEqual(["/projekt", "/kontakt"]);
    expect(
      extractExplicitNamedPages("Bygg en portfolio och länka den i headern"),
    ).toEqual([]);
  });

  // Granskningsfynd: en kolonträff med EN post är oftast prosa, inte en
  // sidlista — utan spärren blev "routes: se nedan" en riktig skräpsida.
  it("avvisar kolonlistor med färre än två giltiga poster", () => {
    expect(extractExplicitNamedPages("Se våra routes: se nedan")).toEqual([]);
    expect(extractExplicitNamedPages("Sidor: kontakt")).toEqual([]);
  });

  it("planerar /bilder — inte den slukade varianten — för hela instruktionen", () => {
    const plan = buildRoutePlan({
      ...websiteBase,
      prompt: "Skapa en sida som ska heta Bilder och länka den i headern",
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((route) => route.path === "/bilder")).toBe(true);
    expect(plan.routes.some((route) => route.path.startsWith("/bilder-och"))).toBe(false);
  });
});

describe("scaffold default routes — manifest routeContract parity with the removed switch", () => {
  type FrozenRoute = { path: string; name: string; intent: string; required: boolean };

  const ALL_BUILD_INTENTS: BuildIntent[] = ["website", "app", "template"];

  /**
   * FROZEN literal output of the old hardcoded `switch (resolvedScaffold?.id)`
   * in `planning-helpers.ts → getScaffoldDefaultRoutes` (removed in
   * feat/scaffold-route-contract), per scaffold × build intent. Moving the
   * route truth into `ScaffoldManifest.routeContract` must not change the
   * observable plan contribution for ANY scaffold. Do not regenerate these
   * literals from runtime — they are the "before" side of the parity proof.
   */
  const FROZEN_SWITCH_OUTPUT: Record<string, Record<BuildIntent, FrozenRoute[]>> = (() => {
    const none: Record<BuildIntent, FrozenRoute[]> = { website: [], app: [], template: [] };
    const blogRoute = (required: boolean): FrozenRoute => ({
      path: "/blog",
      name: "Blog",
      intent: "Keep an editorial route for articles and archives.",
      required,
    });
    const productsRoute: FrozenRoute = {
      path: "/products",
      name: "Products",
      intent: "Keep a storefront route for the product catalog.",
      required: true,
    };
    const authRoutes: FrozenRoute[] = [
      {
        path: "/login",
        name: "Login",
        intent: "Keep a dedicated authentication entry route.",
        required: true,
      },
      {
        path: "/signup",
        name: "Signup",
        intent: "Keep a dedicated registration route when auth is in scope.",
        required: false,
      },
    ];
    const settingsRoute: FrozenRoute = {
      path: "/settings",
      name: "Settings",
      intent: "App shells should usually expose at least one management/settings route.",
      required: false,
    };
    const analyticsRoute: FrozenRoute = {
      path: "/analytics",
      name: "Analytics",
      intent: "Dashboard apps benefit from an analytics or metrics route.",
      required: false,
    };
    return {
      "base-nextjs": none,
      "landing-page": none,
      "saas-landing": none,
      portfolio: none,
      "projekt-bas-app": none,
      blog: {
        website: [blogRoute(true)],
        app: [blogRoute(false)],
        template: [blogRoute(true)],
      },
      ecommerce: {
        website: [productsRoute],
        app: [productsRoute],
        template: [productsRoute],
      },
      "auth-pages": {
        website: authRoutes,
        app: authRoutes,
        template: authRoutes,
      },
      dashboard: {
        website: [],
        app: [analyticsRoute, settingsRoute],
        template: [],
      },
      "app-shell": {
        website: [],
        app: [settingsRoute],
        template: [],
      },
    };
  })();

  it("covers every registered scaffold in the frozen table", () => {
    expect(new Set(getScaffoldIds())).toEqual(new Set(Object.keys(FROZEN_SWITCH_OUTPUT)));
  });

  for (const [scaffoldId, byIntent] of Object.entries(FROZEN_SWITCH_OUTPUT)) {
    it(`derives identical default routes for ${scaffoldId} across all build intents`, () => {
      const scaffold = getScaffoldById(scaffoldId);
      expect(scaffold).not.toBeNull();
      for (const buildIntent of ALL_BUILD_INTENTS) {
        const routes: FrozenRoute[] = [];
        applyScaffoldDefaults(buildIntent, scaffold, routes);
        expect(routes, `${scaffoldId} × ${buildIntent}`).toEqual(byIntent[buildIntent]);
        expect(
          collectScaffoldRequiredPaths(buildIntent, scaffold),
          `${scaffoldId} × ${buildIntent} required paths`,
        ).toEqual(
          new Set(
            byIntent[buildIntent]
              .filter((route) => route.required)
              .map((route) => route.path),
          ),
        );
      }
    });
  }

  it("contributes nothing when no scaffold is resolved", () => {
    for (const buildIntent of ALL_BUILD_INTENTS) {
      const routes: FrozenRoute[] = [];
      applyScaffoldDefaults(buildIntent, null, routes);
      expect(routes).toEqual([]);
      expect(collectScaffoldRequiredPaths(buildIntent, null)).toEqual(new Set());
    }
  });
});
