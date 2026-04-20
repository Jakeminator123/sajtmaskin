import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const maybeAutoAcceptTimedOutRepair = vi.hoisted(() =>
  vi.fn(async (v: unknown) => ({ version: v, wasAutoAccepted: false })),
);
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/engine", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
  getChatByV0ChatIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionsByChat,
  updateVersionPreviewUrl,
  maybeAutoAcceptTimedOutRepair,
  addMessage,
  createDraftVersion,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
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

describe("GET /api/engine/chats/[chatId]/versions", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getEngineVersionForChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getVersionsByChat.mockReset();
    updateVersionPreviewUrl.mockReset();
    buildPreviewUrl.mockReset();
    maybeAutoAcceptTimedOutRepair.mockReset();
    maybeAutoAcceptTimedOutRepair.mockImplementation(async (v: unknown) => ({
      version: v,
      wasAutoAccepted: false,
    }));
    createEngineVersionErrorLogs.mockReset();
    createEngineVersionErrorLogs.mockResolvedValue(null);
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

    const response = await GET(new Request("https://example.com/api/engine/chats/chat_1/versions"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0].legacyShimPreviewUrl).toBeNull();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("keeps legacyShimPreviewUrl null for own-engine version rows", async () => {
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

    const response = await GET(new Request("https://example.com/api/engine/chats/chat_1/versions"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0].legacyShimPreviewUrl).toBeNull();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("returns empty versions when chat is not engine-backed and has no legacy DB mapping", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_external/versions"),
      { params: Promise.resolve({ chatId: "chat_external" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ versions: [] });
  });

  it("persists preview URLs for own-engine versions", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "ver_1" },
    });
    updateVersionPreviewUrl.mockResolvedValue(true);

    const response = await PATCH(
      new Request("https://example.com/api/engine/chats/chat_1/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver_1",
          previewUrl: "https://sandbox.example/ver_1",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_1",
      "https://sandbox.example/ver_1",
    );
    expect(json).toEqual({
      success: true,
      versionId: "ver_1",
      previewUrl: "https://sandbox.example/ver_1",
    });
  });
});
