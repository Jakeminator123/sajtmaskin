import { describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest }));
vi.mock("@/lib/utils/css-validator", () => ({
  validateFiles: vi.fn(),
  formatIssuesForDisplay: vi.fn(),
  fixCssIssues: vi.fn(),
}));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({ updateVersionFiles: vi.fn() }));
vi.mock("@/lib/api/version-busy-response", () => ({
  versionBusyResponseIfLeaseHeld: () => null,
}));

import { POST } from "./route";

describe("POST validate-css", () => {
  it("does not expose unexpected internal errors", async () => {
    getEngineVersionForChatByIdForRequest.mockRejectedValue(
      new Error("postgres://user:secret@private-db/internal"),
    );

    const response = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/validate-css", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1" }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Validation failed" });
  });
});
