import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tenant", () => ({ getEngineChatByIdForRequest }));

const { GET } = await import("./route");
const context = { params: Promise.resolve({ chatId: "chat_1", messageId: "message_1" }) };

describe("GET engine chat message", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["chatId", { chatId: "x".repeat(201), messageId: "message_1" }],
    ["messageId", { chatId: "chat_1", messageId: "x".repeat(201) }],
  ])("rejects an oversized %s before tenant lookup", async (_field, params) => {
    const response = await GET(new Request("http://localhost/message"), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(400);
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
  });

  it("returns only a message from the owned chat", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      messages: [
        {
          id: "message_1",
          role: "assistant",
          content: "Hej",
          ui_parts: null,
          token_count: 2,
          created_at: "2026-10-25T00:00:00.000Z",
        },
      ],
    });

    const response = await GET(new Request("http://localhost/message"), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "message_1", content: "Hej" });
  });

  it("does not expose chat repository failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getEngineChatByIdForRequest.mockRejectedValue(new Error("database host secret"));

    const response = await GET(new Request("http://localhost/message"), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load message" });
    error.mockRestore();
  });
});
