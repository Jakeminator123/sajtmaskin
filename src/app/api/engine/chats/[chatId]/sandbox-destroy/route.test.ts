import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActiveSandboxSessionAsync = vi.hoisted(() => vi.fn());
const clearSandboxSessionAsync = vi.hoisted(() => vi.fn());
const updateVersionSandboxUrl = vi.hoisted(() => vi.fn());
const destroyPreviewHostSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  updateVersionSandboxUrl,
}));

vi.mock("@/lib/gen/sandbox/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/sandbox/session-store")>(
    "@/lib/gen/sandbox/session-store",
  );
  return {
    ...actual,
    getActiveSandboxSessionAsync,
    clearSandboxSessionAsync,
  };
});

vi.mock("@/lib/gen/sandbox/preview-host-client", () => ({
  destroyPreviewHostSession,
}));

import { POST } from "./route";

describe("POST sandbox-destroy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1" },
    });
    updateVersionSandboxUrl.mockResolvedValue(true);
  });

  it("destroys preview_host sessions and clears stored sandbox url", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });
    destroyPreviewHostSession.mockResolvedValue({ ok: true, destroyed: true });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", sandboxId: "sb1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as {
      ok: boolean;
      destroyed?: boolean;
      clearedSandboxUrl?: boolean;
      tier2Provider?: string | null;
    };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      destroyed: true,
      clearedSandboxUrl: true,
      tier2Provider: "preview_host",
    });
    expect(destroyPreviewHostSession).toHaveBeenCalledWith({ sandboxId: "sb1" });
    expect(clearSandboxSessionAsync).toHaveBeenCalledWith("c1");
    expect(updateVersionSandboxUrl).toHaveBeenCalledWith("v1", null);
  });

  it("clears version sandbox url even when no matching session exists", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as {
      ok: boolean;
      reason?: string;
      destroyed?: boolean;
      tier2Provider?: string | null;
    };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      reason: "no_matching_session",
      destroyed: false,
      tier2Provider: null,
    });
    expect(destroyPreviewHostSession).not.toHaveBeenCalled();
    expect(clearSandboxSessionAsync).not.toHaveBeenCalled();
    expect(updateVersionSandboxUrl).toHaveBeenCalledWith("v1", null);
  });

  it("returns 502 when preview_host destroy fails", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });
    destroyPreviewHostSession.mockResolvedValue({
      ok: false,
      message: "preview-host unavailable",
      retryable: true,
    });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", sandboxId: "sb1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("destroy_failed");
    expect(updateVersionSandboxUrl).not.toHaveBeenCalled();
  });
});
