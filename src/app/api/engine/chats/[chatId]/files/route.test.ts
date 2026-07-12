import { beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getLatestVersionFiles = vi.hoisted(() => vi.fn());
const updateVersionFiles = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() =>
  vi.fn((files: unknown) => ({ files, fixes: [] as unknown[] })),
);
vi.mock("@/lib/tenant", () => ({
  getChatByV0ChatIdForRequest: vi.fn(),
  getEngineChatByIdForRequest,
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

vi.mock("@/lib/gen/engine", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
  getLatestVersionFiles,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
  updateVersionFiles,
}));

vi.mock("@/lib/imageAssets", () => ({
  materializeImagesInTextFiles: vi.fn(),
}));

vi.mock("@/lib/providers/errors/normalize-provider-error", () => ({
  normalizeProviderError: (err: unknown) => ({
    message: err instanceof Error ? err.message : "Unknown error",
    code: null,
    status: 500,
  }),
}));

vi.mock("@/lib/gen/autofix/repair-generated-files", () => ({
  repairGeneratedFiles,
}));

import { DELETE, GET, PATCH, PUT } from "./route";
import { VersionLeaseHeldError } from "@/lib/db/version-lease-error";

describe("own-engine file route parity", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineVersionForChatByIdForRequest.mockReset();
    getEngineChatByIdForRequest.mockReset();
    getVersionFiles.mockReset();
    getLatestVersionFiles.mockReset();
    updateVersionFiles.mockReset();
    getPreferredVersion.mockReset();
    getLatestVersion.mockReset();
    repairGeneratedFiles.mockReset();
    repairGeneratedFiles.mockImplementation((files: unknown) => ({ files, fixes: [] }));
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
      new Request("https://example.com/api/engine/chats/chat_1/files", {
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
    // Material user edit: the write must reset any promoted/passed verdict —
    // the old verdict described the previous file contents (post-#351 P1).
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      JSON.stringify([{ path: "src/app/page.tsx", content: "new content", language: "tsx" }]),
      { invalidateVerification: true },
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
        "https://example.com/api/engine/chats/chat_1/files?versionId=ver_1&fileName=src%2Fapp%2Fpage.tsx",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      JSON.stringify([{ path: "src/lib/util.ts", content: "util", language: "ts" }]),
      { invalidateVerification: true },
    );
  });
});

describe("PUT/PATCH /files under an active version lease (P1 files_json false-green-rest)", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineVersionForChatByIdForRequest.mockReset();
    getVersionFiles.mockReset();
    updateVersionFiles.mockReset();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "ver_1" } });
    getVersionFiles.mockResolvedValue([
      { path: "src/app/page.tsx", content: "old content", language: "tsx" },
    ]);
  });

  it("PUT returns 409 version_busy (retryable) when a verify/repair job holds the lease", async () => {
    // The canonical writer throws when a foreign lease blocks the write; the
    // route must translate it to the same retryable 409 the quality-gate emits.
    updateVersionFiles.mockRejectedValue(new VersionLeaseHeldError("ver_1"));

    const response = await PUT(
      new Request("https://example.com/api/engine/chats/chat_1/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver_1",
          files: [{ name: "src/app/page.tsx", content: "new content" }],
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { code?: string; retryable?: boolean };
    expect(body.code).toBe("version_busy");
    expect(body.retryable).toBe(true);
    // The write was attempted once and blocked atomically — no retry-around.
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
  });

  it("PATCH returns 409 version_busy when a verify/repair job holds the lease", async () => {
    updateVersionFiles.mockRejectedValue(new VersionLeaseHeldError("ver_1"));

    const response = await PATCH(
      new Request("https://example.com/api/engine/chats/chat_1/files", {
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

    expect(response.status).toBe(409);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("version_busy");
  });

  it("DELETE returns 409 version_busy when a verify/repair job holds the lease", async () => {
    updateVersionFiles.mockRejectedValue(new VersionLeaseHeldError("ver_1"));

    const response = await DELETE(
      new Request(
        "https://example.com/api/engine/chats/chat_1/files?versionId=ver_1&fileName=src%2Fapp%2Fpage.tsx",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { code?: string; retryable?: boolean };
    expect(body.code).toBe("version_busy");
    expect(body.retryable).toBe(true);
  });
});

describe("GET /files heal-persist (M#files1 write-on-read)", () => {
  const originalFiles = [{ path: "src/app/page.tsx", content: "before", language: "tsx" }];
  const repairedFiles = [{ path: "src/app/page.tsx", content: "after", language: "tsx" }];

  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineVersionForChatByIdForRequest.mockReset();
    getEngineChatByIdForRequest.mockReset();
    getVersionFiles.mockReset();
    updateVersionFiles.mockReset();
    repairGeneratedFiles.mockReset();
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "ver_1" } });
    getVersionFiles.mockResolvedValue(originalFiles);
  });

  function getReq() {
    return GET(
      new Request("https://example.com/api/engine/chats/chat_1/files?versionId=ver_1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
  }

  it("does NOT persist when the repair is a no-op (avoids write-on-read storm)", async () => {
    repairGeneratedFiles.mockReturnValue({ files: originalFiles, fixes: [] });
    const res = await getReq();
    expect(res.status).toBe(200);
    expect(updateVersionFiles).not.toHaveBeenCalled();
  });

  it("persists a real heal fail-fast (bounded lockTimeoutMs) on the read path", async () => {
    repairGeneratedFiles.mockReturnValue({
      files: repairedFiles,
      fixes: [{ fixer: "x", category: "mechanical" }],
    });
    updateVersionFiles.mockResolvedValue(true);
    const res = await getReq();
    const body = (await res.json()) as { files: Array<{ content: string }> };
    expect(res.status).toBe(200);
    expect(body.files[0]?.content).toBe("after");
    // Heal-persist is fail-fast: passes a bounded lock timeout, never a raw write.
    expect(updateVersionFiles).toHaveBeenCalledWith("ver_1", JSON.stringify(repairedFiles), {
      lockTimeoutMs: expect.any(Number),
    });
  });

  it("still returns 200 with repaired files when the heal-persist throws (best-effort)", async () => {
    repairGeneratedFiles.mockReturnValue({
      files: repairedFiles,
      fixes: [{ fixer: "x", category: "mechanical" }],
    });
    updateVersionFiles.mockRejectedValue(new Error("lock timeout / statement_timeout"));
    const res = await getReq();
    const body = (await res.json()) as { files: Array<{ content: string }> };
    expect(res.status).toBe(200);
    expect(body.files[0]?.content).toBe("after");
  });
});
