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

describe("GET preview-status (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
  });

  it("returns missing + preview_session_not_configured when tier-2 is disabled", async () => {
    isTier2PreviewConfigured.mockReturnValue(false);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("missing");
    expect(body.reason).toBe("preview_session_not_configured");
  });

  it("returns stopped + preview_session_id_mismatch for mismatched client session id", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_server",
      sandboxUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await GET(
      new Request(
        "http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1&previewSessionId=sb_client",
      ),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("stopped");
    expect(body.reason).toBe("preview_session_id_mismatch");
  });

  it("returns missing + no_session when no preview session exists", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("missing");
    expect(body.reason).toBe("no_session");
  });

  it("returns version_mismatch when session points to another version", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_server",
      sandboxUrl: "https://preview.example",
      versionId: "v2",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      reason?: string;
      versionId?: string | null;
    };
    expect(body.status).toBe("version_mismatch");
    expect(body.reason).toBe("session_bound_to_other_version");
    expect(body.versionId).toBe("v2");
  });

  it("returns stopped + provider_not_running_or_unreachable when resume fails", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_1",
      sandboxUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("stopped");
    expect(body.reason).toBe("provider_not_running_or_unreachable");
  });

  it("returns running when resume succeeds", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_1",
      sandboxUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      sandboxId: "sb_1",
      primaryUrl: "https://live.example",
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; previewUrl?: string };
    expect(body.status).toBe("running");
    expect(body.previewUrl).toBe("https://live.example");
  });
});

