import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const updateVersionSandboxUrl = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/generation-pipeline", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
  getChatByV0ChatIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionsByChat,
  updateVersionSandboxUrl,
}));

vi.mock("@/lib/gen/preview", () => ({
  buildPreviewUrl,
}));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => []),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  versions: {
    id: Symbol("id"),
    v0VersionId: Symbol("v0VersionId"),
    v0MessageId: Symbol("v0MessageId"),
    demoUrl: Symbol("demoUrl"),
    pinned: Symbol("pinned"),
    pinnedAt: Symbol("pinnedAt"),
    createdAt: Symbol("createdAt"),
    chatId: Symbol("chatId"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
}));

import { GET, PATCH } from "./route";

describe("GET /api/v0/chats/[chatId]/versions", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getEngineVersionForChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getVersionsByChat.mockReset();
    updateVersionSandboxUrl.mockReset();
    buildPreviewUrl.mockReset();
  });

  it("returns failed own-engine versions without a preview URL", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_failed",
        created_at: "2026-03-13T10:01:00.000Z",
        version_number: 3,
        message_id: "msg_1",
        sandbox_url: "https://sandbox.example",
        release_state: "draft",
        verification_state: "failed",
        verification_summary: "Broken build",
        promoted_at: null,
      },
    ]);

    const response = await GET(new Request("https://example.com/api/v0/chats/chat_1/versions"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0].legacyShimPreviewUrl).toBeNull();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("returns legacyShimPreviewUrl but null previewUrl when own-engine preview may be exposed", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_ok",
        created_at: "2026-03-13T10:01:00.000Z",
        version_number: 3,
        message_id: "msg_1",
        sandbox_url: "https://sandbox.example",
        release_state: "draft",
        verification_state: "passed",
        verification_summary: null,
        promoted_at: null,
      },
    ]);
    buildPreviewUrl.mockReturnValue("/api/preview-render?chatId=chat_1&versionId=ver_ok");

    const response = await GET(new Request("https://example.com/api/v0/chats/chat_1/versions"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0].legacyShimPreviewUrl).toBe(
      "/api/preview-render?chatId=chat_1&versionId=ver_ok",
    );
    expect(buildPreviewUrl).toHaveBeenCalledWith("chat_1", "ver_ok");
  });

  it("returns empty versions when chat is not engine-backed and has no legacy DB mapping", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.com/api/v0/chats/chat_external/versions"),
      { params: Promise.resolve({ chatId: "chat_external" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ versions: [] });
  });

  it("persists sandbox URLs for own-engine versions", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "ver_1" },
    });
    updateVersionSandboxUrl.mockResolvedValue(true);

    const response = await PATCH(
      new Request("https://example.com/api/v0/chats/chat_1/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver_1",
          sandboxUrl: "https://sandbox.example/ver_1",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateVersionSandboxUrl).toHaveBeenCalledWith(
      "ver_1",
      "https://sandbox.example/ver_1",
    );
    expect(json).toEqual({
      success: true,
      versionId: "ver_1",
      sandboxUrl: "https://sandbox.example/ver_1",
    });
  });
});
