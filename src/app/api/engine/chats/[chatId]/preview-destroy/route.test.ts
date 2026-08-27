import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const clearPreviewSessionAsync = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const destroyPreviewHostSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  updateVersionPreviewUrl,
}));

vi.mock("@/lib/gen/preview/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/preview/session-store")>(
    "@/lib/gen/preview/session-store",
  );
  return {
    ...actual,
    getActivePreviewSessionAsync,
    clearPreviewSessionAsync,
  };
});

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  destroyPreviewHostSession,
}));

import { POST } from "./route";

describe("POST preview-destroy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1" },
    });
    updateVersionPreviewUrl.mockResolvedValue(true);
    clearPreviewSessionAsync.mockResolvedValue(true);
  });

  it("destroys preview_host sessions and clears stored preview url", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
      lifecycleToken: "life-1",
    });
    destroyPreviewHostSession.mockResolvedValue({ ok: true, destroyed: true });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as {
      ok: boolean;
      destroyed?: boolean;
      clearedPreviewUrl?: boolean;
      tier2Provider?: string | null;
    };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      destroyed: true,
      clearedPreviewUrl: true,
      tier2Provider: "preview_host",
    });
    expect(destroyPreviewHostSession).toHaveBeenCalledWith({
      previewSessionId: "ps1",
      lifecycleToken: "life-1",
    });
    expect(clearPreviewSessionAsync).toHaveBeenCalledWith("c1", {
      expectedPreviewSessionId: "ps1",
      expectedLifecycleToken: "life-1",
    });
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("v1", null);
  });

  it("clears version preview url even when no matching session exists", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);

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
    expect(clearPreviewSessionAsync).not.toHaveBeenCalled();
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("v1", null);
  });

  it("clears local state and defers host destroy when preview_host returns a retryable failure", async () => {
    // Retryable host failures (5xx, network blips) used to bubble up as a 502
    // and leave the local Redis pointer dangling — the user could not recover
    // from a zombie session. We now clear local state regardless and surface
    // `providerDestroyDeferred: true`. Host orphans are reaped by idle TTL or
    // `/admin/cleanup`.
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "sb1",
      previewUrl: "https://preview.example",
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
        body: JSON.stringify({ versionId: "v1", previewSessionId: "sb1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as {
      ok: boolean;
      destroyed?: boolean;
      clearedPreviewUrl?: boolean;
      providerDestroyDeferred?: boolean;
      message?: string;
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.destroyed).toBe(false);
    expect(body.clearedPreviewUrl).toBe(true);
    expect(body.providerDestroyDeferred).toBe(true);
    expect(body.message).toBe("preview-host unavailable");
    expect(clearPreviewSessionAsync).toHaveBeenCalledWith("c1", {
      expectedPreviewSessionId: "sb1",
      expectedLifecycleToken: undefined,
    });
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("v1", null);
  });

  it("returns 400 when preview_host destroy fails non-retryably", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "sb1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });
    destroyPreviewHostSession.mockResolvedValue({
      ok: false,
      message: "invalid previewSessionId",
      retryable: false,
    });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "sb1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("destroy_failed");
    expect(clearPreviewSessionAsync).not.toHaveBeenCalled();
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
  });

  it("does not clear a newer pointer or its version URL after a stale destroy", async () => {
    const oldSession = {
      previewSessionId: "ps-shared",
      previewUrl: "https://preview.example",
      versionId: "v1",
      lifecycleToken: "life-old",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    };
    const newSession = {
      ...oldSession,
      previewUrl: "https://preview.example/new",
      lifecycleToken: "life-new",
    };
    getActivePreviewSessionAsync
      .mockResolvedValueOnce(oldSession)
      .mockResolvedValueOnce(newSession);
    destroyPreviewHostSession.mockResolvedValue({
      ok: true,
      destroyed: false,
      superseded: true,
    });
    clearPreviewSessionAsync.mockResolvedValue(false);

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps-shared" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      destroyed: false,
      clearedPreviewUrl: false,
      reason: "session_superseded",
    });
    expect(updateVersionPreviewUrl.mock.calls).toEqual([
      ["v1", null],
      ["v1", "https://preview.example/new"],
    ]);
    expect(updateVersionPreviewUrl.mock.invocationCallOrder[0]).toBeLessThan(
      clearPreviewSessionAsync.mock.invocationCallOrder[0]!,
    );
  });

  it("restores the active preview URL and returns 500 when Redis clear fails", async () => {
    const session = {
      previewSessionId: "ps1",
      previewUrl: "https://preview.example/current",
      versionId: "v1",
      lifecycleToken: "life-1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    };
    getActivePreviewSessionAsync.mockResolvedValue(session);
    destroyPreviewHostSession.mockResolvedValue({ ok: true, destroyed: true });
    clearPreviewSessionAsync.mockRejectedValue(new Error("redis unavailable"));

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, reason: "session_store_failed" });
    expect(updateVersionPreviewUrl.mock.calls).toEqual([
      ["v1", null],
      ["v1", "https://preview.example/current"],
    ]);
  });
});
