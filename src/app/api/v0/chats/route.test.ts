import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleCreateChatStreamPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/engine/chats/v0-chats-compat", () => ({
  logLegacyV0ChatsHit: vi.fn(),
}));

vi.mock("@/lib/api/engine/chats/create-chat-stream-post", () => ({
  handleCreateChatStreamPost,
}));

vi.mock("@/lib/tenant", () => ({
  getAppProjectByIdForRequest: vi.fn(),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  listChatsByProject: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAppProjectByIdForRequest } from "@/lib/tenant";
import { listChatsByProject } from "@/lib/db/chat-repository-pg";

describe("GET /api/v0/chats", () => {
  beforeEach(() => {
    vi.mocked(getAppProjectByIdForRequest).mockReset();
    vi.mocked(listChatsByProject).mockReset();
  });

  it("returns empty chats when projectId is missing", async () => {
    const res = await GET(new Request("https://example.com/api/v0/chats"));
    const json = await res.json();
    expect(json.chats).toEqual([]);
  });

  it("lists chats for an owned project", async () => {
    vi.mocked(getAppProjectByIdForRequest).mockResolvedValue({ id: "proj_internal" } as never);
    vi.mocked(listChatsByProject).mockResolvedValue([{ id: "c1" }] as never);

    const res = await GET(new Request("https://example.com/api/v0/chats?projectId=ext_1"));
    const json = await res.json();
    expect(json.chats).toEqual([{ id: "c1" }]);
  });
});

describe("POST /api/v0/chats (sync JSON adapter)", () => {
  beforeEach(() => {
    handleCreateChatStreamPost.mockReset();
  });

  it("passes through non-SSE responses from the shared stream handler", async () => {
    handleCreateChatStreamPost.mockResolvedValue(
      NextResponse.json({ error: "bad" }, { status: 400 }),
    );

    const res = await POST(
      new Request("https://example.com/api/v0/chats", {
        method: "POST",
        body: JSON.stringify({ message: "x" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad");
  });

  it("converts SSE transcript to JSON for create-chat", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine","promptStrategy":"direct","modelId":"gpt-test"}',
      "",
      "event: done",
      'data: {"chatId":"chat_1","versionId":"ver_1","messageId":"msg_1","sandboxPending":false,"preflight":{"previewBlocked":false,"verificationBlocked":false,"previewBlockingReason":null}}',
      "",
    ].join("\n");

    handleCreateChatStreamPost.mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );

    const res = await POST(
      new Request("https://example.com/api/v0/chats", {
        method: "POST",
        body: JSON.stringify({ message: "Bygg en sida" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("chat_1");
    expect(json.internalChatId).toBe("chat_1");
    expect(json.meta).toMatchObject({ enginePath: "own-engine", promptStrategy: "direct" });
    expect(json.latestVersion).toMatchObject({
      versionId: "ver_1",
      messageId: "msg_1",
    });
  });
});
