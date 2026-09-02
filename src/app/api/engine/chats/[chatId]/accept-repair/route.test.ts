import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const acceptRepair = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const hasActiveVersionLease = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  acceptRepair,
  getLatestVersion,
  hasActiveVersionLease,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/engine/chats/chat-1/accept-repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const scoped = {
  chat: { id: "chat-1" },
  version: { id: "ver-1" },
};

describe("POST /accept-repair — lease fail-closed (L4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue(scoped);
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    createEngineVersionErrorLogs.mockResolvedValue(undefined);
  });

  it("returns retryable 503 lease_unavailable when the lease probe throws — never accepts", async () => {
    hasActiveVersionLease.mockRejectedValue(new Error("connection reset"));

    const res = await POST(req({ versionId: "ver-1" }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      error: "lease_unavailable",
      code: "lease_unavailable",
      retryable: true,
    });
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(acceptRepair).not.toHaveBeenCalled();
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("returns retryable 503 lease_unavailable when acceptRepair cannot prove the lease table", async () => {
    hasActiveVersionLease.mockResolvedValue(false);
    acceptRepair.mockResolvedValue("lease_unavailable");

    const res = await POST(req({ versionId: "ver-1" }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      error: "lease_unavailable",
      code: "lease_unavailable",
      retryable: true,
    });
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(acceptRepair).toHaveBeenCalledWith("ver-1", "Server repair accepted and applied.");
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("returns 409 with no Retry-After when there is genuinely no pending repair", async () => {
    hasActiveVersionLease.mockResolvedValue(false);
    acceptRepair.mockResolvedValue(null);

    const res = await POST(req({ versionId: "ver-1" }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "No pending server repair found for this version.",
    });
    expect(body.code).toBeUndefined();
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(acceptRepair).toHaveBeenCalledTimes(1);
  });

  it("returns 409 version_busy without accepting when a live lease is held", async () => {
    hasActiveVersionLease.mockResolvedValue(true);

    const res = await POST(req({ versionId: "ver-1" }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("version_busy");
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(acceptRepair).not.toHaveBeenCalled();
  });
});
