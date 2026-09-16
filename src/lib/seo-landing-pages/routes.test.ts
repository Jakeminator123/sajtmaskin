import { describe, expect, it } from "vitest";
import { SEO_LANDING_PAGES } from "./registry";

describe("SEO landing App Router pages", () => {
  it.each(SEO_LANDING_PAGES.map((page) => page.slug))(
    "exports server metadata and a default page for /%s",
    async (slug) => {
      const mod = await import(`@/app/${slug}/page`);
      expect(mod.metadata.robots).toEqual({ index: false, follow: false });
      expect(typeof mod.default).toBe("function");
    },
  );
});
