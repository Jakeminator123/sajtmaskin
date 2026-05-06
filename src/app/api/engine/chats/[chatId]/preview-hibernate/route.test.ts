import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const hibernatePreviewHostSession = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/preview/session-store")>(
    "@/lib/gen/preview/session-store",
  );
  return {
    ...actual,
    getActivePreviewSessionAsync,
  };
});

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  hibernatePreviewHostSession,
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

import { POST } from "./route";

describe("POST preview-hibernate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1" },
    });
  });

  it("returns 503 when tier-2 preview is not configured", async () => {
    isTier2PreviewConfigured.mockReturnValue(false);

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("preview_session_not_configured");
    expect(hibernatePreviewHostSession).not.toHaveBeenCalled();
  });

  it("hibernates matching preview_host session", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });
    hibernatePreviewHostSession.mockResolvedValue({ ok: true, hibernated: true });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; hibernated?: boolean };
    expect(body).toMatchObject({ ok: true, hibernated: true });
    expect(hibernatePreviewHostSession).toHaveBeenCalledWith({ previewSessionId: "ps1" });
  });
});
