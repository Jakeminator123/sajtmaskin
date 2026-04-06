import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const tryResumeTier2Runtime = vi.hoisted(() => vi.fn());
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
  };
});

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

vi.mock("@/lib/gen/preview/tier2-resume", () => ({
  tryResumeTier2Runtime,
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

import { GET } from "./route";

describe("GET preview-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
  });

  it("returns 400 without versionId", async () => {
    const res = await GET(new Request("http://localhost/api"), { params: Promise.resolve({ chatId: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("returns missing when no session", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api?versionId=v1"), {
      params: Promise.resolve({ chatId: "c1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("missing");
  });

  it("returns version_mismatch when session version differs", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://old.example",
      versionId: "v0",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string; versionId: string | null };
    expect(body.status).toBe("version_mismatch");
    expect(body.versionId).toBe("v0");
  });

  it("returns running when resume succeeds", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({ sandboxId: "sb1", primaryUrl: "https://live.example" });
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string; previewUrl: string | null };
    expect(body.status).toBe("running");
    expect(body.previewUrl).toBe("https://live.example");
  });

  it("returns stopped when resume fails", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("stopped");
  });
});
