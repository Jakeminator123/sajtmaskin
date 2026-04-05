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

describe("POST /api/engine/chats/[chatId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses sandbox-ready as preview fallback in follow-up sync JSON", async () => {
    handleMessageStreamRequest.mockResolvedValue(
      buildSseResponse([
        { event: "content", data: "Uppdaterad sida" },
        {
          event: "done",
          data: {
            chatId: "chat_1",
            messageId: "msg_1",
            versionId: "ver_1",
            previewUrl: null,
            sandboxPending: true,
            preflight: { previewBlocked: false, verificationBlocked: false },
            previewBlocked: false,
            verificationBlocked: false,
          },
        },
        {
          event: "sandbox-ready",
          data: {
            sandboxUrl: "https://vm.example/chat_1/ver_1",
            sandboxId: "sbx_1",
          },
        },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/messages", { method: "POST" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      chatId: "chat_1",
      versionId: "ver_1",
      previewUrl: "https://vm.example/chat_1/ver_1",
      sandboxPending: true,
      latestVersion: {
        id: "ver_1",
        versionId: "ver_1",
        messageId: "msg_1",
        previewUrl: "https://vm.example/chat_1/ver_1",
        sandboxUrl: "https://vm.example/chat_1/ver_1",
        sandboxPending: true,
        verificationState: "pending",
      },
      text: "Uppdaterad sida",
    });
  });
});
