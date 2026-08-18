import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scopedVersion: vi.fn(),
  latestVersion: vi.fn(),
  resolveFileContext: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    gatewayUrl: "https://gateway.example",
    gatewayToken: "secret",
    modelRoutingEnabled: true,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: async (
    _req: NextRequest,
    _key: string,
    callback: () => Promise<Response>,
  ) => callback(),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits: vi.fn(async () => ({
    ok: true,
    cost: 1,
    commit: mocks.commit,
  })),
}));

vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus: () => ({ surfaceEnabled: true }),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest: mocks.scopedVersion,
  getLatestEngineVersionForChatForRequest: mocks.latestVersion,
}));

vi.mock("@/lib/openclaw/resolve-file-context", () => ({
  resolveFileContext: mocks.resolveFileContext,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function request(context: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/openclaw/tips", {
    method: "POST",
    body: JSON.stringify({ context }),
  });
}

describe("POST /api/openclaw/tips", () => {
  it("returns tenant-safe 404 before reading files for an unowned chat", async () => {
    mocks.scopedVersion.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      request({
        chatId: "another-tenant-chat",
        activeVersionId: "another-tenant-version",
        _fileManifest: "client supplied secret-looking manifest",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.resolveFileContext).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces a client manifest with bounded server-owned context", async () => {
    mocks.scopedVersion.mockResolvedValue({ version: { id: "owned-version" } });
    mocks.resolveFileContext.mockResolvedValue({
      manifest: "  app/page.tsx (tsx, 100b)",
      files: [],
      fullText: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ choices: [{ message: { content: "Justera rubriken." } }] }),
    );

    const response = await POST(
      request({
        chatId: "owned-chat",
        activeVersionId: "owned-version",
        _fileManifest: "MALICIOUS CLIENT MANIFEST",
      }),
    );
    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const contextMessage = upstreamBody.messages[1].content as string;

    expect(response.status).toBe(200);
    expect(contextMessage).toContain("app/page.tsx");
    expect(contextMessage).not.toContain("MALICIOUS CLIENT MANIFEST");
    expect(upstreamBody.model).toBe("openclaw:sajtagenten-fast");
  });
});
