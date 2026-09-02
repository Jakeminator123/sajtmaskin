import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const config = vi.hoisted(() => ({ useUnsplash: true }));
const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config", () => ({
  FEATURES: config,
  SECRETS: { unsplashAccessKey: "unsplash-test-key" },
}));

vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});

const { POST } = await import("./route");

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/unsplash/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/unsplash/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.useUnsplash = true;
    safeFetch.mockResolvedValue(Response.json({ url: "https://images.unsplash.com/photo" }));
  });

  it("does not fetch a caller-supplied private URL with the API key", async () => {
    const response = await POST(makeRequest({ downloadLocation: "http://169.254.169.254/" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Download URL is not allowed" });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("tracks a download location through safeFetch", async () => {
    const response = await POST(
      makeRequest({ downloadLocation: "https://api.unsplash.com/photos/abc123/download" }),
    );

    expect(response.status).toBe(200);
    expect(safeFetch).toHaveBeenCalledWith(
      "https://api.unsplash.com/photos/abc123/download",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Client-ID unsplash-test-key",
        }),
        maxBodyBytes: 256_000,
      }),
    );
  });
});
