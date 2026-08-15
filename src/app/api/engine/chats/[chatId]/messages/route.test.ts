import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/engine/chats/[chatId]/messages (not a codegen path)", () => {
  it("returns 405 use_streaming_send without running codegen", async () => {
    const res = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/messages", {
        method: "POST",
        body: JSON.stringify({ message: "Uppdatera hero copy" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.code).toBe("use_streaming_send");
    expect(String(json.error)).toMatch(/\/stream/);
  });
});
