import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const readAll = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  readAll,
}));

import { GET } from "./route";

describe("GET version-status (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when versionId is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/versionId/);
  });

  it("returns 404 when the version is not scoped to the chat", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("projects empty event stream to idle status", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "v1" } });
    readAll.mockReturnValue([]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      versionId?: string;
      status?: { phase: string; degradations: unknown[]; eventCount: number };
    };
    expect(body.ok).toBe(true);
    expect(body.versionId).toBe("v1");
    expect(body.status?.phase).toBe("idle");
    expect(body.status?.eventCount).toBe(0);
    expect(body.status?.degradations).toEqual([]);
  });

  it("surfaces degradations from the projection", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "v1" } });
    readAll.mockReturnValue([
      {
        t: "version.degraded",
        id: "e1",
        ts: "2026-05-01T10:00:00.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        kind: "verifier_skipped_by_policy",
        message: "skipped",
        meta: { reason: "design_preview_skip_verify" },
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      ok: boolean;
      status?: { degradations: Array<{ kind: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.status?.degradations.map((d) => d.kind)).toEqual(["verifier_skipped_by_policy"]);
  });
});
