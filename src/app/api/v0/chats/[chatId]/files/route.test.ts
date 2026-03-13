import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const updateVersionFiles = vi.hoisted(() => vi.fn());
const assertV0Key = vi.hoisted(() => vi.fn());
const v0ChatsGetVersion = vi.hoisted(() => vi.fn());
const v0ChatsUpdateVersion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/v0", () => ({
  assertV0Key,
  v0: {
    chats: {
      getVersion: v0ChatsGetVersion,
      updateVersion: v0ChatsUpdateVersion,
      getById: vi.fn(),
    },
  },
}));

vi.mock("@/lib/tenant", () => ({
  getChatByV0ChatIdForRequest: vi.fn(),
  getEngineChatByIdForRequest: vi.fn(),
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  versions: {
    pinned: Symbol("pinned"),
    chatId: Symbol("chatId"),
    id: Symbol("id"),
    v0VersionId: Symbol("v0VersionId"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
}));

vi.mock("@/lib/gen/fallback", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
  getLatestVersionFiles: vi.fn(),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  updateVersionFiles,
}));

vi.mock("@/lib/imageAssets", () => ({
  materializeImagesInTextFiles: vi.fn(),
}));

vi.mock("@/lib/v0/resolve-version-files", () => ({
  resolveVersionFiles: vi.fn(),
}));

vi.mock("@/lib/v0/errors", () => ({
  normalizeV0Error: (err: unknown) => ({
    message: err instanceof Error ? err.message : "Unknown error",
    code: null,
    status: 500,
  }),
}));

vi.mock("@/lib/gen/repair-generated-files", () => ({
  repairGeneratedFiles: (files: unknown) => ({
    files,
    fixes: [],
  }),
}));

import { DELETE, PATCH } from "./route";

describe("own-engine file route parity", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineVersionForChatByIdForRequest.mockReset();
    getVersionFiles.mockReset();
    updateVersionFiles.mockReset();
    assertV0Key.mockReset();
    v0ChatsGetVersion.mockReset();
    v0ChatsUpdateVersion.mockReset();
  });

  it("updates a single own-engine file via PATCH without touching the v0 path", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver_1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "src/app/page.tsx", content: "old content", language: "tsx" },
    ]);
    updateVersionFiles.mockResolvedValue(true);

    const response = await PATCH(
      new Request("https://example.com/api/v0/chats/chat_1/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver_1",
          fileName: "src/app/page.tsx",
          content: "new content",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(assertV0Key).not.toHaveBeenCalled();
    expect(v0ChatsGetVersion).not.toHaveBeenCalled();
    expect(v0ChatsUpdateVersion).not.toHaveBeenCalled();
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      JSON.stringify([{ path: "src/app/page.tsx", content: "new content", language: "tsx" }]),
    );
  });

  it("deletes a single own-engine file via DELETE without touching the v0 path", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver_1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "src/app/page.tsx", content: "page", language: "tsx" },
      { path: "src/lib/util.ts", content: "util", language: "ts" },
    ]);
    updateVersionFiles.mockResolvedValue(true);

    const response = await DELETE(
      new Request(
        "https://example.com/api/v0/chats/chat_1/files?versionId=ver_1&fileName=src%2Fapp%2Fpage.tsx",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(assertV0Key).not.toHaveBeenCalled();
    expect(v0ChatsGetVersion).not.toHaveBeenCalled();
    expect(v0ChatsUpdateVersion).not.toHaveBeenCalled();
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      JSON.stringify([{ path: "src/lib/util.ts", content: "util", language: "ts" }]),
    );
  });
});
