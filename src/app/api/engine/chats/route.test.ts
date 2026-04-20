import { NextResponse } from "next/server";
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
      'data: {"chatId":"chat_eng","versionId":"ver_eng","messageId":"msg_eng","previewPending":false,"preflight":{"previewBlocked":false,"verificationBlocked":false}}',
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

  it("uses preview-ready as preview fallback in sync create JSON", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine"}',
      "",
      "event: done",
      'data: {"chatId":"chat_eng","versionId":"ver_eng","messageId":"msg_eng","previewPending":true,"preflight":{"previewBlocked":false,"verificationBlocked":false}}',
      "",
      "event: preview-ready",
      'data: {"previewUrl":"https://vm.example/chat_eng/ver_eng","previewSessionId":"sbx_1"}',
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
      previewPending: false,
      verificationState: "pending",
    });
  });

  it("passes through non-SSE responses from the shared stream handler (migrated from v0)", async () => {
    handleCreateChatStreamPost.mockResolvedValue(
      NextResponse.json({ error: "bad" }, { status: 400 }),
    );

    const res = await POST(
      new Request("https://example.com/api/engine/chats", {
        method: "POST",
        body: JSON.stringify({ message: "x" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad");
  });

  it("converts SSE transcript to JSON for create-chat (migrated from v0)", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine","promptStrategy":"direct","modelId":"gpt-test"}',
      "",
      "event: done",
      'data: {"chatId":"chat_1","versionId":"ver_1","messageId":"msg_1","previewPending":false,"preflight":{"previewBlocked":false,"verificationBlocked":false,"previewBlockingReason":null}}',
      "",
    ].join("\n");

    handleCreateChatStreamPost.mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );

    const res = await POST(
      new Request("https://example.com/api/engine/chats", {
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

  it("does not promote compatibility shim preview-ready to canonical previewUrl", async () => {
    const sse = [
      "event: meta",
      'data: {"enginePath":"own-engine"}',
      "",
      "event: done",
      'data: {"chatId":"chat_eng","versionId":"ver_eng","messageId":"msg_eng","previewPending":true,"preflight":{"previewBlocked":false,"verificationBlocked":false}}',
      "",
      "event: preview-ready",
      'data: {"previewUrl":"/api/preview-render?chatId=chat_eng&versionId=ver_eng","previewSessionId":"sbx_1"}',
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
    expect(json.previewUrl).toBeNull();
    expect(json.latestVersion).toMatchObject({
      id: "ver_eng",
      versionId: "ver_eng",
      previewUrl: null,
      previewPending: false,
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

  it("returns empty chats when projectId is missing (migrated from v0)", async () => {
    const res = await GET(new Request("https://example.com/api/engine/chats"));
    const json = await res.json();
    expect(json.chats).toEqual([]);
  });

  it("lists chats for an owned project (migrated from v0)", async () => {
    vi.mocked(getAppProjectByIdForRequest).mockResolvedValue({ id: "proj_internal" } as never);
    vi.mocked(listChatsByProject).mockResolvedValue([{ id: "c1" }] as never);

    const res = await GET(new Request("https://example.com/api/engine/chats?projectId=ext_1"));
    const json = await res.json();
    expect(json.chats).toEqual([{ id: "c1" }]);
  });
});
