import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  SECRETS: {
    unsplashAccessKey: "test-unsplash-key",
  },
  FEATURES: {
    useUnsplash: true,
  },
}));

import { materializeImages } from "./image-materializer";

const originalFetch = global.fetch;

describe("materializeImages", () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/photos")) {
        const query = new URL(url).searchParams.get("query") ?? "unknown";
        return new Response(
          JSON.stringify({
            results: [
              {
                urls: {
                  raw: `https://images.unsplash.com/${encodeURIComponent(query)}`,
                },
                links: {
                  download_location: `https://api.unsplash.com/photos/${encodeURIComponent(query)}/download`,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("limits how many placeholders are materialized per run", async () => {
    const content = [
      '<img src="/placeholder.svg?width=800&height=600&text=first+image" />',
      '<img src="/placeholder.svg?width=800&height=600&text=second+image" />',
      '<img src="/placeholder.svg?width=800&height=600&text=third+image" />',
    ].join("\n");

    const result = await materializeImages(content, { maxReplacements: 2 });

    expect(result.replacedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.content).toContain("https://images.unsplash.com/first%20image");
    expect(result.content).toContain("https://images.unsplash.com/second%20image");
    expect(result.content).toContain('/placeholder.svg?width=800&height=600&text=third+image');
  });

  it("dedupes identical placeholders so only one search request is needed", async () => {
    const content = [
      '<img src="/placeholder.svg?width=800&height=600&text=hero+image" />',
      '<img src="/placeholder.svg?width=800&height=600&text=hero+image" />',
    ].join("\n");

    const result = await materializeImages(content, { maxReplacements: 2 });

    expect(result.replacedCount).toBe(2);
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/search/photos"),
    );
    expect(searchCalls).toHaveLength(1);
  });

  it("processes each selected placeholder exactly once under concurrent resolution", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/photos")) {
        const query = new URL(url).searchParams.get("query") ?? "unknown";
        const delayMs =
          query === "first image" ? 30 : query === "second image" ? 5 : 15;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return new Response(
          JSON.stringify({
            results: [
              {
                urls: {
                  raw: `https://images.unsplash.com/${encodeURIComponent(query)}`,
                },
                links: {
                  download_location: `https://api.unsplash.com/photos/${encodeURIComponent(query)}/download`,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = [
      '<img src="/placeholder.svg?width=800&height=600&text=first+image" />',
      '<img src="/placeholder.svg?width=800&height=600&text=second+image" />',
      '<img src="/placeholder.svg?width=800&height=600&text=third+image" />',
    ].join("\n");

    const result = await materializeImages(content, { maxReplacements: 3 });

    expect(result.replacedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(result.content).toContain("https://images.unsplash.com/first%20image");
    expect(result.content).toContain("https://images.unsplash.com/second%20image");
    expect(result.content).toContain("https://images.unsplash.com/third%20image");

    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/search/photos"),
    );
    expect(searchCalls).toHaveLength(3);
  });

  it("uses fallback image and reports reason on 401 (invalid key)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );

    const content =
      '<img src="/placeholder.svg?width=800&height=600&text=hero+banner" />';

    const result = await materializeImages(content, { maxReplacements: 1 });

    expect(result.replacedCount).toBe(1);
    expect(result.content).toContain("images.unsplash.com/photo-");
    expect(result.content).not.toContain("placeholder.svg");
  });

  it("uses fallback image and reports reason on 429 (rate limited)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Too Many Requests", { status: 429 })),
    );

    const content =
      '<img src="/placeholder.svg?width=400&height=400&text=product+shot" />';

    const result = await materializeImages(content, { maxReplacements: 1 });

    expect(result.replacedCount).toBe(1);
    expect(result.content).toContain("images.unsplash.com/photo-");
    expect(result.content).not.toContain("placeholder.svg");
  });

  it("uses fallback image on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network failure");
      }),
    );

    const content =
      '<img src="/placeholder.svg?width=800&height=600&text=landscape+photo" />';

    const result = await materializeImages(content, { maxReplacements: 1 });

    expect(result.replacedCount).toBe(1);
    expect(result.content).toContain("images.unsplash.com/photo-");
    expect(result.content).not.toContain("placeholder.svg");
  });

  it("uses provided assets for the first placeholders, Unsplash for the rest", async () => {
    const content = [
      '<img src="/placeholder.svg?width=1200&height=600&text=hero+banner" />',
      '<img src="/placeholder.svg?width=800&height=600&text=gallery+one" />',
      '<img src="/placeholder.svg?width=800&height=600&text=gallery+two" />',
    ].join("\n");

    const providedUrl =
      "https://x.blob.vercel-storage.com/studio-guest/media/logo.png";
    const result = await materializeImages(content, {
      maxReplacements: 3,
      providedAssets: [{ url: providedUrl, alt: "Logo" }],
    });

    expect(result.replacedCount).toBe(3);
    // First placeholder → the operator's uploaded image (not Unsplash).
    expect(result.content).toContain(providedUrl);
    expect(result.content).not.toContain("text=hero+banner");
    // Remaining placeholders still resolve via Unsplash.
    expect(result.content).toContain("https://images.unsplash.com/gallery%20one");
    expect(result.resolvedUrls.has(providedUrl)).toBe(true);
    // Only 2 Unsplash searches (the first slot used the provided asset).
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/search/photos"),
    );
    expect(searchCalls).toHaveLength(2);
  });

  it("uses provided assets in order and skips Unsplash when they cover all placeholders", async () => {
    const content = [
      '<img src="/placeholder.svg?width=1200&height=600&text=hero" />',
      '<img src="/placeholder.svg?width=800&height=600&text=about" />',
    ].join("\n");

    const result = await materializeImages(content, {
      maxReplacements: 2,
      providedAssets: [
        { url: "https://b.blob.vercel-storage.com/a.png" },
        { url: "https://b.blob.vercel-storage.com/b.png" },
      ],
    });

    expect(result.replacedCount).toBe(2);
    expect(result.content).toContain("https://b.blob.vercel-storage.com/a.png");
    expect(result.content).toContain("https://b.blob.vercel-storage.com/b.png");
    expect(result.content).not.toContain("placeholder.svg");
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/search/photos"),
    );
    expect(searchCalls).toHaveLength(0);
  });
});
