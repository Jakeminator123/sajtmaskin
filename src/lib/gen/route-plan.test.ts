import { describe, expect, it } from "vitest";
import { buildRoutePlan } from "./route-plan";
import type { SiteProfile } from "./scaffolds/site-profile";

describe("buildRoutePlan", () => {
  it("does not inject category routes for app intent", () => {
    const siteProfile: SiteProfile = {
      businessCategory: "restaurant-cafe",
      confidence: "high",
      pageBucket: 3,
    };

    const plan = buildRoutePlan({
      prompt: "Build a restaurant order management app",
      buildIntent: "app",
      resolvedScaffold: null,
      siteProfile,
    });

    expect(plan.siteType).toBe("app-shell");
    const paths = plan.routes.map((r) => r.path);
    expect(paths).not.toContain("/menu");
    expect(paths).not.toContain("/contact");
    expect(paths).toContain("/");
  });

  it("injects category routes for website intent", () => {
    const siteProfile: SiteProfile = {
      businessCategory: "restaurant-cafe",
      confidence: "high",
      pageBucket: 5,
    };

    const plan = buildRoutePlan({
      prompt: "Skapa en hemsida för en restaurang",
      buildIntent: "website",
      resolvedScaffold: null,
      siteProfile,
    });

    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/menu");
    expect(paths).toContain("/contact");
  });

  it("does not apply pageBucket trimming for app intent", () => {
    const siteProfile: SiteProfile = {
      businessCategory: "restaurant-cafe",
      confidence: "high",
      pageBucket: 1,
    };

    const plan = buildRoutePlan({
      prompt: "Build a project management tool with settings and analytics",
      buildIntent: "app",
      resolvedScaffold: null,
      siteProfile,
    });

    expect(plan.routes.length).toBeGreaterThanOrEqual(1);
    expect(plan.siteType).toBe("app-shell");
  });
});
