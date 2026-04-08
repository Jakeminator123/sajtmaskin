import { describe, expect, it, vi } from "vitest";

const handleCreateChatStreamPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/engine/chats/create-chat-stream-post", () => ({
  handleCreateChatStreamPost,
}));

import { POST, maxDuration, runtime } from "./route";

describe("POST /api/engine/chats/stream", () => {
  it("delegates to create-chat stream handler", async () => {
    const expected = new Response("ok", { status: 201 });
    handleCreateChatStreamPost.mockResolvedValue(expected);
    const request = new Request("https://example.com/api/engine/chats/stream", {
      method: "POST",
      body: JSON.stringify({ message: "hej" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(handleCreateChatStreamPost).toHaveBeenCalledWith(request);
    expect(response).toBe(expected);
  });

  it("uses the same runtime envelope as shared stream routes", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(800);
  });
});
