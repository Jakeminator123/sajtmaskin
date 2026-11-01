import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const createComment = vi.hoisted(() => vi.fn());
const getCommentsForVersion = vi.hoisted(() => vi.fn());
const resolveComment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest }));
vi.mock("@/lib/db/services/collaboration", () => ({
  createComment,
  getCommentsForVersion,
  resolveComment,
}));

const { GET, PATCH, POST } = await import("./route");
const context = { params: Promise.resolve({ chatId: "chat_public", versionId: "version_public" }) };

function request(method: "GET" | "PATCH" | "POST", body?: unknown) {
  return new Request("http://localhost/api/engine/chats/chat_public/versions/version_public/comments", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("version comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_internal" },
      version: { id: "version_internal" },
    });
    getCommentsForVersion.mockResolvedValue([]);
  });

  it("scopes comment resolution to the owned version", async () => {
    resolveComment.mockResolvedValue(null);

    const response = await PATCH(request("PATCH", { commentId: "comment_foreign" }), context);

    expect(response.status).toBe(404);
    expect(resolveComment).toHaveBeenCalledWith("comment_foreign", "version_internal");
  });

  it("rejects oversized comment metadata before persistence", async () => {
    const longComment = await POST(request("POST", { content: "x".repeat(5_001) }), context);
    const longAuthor = await POST(
      request("POST", { content: "ok", authorName: "x".repeat(101) }),
      context,
    );

    expect(longComment.status).toBe(400);
    expect(longAuthor.status).toBe(400);
    expect(createComment).not.toHaveBeenCalled();
  });

  it("does not expose collaboration-service failures", async () => {
    getCommentsForVersion.mockRejectedValue(new Error("database host secret"));

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to list comments" });
  });
});
