import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const config = vi.hoisted(() => ({ useFigmaApi: true }));

vi.mock("@/lib/config", () => ({
  FEATURES: config,
  SECRETS: { figmaAccessToken: "figma-token" },
}));

vi.mock("@/lib/botProtection", () => ({
  requireNotBot: () => null,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));

import { parseFigmaUrl } from "./figma-url";

const { POST } = await import("./route");

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/figma/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Figma preview URL parsing", () => {
  it("accepts figma.com and its subdomains", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/file-key/name?node-id=1-2")).toEqual({
      fileKey: "file-key",
      nodeId: "1-2",
    });
    expect(parseFigmaUrl("https://figma.com/file/another-key/name")).toEqual({
      fileKey: "another-key",
      nodeId: undefined,
    });
  });

  it("rejects lookalike and suffix-spoofed hosts", () => {
    expect(parseFigmaUrl("https://evilfigma.com/design/file-key/name")).toBeNull();
    expect(parseFigmaUrl("https://figma.com.evil.example/design/file-key/name")).toBeNull();
  });

  it("rejects unsupported paths", () => {
    expect(parseFigmaUrl("https://www.figma.com/community/file-key/name")).toBeNull();
  });
});

describe("POST /api/figma/preview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.useFigmaApi = true;
  });

  it("rejects missing and invalid Figma URLs before calling Figma", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const missing = await POST(makeRequest({}));
    const invalid = await POST(makeRequest({ url: "https://example.com/design/file/name" }));

    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: "Figma URL is required" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "Invalid Figma URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the Figma integration is disabled", async () => {
    config.useFigmaApi = false;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      makeRequest({ url: "https://www.figma.com/design/disabled-file/name?node-id=1-2" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Figma API token not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders an explicitly selected node without fetching file metadata", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ images: { "10-20": "https://images.example/preview.png" } }),
      );

    const response = await POST(
      makeRequest({ url: "https://www.figma.com/design/explicit-node/name?node-id=10-20" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      fileKey: "explicit-node",
      nodeId: "10-20",
      imageUrl: "https://images.example/preview.png",
      cached: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/images/explicit-node");
  });

  it("discovers the first canvas and keeps sanitized file metadata", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          name: " Kundens startsida! ",
          document: { children: [{ type: "CANVAS", id: "2:4" }] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ images: { "2:4": "https://images.example/canvas.png" } }),
      );

    const response = await POST(
      makeRequest({ url: "https://www.figma.com/file/discovered-canvas/name" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      nodeId: "2:4",
      fileName: "Kundens-startsida",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/files/discovered-canvas?depth=2");
  });

  it("maps denied Figma access to an authentication-safe response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(
      makeRequest({ url: "https://www.figma.com/design/denied-file/name?node-id=3-7" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Figma token invalid or missing access" });
  });
});
