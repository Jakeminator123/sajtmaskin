import { describe, expect, it } from "vitest";
import { getScaffoldById } from "./scaffolds/registry";
import {
  buildRoutePlan,
  detectExplicitPageCount,
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

describe("detectExplicitPageCount", () => {
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
