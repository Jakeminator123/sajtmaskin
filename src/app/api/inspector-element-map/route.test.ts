import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/inspector-element-map", () => {
  it("rejects non-http urls", async () => {
    const response = await POST(
      new Request("https://example.com/api/inspector-element-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "javascript:alert(1)" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Endast http/https stöds.",
    });
  });

  it("rejects localhost targets", async () => {
    const response = await POST(
      new Request("https://example.com/api/inspector-element-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:3000" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Otillåten host för inspect.",
    });
  });
});
