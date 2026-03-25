import { describe, expect, it } from "vitest";
import { buildRoutePlan } from "./route-plan";

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
});
