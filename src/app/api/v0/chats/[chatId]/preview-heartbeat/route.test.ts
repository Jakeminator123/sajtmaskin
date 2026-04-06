import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const touchPreviewSessionAsync = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/preview/session-store")>(
    "@/lib/gen/preview/session-store",
  );
  return {
    ...actual,
    getActivePreviewSessionAsync,
    touchPreviewSessionAsync,
  };
});

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

import { POST } from "./route";

describe("POST preview-heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
  });

  it("rejects when session missing", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "sb1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_session");
    expect(touchPreviewSessionAsync).not.toHaveBeenCalled();
  });

  it("touches session when ids match", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "sb1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(touchPreviewSessionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "c1",
        sandboxId: "sb1",
        versionId: "v1",
      }),
    );
  });

  it("rejects on previewSessionId mismatch", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "other", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("session_mismatch");
  });
});
