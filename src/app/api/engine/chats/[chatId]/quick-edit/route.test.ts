import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _key: string, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest: vi.fn(),
}));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion: vi.fn(),
  getPreferredVersion: vi.fn(),
}));
vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles: vi.fn(),
  parseCodeFilesFromFilesJson: vi.fn(),
}));
vi.mock("@/lib/gen/quick-edit", () => ({ runQuickEdit: vi.fn() }));

import { POST } from "./route";

describe("POST quick-edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose unexpected internal errors", async () => {
    getEngineChatByIdForRequest.mockRejectedValue(
      new Error("postgres://user:secret@private-db/internal"),
    );

    const response = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ kind: "delete_file", path: "app/page.tsx" }] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Quick edit failed" });
  });

  it.each([
    [{ kind: "replace_content", path: "../secret.ts", content: "x" }],
    [{ kind: "replace_content", path: "app/page.tsx", content: "é".repeat(1024 * 1024 + 1) }],
  ])("rejects unsafe or oversized edit operations", async (ops) => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat-1", project_id: null });

    const response = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "Invalid body" });
  });
});
