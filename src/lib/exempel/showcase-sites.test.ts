import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXEMPEL_CANONICAL_URL,
  EXEMPEL_DISCLOSURE,
  EXEMPEL_PATH,
  FORBIDDEN_GLASS_ALIAS,
  HOME_SHOWCASE_SITES,
  SHOWCASE_SITES,
} from "./showcase-sites";

describe("showcase site catalog", () => {
  it("lists exactly the five live reconstructions in the public order", () => {
    expect(SHOWCASE_SITES.map((site) => [site.id, site.href])).toEqual([
      ["byraflode", "https://byraflode-showcase.vercel.app"],
      ["springa", "https://springa-showcase.vercel.app"],
      ["palma", "https://palma-showcase.vercel.app"],
      ["paddlelines", "https://paddlelines-showcase.vercel.app"],
      ["glass", "https://glass-showcase-umber.vercel.app"],
    ]);
  });

  it("never mentions the unrelated wedding-site alias", () => {
    const serialized = JSON.stringify(SHOWCASE_SITES);
    expect(serialized).not.toContain("glass-showcase.vercel.app");
    expect(FORBIDDEN_GLASS_ALIAS).toBe("https://glass-showcase.vercel.app");
    for (const site of SHOWCASE_SITES) {
      expect(site.href).not.toBe(FORBIDDEN_GLASS_ALIAS);
    }
  });

  it("keeps the homepage strip to three featured examples", () => {
    expect(HOME_SHOWCASE_SITES.map((site) => site.id)).toEqual([
      "byraflode",
      "springa",
      "palma",
    ]);
  });

  it("uses locally committed screenshots and a reconstruction disclosure", () => {
    for (const site of SHOWCASE_SITES) {
      expect(site.screenshotSrc).toBe(`/exempel/${site.id}.webp`);
      expect(site.summary.toLowerCase()).not.toMatch(/kundcase|kundomdöme|%\s*$|procent/);
    }
    expect(EXEMPEL_PATH).toBe("/exempel");
    expect(EXEMPEL_CANONICAL_URL).toBe("https://sajtmaskin.se/exempel");
    expect(EXEMPEL_DISCLOSURE).toMatch(/rekonstruktion/i);
    expect(EXEMPEL_DISCLOSURE).toMatch(/inte kundomdömen/i);
  });

  it("ships locally committed screenshot assets", () => {
    for (const site of SHOWCASE_SITES) {
      const file = resolve(process.cwd(), `public${site.screenshotSrc}`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(8_000);
    }
    const og = resolve(process.cwd(), "public/exempel/og.webp");
    expect(existsSync(og)).toBe(true);
    expect(statSync(og).size).toBeGreaterThan(8_000);
  });

  it("keeps the catalog as the product owner of the live URLs", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/exempel/showcase-sites.ts"), "utf8");
    expect(source).toContain("https://glass-showcase-umber.vercel.app");
    expect(source).toContain("FORBIDDEN_GLASS_ALIAS");
    expect(SHOWCASE_SITES.some((site) => site.href.includes("glass-showcase-umber"))).toBe(true);
  });

  it("documents live showcase URLs without the wedding alias", () => {
    const handoff = readFileSync(resolve(process.cwd(), "docs/runbooks/showcase-exempel.md"), "utf8");
    expect(handoff).toContain("https://glass-showcase-umber.vercel.app");
    expect(handoff).toContain("https://sajtmaskin.se/exempel");
    expect(handoff).not.toContain("https://glass-showcase.vercel.app");
  });
});
