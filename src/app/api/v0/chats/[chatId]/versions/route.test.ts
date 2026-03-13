import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const assertV0Key = vi.hoisted(() => vi.fn());
const v0ChatsGetById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/fallback", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getChatByV0ChatIdForRequest,
  getProjectByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionsByChat,
}));

vi.mock("@/lib/gen/preview", () => ({
  buildPreviewUrl,
}));

vi.mock("@/lib/v0", () => ({
  assertV0Key,
  v0: {
    chats: {
      getById: v0ChatsGetById,
    },
  },
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

import { GET } from "./route";

describe("GET /api/v0/chats/[chatId]/versions", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getProjectByIdForRequest.mockReset();
    getVersionsByChat.mockReset();
    buildPreviewUrl.mockReset();
    assertV0Key.mockReset();
    v0ChatsGetById.mockReset();
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
    expect(json.versions[0].demoUrl).toBeNull();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("does not leak raw v0 fallback versions for unowned projects", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);
    v0ChatsGetById.mockResolvedValue({
      projectId: "v0_proj_1",
      latestVersion: {
        id: "ver_v0",
        demoUrl: "https://demo.example",
      },
    });
    getProjectByIdForRequest.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.com/api/v0/chats/chat_external/versions"),
      { params: Promise.resolve({ chatId: "chat_external" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ versions: [] });
  });
});
