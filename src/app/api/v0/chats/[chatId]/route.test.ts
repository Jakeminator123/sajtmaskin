import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const getScaffoldById = vi.hoisted(() => vi.fn());
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
  getPreferredVersion,
  getLatestVersion,
}));

vi.mock("@/lib/gen/preview", () => ({
  buildPreviewUrl,
}));

vi.mock("@/lib/gen/scaffolds", () => ({
  getScaffoldById,
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
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  versions: {
    chatId: Symbol("chatId"),
    createdAt: Symbol("createdAt"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/v0/chats/[chatId]", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getProjectByIdForRequest.mockReset();
    getPreferredVersion.mockReset();
    getLatestVersion.mockReset();
    buildPreviewUrl.mockReset();
    getScaffoldById.mockReset();
    assertV0Key.mockReset();
    v0ChatsGetById.mockReset();
  });

  it("does not expose a preview URL for failed own-engine versions", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      title: "Test",
      model: "gpt-5.4",
      scaffold_id: null,
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:00:00.000Z",
      messages: [],
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_failed",
      created_at: "2026-03-13T10:01:00.000Z",
      version_number: 2,
      message_id: "msg_1",
      sandbox_url: "https://sandbox.example",
      release_state: "draft",
      verification_state: "failed",
      verification_summary: "Blocking preflight errors",
      promoted_at: null,
    });

    const response = await GET(new Request("https://example.com/api/v0/chats/chat_1"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.demoUrl).toBeNull();
    expect(json.latestVersion.demoUrl).toBeNull();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("rejects raw v0 fallback chats when the project is not owned by the request", async () => {
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

    const response = await GET(new Request("https://example.com/api/v0/chats/chat_external"), {
      params: Promise.resolve({ chatId: "chat_external" }),
    });

    expect(response.status).toBe(404);
    expect(getProjectByIdForRequest).toHaveBeenCalledWith(expect.any(Request), "v0_proj_1");
  });

  it("allows raw v0 fallback chats only when the backing project belongs to the request", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);
    v0ChatsGetById.mockResolvedValue({
      projectId: "v0_proj_1",
      webUrl: "https://v0.example/chat",
      latestVersion: {
        id: "ver_v0",
        demoUrl: "https://demo.example",
        messageId: "msg_v0",
      },
    });
    getProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      v0ProjectId: "v0_proj_1",
    });

    const response = await GET(new Request("https://example.com/api/v0/chats/chat_external"), {
      params: Promise.resolve({ chatId: "chat_external" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.v0ProjectId).toBe("v0_proj_1");
    expect(json.demoUrl).toBe("https://demo.example");
    expect(json.latestVersion).toMatchObject({
      versionId: "ver_v0",
      messageId: "msg_v0",
      demoUrl: "https://demo.example",
    });
  });
});
