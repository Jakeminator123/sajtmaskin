import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRIVATE_SEARCH_DISALLOW_PATHS,
  PUBLIC_CANONICAL_ORIGIN,
} from "@/lib/public-canonical-url";
import robots from "./robots";

describe("robots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points at the canonical sitemap and blocks private surfaces in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_SEARCH_DISALLOW_PATHS],
      },
      sitemap: `${PUBLIC_CANONICAL_ORIGIN}/sitemap.xml`,
    });

    expect(PRIVATE_SEARCH_DISALLOW_PATHS).toEqual(
      expect.arrayContaining(["/api/", "/builder", "/projects", "/konto", "/audits"]),
    );
    expect(PRIVATE_SEARCH_DISALLOW_PATHS.join(" ")).not.toContain("/templates");
    expect(PRIVATE_SEARCH_DISALLOW_PATHS.join(" ")).not.toContain("/skapa-hemsida");
    expect(PRIVATE_SEARCH_DISALLOW_PATHS.join(" ")).not.toContain("/faq");
  });

  it("disallows the whole preview/local host so deploys stay usable but not indexable", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: `${PUBLIC_CANONICAL_ORIGIN}/sitemap.xml`,
    });
  });
});
