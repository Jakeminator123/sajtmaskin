import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getApprovalStatus = vi.hoisted(() => vi.fn());
const requestApproval = vi.hoisted(() => vi.fn());
const submitApproval = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest }));
vi.mock("@/lib/db/services/collaboration", () => ({
  getApprovalStatus,
  requestApproval,
  submitApproval,
}));

const { GET, POST } = await import("./route");
const context = { params: Promise.resolve({ chatId: "chat_1", versionId: "version_1" }) };

describe("version approval route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_internal" },
      version: { id: "version_internal" },
    });
  });

  it("rejects an oversized approval comment", async () => {
    const response = await POST(
      new Request("http://localhost/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", comment: "x".repeat(5_001) }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(getApprovalStatus).not.toHaveBeenCalled();
  });

  it("does not expose approval-service failures", async () => {
    getApprovalStatus.mockRejectedValue(new Error("database host secret"));

    const response = await GET(new Request("http://localhost/approval"), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to get approval status" });
  });
});
