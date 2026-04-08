import { describe, expect, it, vi } from "vitest";

const delegatedPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/engine/chats/chat-message-stream-post", () => ({
  POST: delegatedPost,
  handleMessageStreamRequest: vi.fn(),
}));

import { POST, maxDuration, runtime } from "./route";

describe("POST /api/engine/chats/[chatId]/stream", () => {
  it("delegates to follow-up stream handler", async () => {
    const expected = new Response("stream", { status: 200 });
    delegatedPost.mockResolvedValue(expected);
    const request = new Request("https://example.com/api/engine/chats/chat_1/stream", {
      method: "POST",
      body: JSON.stringify({ message: "uppdatera" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ chatId: "chat_1" }) };

    const response = await POST(request, ctx);

    expect(delegatedPost).toHaveBeenCalledWith(request, ctx);
    expect(response).toBe(expected);
  });

  it("uses node runtime and stream maxDuration", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(800);
  });
});
