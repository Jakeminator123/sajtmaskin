import { describe, expect, it } from "vitest";
import { STATIC_SITEMAP_REL_PATHS } from "./sitemap";

describe("marketing sitemap static paths", () => {
  it("includes core marketing, blog, and legal routes", () => {
    expect(STATIC_SITEMAP_REL_PATHS).toEqual(
      expect.arrayContaining(["/blogg", "/om", "/faq", "/templates", "/teknik", "/terms", "/privacy"]),
    );
    expect(STATIC_SITEMAP_REL_PATHS[0]).toBe("");
  });

  it("lists each static path once", () => {
    const set = new Set(STATIC_SITEMAP_REL_PATHS);
    expect(set.size).toBe(STATIC_SITEMAP_REL_PATHS.length);
  });
});
