import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Metadata is evaluated on the server; do not load interactive UI in these tests.
vi.mock("./home-page-client", () => ({ default: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("homepage search metadata", () => {
  it("has a descriptive absolute title without duplicating the root title template", async () => {
    const { metadata } = await import("./page");
    expect(metadata.title).toEqual({
      absolute: "Skapa hemsida med AI för företag | Sajtmaskin",
    });
    expect(metadata.description).toContain("Beskriv ditt företag");
    expect(metadata.description).toContain("Börja utan kreditkort");
  });

  it("keeps canonical and social metadata on the public production origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.sajtmaskin.se");
    const { metadata } = await import("./page");
    const title = "Skapa hemsida med AI för företag | Sajtmaskin";
    expect(metadata.alternates).toEqual({ canonical: "https://sajtmaskin.se" });
    expect(metadata.openGraph).toMatchObject({
      title,
      description: metadata.description,
      url: "https://sajtmaskin.se",
      type: "website",
      locale: "sv_SE",
      siteName: "Sajtmaskin",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title,
      description: metadata.description,
    });
  });

  it("does not override the root production/preview indexing policy", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { metadata } = await import("./page");
    expect(metadata.robots).toBeUndefined();
    const { publicIndexRobots } = await import("@/lib/public-canonical-url");
    expect(publicIndexRobots()).toEqual({ index: false, follow: false });
  });
});

describe("unpublished blog indexing", () => {
  it.each(["production", "preview", "development", undefined])(
    "keeps the empty blog noindex in %s",
    async (environment) => {
      vi.stubEnv("VERCEL_ENV", environment);
      const { metadata } = await import("./blogg/page");
      expect(metadata.robots).toEqual({
        index: false,
        follow: environment === "production",
      });
      expect(metadata.alternates).toEqual({ canonical: "https://sajtmaskin.se/blogg" });
    },
  );

  it("allows production crawlers to read the noindex directive", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { default: robots } = await import("./robots");
    const rules = robots().rules;
    expect(rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(rules).not.toMatchObject({ disallow: expect.arrayContaining(["/blogg"]) });
  });
});
