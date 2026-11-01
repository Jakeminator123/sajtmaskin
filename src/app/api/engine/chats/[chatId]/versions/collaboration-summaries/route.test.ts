import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getApprovalStatus = vi.hoisted(() => vi.fn());
const getUnresolvedCommentCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));
vi.mock("@/lib/db/services/collaboration", () => ({
  getApprovalStatus,
  getUnresolvedCommentCount,
}));

const { GET } = await import("./route");
const context = { params: Promise.resolve({ chatId: "chat_owned" }) };

describe("GET collaboration summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_internal" });
    getEngineVersionForChatByIdForRequest.mockImplementation(
      async (_request: Request, _chatId: string, versionId: string) =>
        versionId === "version_owned"
          ? { version: { id: "version_internal" }, chat: { id: "chat_internal" } }
          : null,
    );
    getApprovalStatus.mockResolvedValue({ status: "approved" });
    getUnresolvedCommentCount.mockResolvedValue(2);
  });

  it("omits versions that are not owned through the requested chat", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/engine/chats/chat_owned/versions/collaboration-summaries?versionIds=version_owned,version_foreign",
      ),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries: { version_owned: { approvalStatus: "approved", unresolvedCount: 2 } },
    });
    expect(getApprovalStatus).toHaveBeenCalledTimes(1);
    expect(getApprovalStatus).toHaveBeenCalledWith("version_internal");
    expect(getUnresolvedCommentCount).toHaveBeenCalledWith("version_internal");
  });

  it("rejects oversized summary batches before storage access", async () => {
    const versionIds = Array.from({ length: 101 }, (_, index) => `v${index}`).join(",");

    const response = await GET(
      new Request(
        `http://localhost/api/engine/chats/chat_owned/versions/collaboration-summaries?versionIds=${versionIds}`,
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
  });

  it("rejects oversized identifiers before storage access", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/engine/chats/chat_owned/versions/collaboration-summaries?versionIds=${"x".repeat(129)}`,
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
  });

  it("deduplicates version ids before ownership and summary queries", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/engine/chats/chat_owned/versions/collaboration-summaries?versionIds=version_owned,version_owned",
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(getEngineVersionForChatByIdForRequest).toHaveBeenCalledTimes(1);
    expect(getApprovalStatus).toHaveBeenCalledTimes(1);
    expect(getUnresolvedCommentCount).toHaveBeenCalledTimes(1);
  });

  it("loads approval and comment counts in parallel after ownership", async () => {
    let releaseApproval!: () => void;
    let releaseCount!: () => void;
    getApprovalStatus.mockImplementation(
      () => new Promise<{ status: string }>((resolve) => {
        releaseApproval = () => resolve({ status: "approved" });
      }),
    );
    getUnresolvedCommentCount.mockImplementation(
      () => new Promise<number>((resolve) => { releaseCount = () => resolve(2); }),
    );

    const pending = GET(
      new Request(
        "http://localhost/api/engine/chats/chat_owned/versions/collaboration-summaries?versionIds=version_owned",
      ),
      context,
    );
    await vi.waitFor(() => {
      expect(getApprovalStatus).toHaveBeenCalledOnce();
      expect(getUnresolvedCommentCount).toHaveBeenCalledOnce();
    });
    releaseApproval();
    releaseCount();

    expect((await pending).status).toBe(200);
  });
});
