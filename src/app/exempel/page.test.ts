import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXEMPEL_CANONICAL_URL, EXEMPEL_DISCLOSURE } from "@/lib/exempel/showcase-sites";
import { metadata } from "./page";
import { publicIndexRobots } from "@/lib/public-canonical-url";

describe("/exempel metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the environment policy with the production canonical and social cards", () => {
    expect(metadata.title).toBe("Exempel på hemsidor");
    expect(metadata.description).toMatch(/rekonstruktion/i);
    expect(metadata.description).not.toMatch(/kundcase/i);
    expect(metadata.alternates).toEqual({ canonical: EXEMPEL_CANONICAL_URL });
    expect(metadata.alternates?.canonical).toBe("https://sajtmaskin.se/exempel");
    expect(metadata.robots).toEqual(publicIndexRobots());
    expect(metadata.openGraph).toMatchObject({
      url: EXEMPEL_CANONICAL_URL,
      locale: "sv_SE",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      description: EXEMPEL_DISCLOSURE,
    });
  });

  it.each(["preview", "development", "production"])("applies robots policy in %s", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    vi.resetModules();
    const { metadata: freshMetadata } = await import("./page");
    expect(freshMetadata.robots).toEqual({
      index: env === "production",
      follow: env === "production",
    });
  });

  it("pins the production canonical in source like /analys", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/exempel/page.tsx"), "utf8");
    expect(source).toMatch(/canonical: EXEMPEL_CANONICAL_URL/);
    expect(EXEMPEL_CANONICAL_URL).toBe("https://sajtmaskin.se/exempel");
  });
});
