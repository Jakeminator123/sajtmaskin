import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMessageStreamRequest = vi.hoisted(() => vi.fn());

vi.mock("../stream/route", () => ({
  handleMessageStreamRequest,
}));

import { POST } from "./route";

function buildSseResponse(
  events: Array<{ event: string; data: unknown }>,
  headers: Record<string, string> = {},
) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      ...headers,
    },
  });
}

describe("POST /api/v0/chats/[chatId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts streamed own-engine results into the sync fallback payload", async () => {
    handleMessageStreamRequest.mockResolvedValue(
      buildSseResponse(
        [
          { event: "chatId", data: { id: "chat_1" } },
          { event: "content", data: "Uppdaterad " },
          { event: "content", data: { text: "hemsida" } },
          {
            event: "done",
            data: {
              chatId: "chat_1",
              messageId: "msg_1",
              versionId: "ver_1",
              demoUrl: "https://preview.example/chat_1/ver_1",
            },
          },
        ],
        { "Set-Cookie": "sid=test; Path=/;" },
      ),
    );

    const response = await POST(
      new Request("https://example.com/api/v0/chats/chat_1/messages", { method: "POST" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBe("sid=test; Path=/;");
    await expect(response.json()).resolves.toMatchObject({
      chatId: "chat_1",
      messageId: "msg_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/chat_1/ver_1",
      text: "Uppdaterad hemsida",
      latestVersion: {
        id: "ver_1",
        versionId: "ver_1",
        demoUrl: "https://preview.example/chat_1/ver_1",
        messageId: "msg_1",
      },
    });
  });

  it("preserves awaiting-input responses without forcing a version id", async () => {
    handleMessageStreamRequest.mockResolvedValue(
      buildSseResponse([
        { event: "content", data: "Behöver mer information om målgruppen." },
        {
          event: "done",
          data: {
            chatId: "chat_1",
            versionId: null,
            demoUrl: null,
            messageId: null,
            awaitingInput: true,
            reason: "followup_redesign_ambiguous",
          },
        },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/v0/chats/chat_1/messages", { method: "POST" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      chatId: "chat_1",
      versionId: null,
      demoUrl: null,
      awaitingInput: true,
      reason: "followup_redesign_ambiguous",
      latestVersion: null,
      text: "Behöver mer information om målgruppen.",
    });
  });

  it("returns a JSON error when the delegated stream never emits done", async () => {
    handleMessageStreamRequest.mockResolvedValue(
      buildSseResponse([{ event: "error", data: { message: "Broken stream" } }]),
    );

    const response = await POST(
      new Request("https://example.com/api/v0/chats/chat_1/messages", { method: "POST" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "Broken stream",
    });
  });
});
