import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const getScaffoldById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/engine", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getChatByV0ChatIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
  maybeAutoAcceptTimedOutRepair: vi.fn(async (version: unknown) => ({
    version,
    wasAutoAccepted: false,
  })),
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
  buildPreviewUrl,
}));

vi.mock("@/lib/api/preview-url-contract", () => ({
  previewUrlField: (url: string | null | undefined) => ({
    previewUrl: url == null || url === "" ? null : String(url),
  }),
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs: vi.fn(async () => null),
}));

vi.mock("@/lib/gen/scaffolds", () => ({
  getScaffoldById,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  versions: {
    chatId: Symbol("chatId"),
    createdAt: Symbol("createdAt"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/engine/chats/[chatId]", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getPreferredVersion.mockReset();
    getLatestVersion.mockReset();
    buildPreviewUrl.mockReset();
    getScaffoldById.mockReset();
  });

  it("does not expose a preview URL for failed own-engine versions", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      title: "Test",
      model: "gpt-5.4",
      scaffold_id: null,
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:00:00.000Z",
      messages: [],
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_failed",
      created_at: "2026-03-13T10:01:00.000Z",
      version_number: 2,
      message_id: "msg_1",
      sandbox_url: "https://sandbox.example",
      preview_url: null,
      release_state: "draft",
      verification_state: "failed",
      verification_summary: "Blocking preflight errors",
      promoted_at: null,
      repaired_files_json: null,
      repair_available_at: null,
    });

    const response = await GET(new Request("https://example.com/api/engine/chats/chat_1"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.previewUrl).toBeNull();
    expect(json.latestVersion.previewUrl).toBeNull();
    expect(json.legacyShimPreviewUrl).toBeUndefined();
    expect(json.latestVersion.legacyShimPreviewUrl).toBeUndefined();
    expect(buildPreviewUrl).not.toHaveBeenCalled();
  });

  it("returns null previewUrl for own-engine versions without preview_url", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      title: "Test",
      model: "gpt-5.4",
      scaffold_id: null,
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:00:00.000Z",
      messages: [],
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_ok",
      created_at: "2026-03-13T10:01:00.000Z",
      version_number: 2,
      message_id: "msg_1",
      sandbox_url: "https://sandbox.example",
      preview_url: null,
      release_state: "draft",
      verification_state: "passed",
      verification_summary: null,
      promoted_at: null,
      repaired_files_json: null,
      repair_available_at: null,
    });

    const response = await GET(new Request("https://example.com/api/engine/chats/chat_1"), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.previewUrl).toBeNull();
    expect(json.legacyShimPreviewUrl).toBeUndefined();
    expect(json.latestVersion.previewUrl).toBeNull();
    expect(json.latestVersion.legacyShimPreviewUrl).toBeUndefined();
    expect(json.latestVersion.canPin).toBe(false);
  });

  it("returns 404 when chat is not engine-backed and has no legacy DB mapping", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/engine/chats/chat_external"), {
      params: Promise.resolve({ chatId: "chat_external" }),
    });

    expect(response.status).toBe(404);
  });
});
