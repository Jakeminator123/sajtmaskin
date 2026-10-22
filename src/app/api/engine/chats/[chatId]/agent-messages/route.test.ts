import { afterEach, describe, expect, it, vi } from "vitest";

const getChat = vi.hoisted(() => vi.fn());
const listMessages = vi.hoisted(() => vi.fn());
const appendMessages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: async (_req: Request, _key: string, fn: () => Promise<Response>) => fn(),
}));
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest: getChat,
}));
vi.mock("@/lib/db/services/agent-messages", () => ({
  listAgentMessages: listMessages,
  appendAgentMessages: appendMessages,
}));

import { GET, POST } from "./route";

function context(chatId: string) {
  return { params: Promise.resolve({ chatId }) };
}

function req(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost/api/engine/chats/chat_1/agent-messages", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/engine/chats/[chatId]/agent-messages", () => {
  it("404 när chatten inte ägs — och läser aldrig DB", async () => {
    getChat.mockResolvedValue(null);
    const res = await GET(req("GET"), context("stolen"));
    expect(res.status).toBe(404);
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("returnerar raderna med ISO-tid", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    listMessages.mockResolvedValue([
      {
        id: "oc-1",
        chatId: "chat_1",
        role: "user",
        kind: "chat",
        content: "Vad tycker du?",
        meta: { anchorBuilderMessageId: "assistant-1" },
        createdAt: new Date("2026-10-22T10:00:00.000Z"),
      },
    ]);
    const res = await GET(req("GET"), context("chat_1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { messages: Array<Record<string, unknown>> };
    expect(data.messages).toEqual([
      {
        id: "oc-1",
        role: "user",
        kind: "chat",
        content: "Vad tycker du?",
        meta: { anchorBuilderMessageId: "assistant-1" },
        createdAt: "2026-10-22T10:00:00.000Z",
      },
    ]);
  });
});

describe("POST /api/engine/chats/[chatId]/agent-messages", () => {
  it("404 när chatten inte ägs — och skriver aldrig", async () => {
    getChat.mockResolvedValue(null);
    const res = await POST(
      req("POST", { messages: [{ id: "x", role: "user", content: "hej" }] }),
      context("stolen"),
    );
    expect(res.status).toBe(404);
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it("400 på ogiltig payload", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    const res = await POST(req("POST", { messages: [] }), context("chat_1"));
    expect(res.status).toBe(400);
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it("persisterar med klientens tid och speglar builderTarget mot URL-chatten", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    appendMessages.mockResolvedValue(true);
    const res = await POST(
      req("POST", {
        messages: [
          {
            id: "oc-1",
            role: "assistant",
            kind: "chat",
            content: "Svar",
            timestamp: 1_700_000_000_000,
            meta: {
              anchorBuilderMessageId: null,
              builderTarget: { chatId: "other", versionId: "v9" },
            },
          },
          { id: "oc-2", role: "user", content: "[Byggresultat] x", kind: "internal" },
        ],
      }),
      context("chat_1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ persisted: true, count: 2 });
    expect(appendMessages).toHaveBeenCalledWith("chat_1", [
      {
        id: "oc-1",
        role: "assistant",
        kind: "chat",
        content: "Svar",
        meta: { anchorBuilderMessageId: null, builderTarget: null },
        createdAt: new Date(1_700_000_000_000),
      },
      { id: "oc-2", role: "user", kind: "internal", content: "[Byggresultat] x", meta: null, createdAt: null },
    ]);
  });

  it("svarar persisted:false när DB saknas utan att fela", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    appendMessages.mockResolvedValue(false);
    const res = await POST(
      req("POST", { messages: [{ id: "oc-3", role: "user", content: "hej" }] }),
      context("chat_1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ persisted: false, count: 1 });
  });
});
