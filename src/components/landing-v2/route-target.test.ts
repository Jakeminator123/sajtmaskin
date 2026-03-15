import { describe, expect, it } from "vitest";
import { resolveLandingRouteTarget } from "./route-target";

describe("resolveLandingRouteTarget", () => {
  it("maps fritext to the canonical freeform builder method", () => {
    expect(resolveLandingRouteTarget("fritext")).toEqual({
      buildMethod: "freeform",
      buildIntent: "website",
    });
  });

  it("preserves special cases for audit and template-driven entry modes", () => {
    expect(resolveLandingRouteTarget("audit")).toEqual({
      buildMethod: "audit",
      buildIntent: "website",
      source: "audit",
    });
    expect(resolveLandingRouteTarget("kategori")).toEqual({
      buildMethod: "category",
      buildIntent: "template",
    });
  });
});
