import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const config = vi.hoisted(() => ({ useUnsplash: false }));

vi.mock("@/lib/config", () => ({
  FEATURES: config,
  SECRETS: { unsplashAccessKey: "test-key" },
  REDIS_KEY_PREFIX: "test:",
}));

const { GET, POST } = await import("./route");

function post(body: string): NextRequest {
  return new NextRequest("http://localhost/api/unsplash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/unsplash input bounds", () => {
  beforeEach(() => {
    config.useUnsplash = false;
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["null", "null"],
    ["array", "[]"],
    ["object industry", '{"industry":{}}'],
    ["object customTerms", '{"customTerms":{}}'],
    ["mixed customTerms", '{"customTerms":["office",{}]}'],
    ["object count", '{"count":{}}'],
  ])("rejects %s", async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
  });

  it("normalizes industry and caps the fallback image count", async () => {
    const response = await POST(post('{"industry":" TECH ","count":999}'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.images).toHaveLength(12);
    expect(body.images[0].url).toContain("/1E90FF/");
    expect(body.images[0].alt).toContain("for tech");
  });

  it("rejects an oversized search body before parsing it", async () => {
    const request = post("{}");
    request.headers.set("content-length", "8193");

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid or oversized request body" });
  });

  it("caps GET image counts", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/unsplash?query=office&count=999"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.images).toHaveLength(12);
  });
});
