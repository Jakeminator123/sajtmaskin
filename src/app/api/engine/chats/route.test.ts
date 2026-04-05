import { beforeEach, describe, expect, it, vi } from "vitest";

const handleCreateChatStreamPost = vi.hoisted(() => vi.fn());

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

describe("/api/engine/chats POST (sync JSON)", () => {
  beforeEach(() => {
    handleCreateChatStreamPost.mockReset();
  });

  it("converts SSE transcript without legacy v0 logging dependency", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine"}',
      "",
      "event: done",
      'data: {"chatId":"chat_eng","versionId":"ver_eng","messageId":"msg_eng","sandboxPending":false,"preflight":{"previewBlocked":false,"verificationBlocked":false}}',
      "",
    ].join("\n");

    handleCreateChatStreamPost.mockResolvedValue(
      new Response(sse, {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const res = await POST(
      new Request("https://example.com/api/engine/chats", {
        method: "POST",
        body: JSON.stringify({ message: "hi" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const json = await res.json();
    expect(json.id).toBe("chat_eng");
  });

  it("uses sandbox-ready as preview fallback in sync create JSON", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine"}',
      "",
      "event: done",
      'data: {"chatId":"chat_eng","versionId":"ver_eng","messageId":"msg_eng","sandboxPending":true,"preflight":{"previewBlocked":false,"verificationBlocked":false}}',
      "",
      "event: sandbox-ready",
      'data: {"sandboxUrl":"https://vm.example/chat_eng/ver_eng","sandboxId":"sbx_1"}',
      "",
    ].join("\n");

    handleCreateChatStreamPost.mockResolvedValue(
      new Response(sse, {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const res = await POST(
      new Request("https://example.com/api/engine/chats", {
        method: "POST",
        body: JSON.stringify({ message: "hi" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const json = await res.json();
    expect(json.previewUrl).toBe("https://vm.example/chat_eng/ver_eng");
    expect(json.latestVersion).toMatchObject({
      id: "ver_eng",
      versionId: "ver_eng",
      previewUrl: "https://vm.example/chat_eng/ver_eng",
      sandboxUrl: "https://vm.example/chat_eng/ver_eng",
      sandboxPending: true,
      verificationState: "pending",
    });
  });
});

describe("/api/engine/chats GET", () => {
  beforeEach(() => {
    vi.mocked(getAppProjectByIdForRequest).mockReset();
    vi.mocked(listChatsByProject).mockReset();
  });

  it("delegates to shared list handler", async () => {
    vi.mocked(getAppProjectByIdForRequest).mockResolvedValue({ id: "p1" } as never);
    vi.mocked(listChatsByProject).mockResolvedValue([] as never);
    const res = await GET(new Request("https://example.com/api/engine/chats?projectId=x"));
    const json = await res.json();
    expect(json.chats).toEqual([]);
  });
});
