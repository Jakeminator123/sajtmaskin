import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const tryResumeTier2Runtime = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));
const getVersionById = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById,
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
    getVersionById.mockResolvedValue(null);
  });

  it("returns 400 without versionId", async () => {
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(400);
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
      mismatchDirection?: string;
    };
    expect(body.status).toBe("version_mismatch");
    expect(body.reason).toBe("session_bound_to_other_version");
    expect(body.versionId).toBe("v2");
    expect(body.mismatchDirection).toBe("unknown");
  });

  it("marks version_mismatch when the active VM session is newer than the selected version", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_server",
      sandboxUrl: "https://preview.example",
      versionId: "v4",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    getVersionById.mockImplementation(async (versionId: string) => {
      if (versionId === "v3") return { id: "v3", chat_id: "chat_1", version_number: 3 };
      if (versionId === "v4") return { id: "v4", chat_id: "chat_1", version_number: 4 };
      return null;
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v3"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      versionId?: string | null;
      mismatchDirection?: string;
    };
    expect(body.status).toBe("version_mismatch");
    expect(body.versionId).toBe("v4");
    expect(body.mismatchDirection).toBe("session_newer");
  });

  it("returns stopped + provider_not_running_or_unreachable when resume fails", async () => {
    const oldEnough = Date.now() - 120_000;
    getActivePreviewSessionAsync.mockResolvedValue({
      sandboxId: "sb_1",
      sandboxUrl: "https://preview.example",
      versionId: "v1",
      createdAt: oldEnough,
      lastUsedAt: oldEnough,
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

