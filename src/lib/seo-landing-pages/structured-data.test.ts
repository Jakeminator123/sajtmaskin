import { describe, expect, it } from "vitest";
import { seoLandingBreadcrumbName } from "./structured-data";

describe("SEO landing structured data helpers", () => {
  it("uses the primary keyword before an em dash or question mark", () => {
    expect(seoLandingBreadcrumbName("Skapa hemsida – från idé till publicerad sajt")).toBe(
      "Skapa hemsida",
    );
    expect(seoLandingBreadcrumbName("Vad kostar en hemsida? Pris och kostnadsdelar")).toBe(
      "Vad kostar en hemsida",
    );
  });
});
