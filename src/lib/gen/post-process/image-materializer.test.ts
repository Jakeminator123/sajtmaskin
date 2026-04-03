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
});
