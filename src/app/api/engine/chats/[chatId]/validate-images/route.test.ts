import { beforeEach, describe, expect, it, vi } from "vitest";

// Codex P2 (PR #376 round 2): a dry-run (`autoFix: false`) must not mutate
// the chat snapshot. `validateImages` still looks up replacements for
// reporting, so the route has to gate BOTH the version-file write AND the
// known-dead-map record behind `autoFix === true`.

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const recordKnownBrokenImageReplacements = vi.hoisted(() => vi.fn());
const updateVersionFiles = vi.hoisted(() => vi.fn());
const validateImages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/config", () => ({
  FEATURES: { useUnsplash: true },
  SECRETS: { unsplashAccessKey: "test-key" },
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  recordKnownBrokenImageReplacements,
  updateVersionFiles,
}));

vi.mock("@/lib/utils/image-validator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/image-validator")>(
    "@/lib/utils/image-validator",
  );
  return {
    ...actual,
    validateImages,
  };
});

import { POST } from "./route";
import { VersionLeaseHeldError } from "@/lib/db/version-lease-error";
import { MAX_SCOPED_IMAGE_URLS } from "@/lib/utils/validate-images-limit";

const DEAD_URL = "https://images.unsplash.com/photo-dead?w=800";
const LIVE_URL = "https://images.unsplash.com/photo-live?w=800";

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/engine/chats/chat_1/validate-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST validate-images — autoFix gating of the known-dead map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver_1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: `<img src="${DEAD_URL}" alt="Studio" />`, language: "tsx" },
    ]);
    recordKnownBrokenImageReplacements.mockResolvedValue(true);
    updateVersionFiles.mockResolvedValue(true);
    validateImages.mockResolvedValue({
      total: 1,
      broken: [
        {
          url: DEAD_URL,
          alt: "Studio",
          file: "app/page.tsx",
          status: 404,
          replacementUrl: LIVE_URL,
        },
      ],
      replacedCount: 1,
      files: [
        { name: "app/page.tsx", content: `<img src="${LIVE_URL}" alt="Studio" />` },
      ],
      warnings: [],
    });
  });

  it("dry-run (autoFix: false) records nothing and writes nothing", async () => {
    const res = await POST(postRequest({ versionId: "ver_1", autoFix: false }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(recordKnownBrokenImageReplacements).not.toHaveBeenCalled();
    expect(updateVersionFiles).not.toHaveBeenCalled();
  });

  it("accepts urls exactly at the shared cap and rejects one over it", async () => {
    const atCap = Array.from(
      { length: MAX_SCOPED_IMAGE_URLS },
      (_, index) => `https://images.unsplash.com/photo-at-cap-${index}?w=800`,
    );
    const ok = await POST(postRequest({ versionId: "ver_1", autoFix: true, urls: atCap }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(ok.status).toBe(200);
    expect(validateImages).toHaveBeenCalledWith(
      expect.objectContaining({ onlyUrls: atCap }),
    );

    const overCap = [...atCap, "https://images.unsplash.com/photo-over-cap?w=800"];
    const rejected = await POST(
      postRequest({ versionId: "ver_1", autoFix: true, urls: overCap }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(rejected.status).toBe(400);
    expect(validateImages).toHaveBeenCalledTimes(1);
  });

  it("forwards urls as onlyUrls so a scoped re-fix does not scan the whole site", async () => {
    const res = await POST(
      postRequest({ versionId: "ver_1", autoFix: true, urls: [DEAD_URL] }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(validateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        autoFix: true,
        onlyUrls: [DEAD_URL],
      }),
    );
  });

  it("autoFix: true records the definitively-dead mapping and persists the fixed files", async () => {
    const res = await POST(postRequest({ versionId: "ver_1", autoFix: true }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(recordKnownBrokenImageReplacements).toHaveBeenCalledTimes(1);
    expect(recordKnownBrokenImageReplacements).toHaveBeenCalledWith("chat_1", {
      [DEAD_URL]: LIVE_URL,
    });
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      expect.any(String),
      { invalidateVerification: true },
    );
  });

  it("a material replacement never persists without invalidateVerification (false-green after gate)", async () => {
    // Post-#1241 scoped fix can run AFTER quality-gate stamped
    // `passed`/`promoted` on the same row. The write must reset that
    // verdict so it cannot describe the previous `files_json` revision.
    const res = await POST(postRequest({ versionId: "ver_1", autoFix: true }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
    const [, , options] = updateVersionFiles.mock.calls[0] as [
      string,
      string,
      { invalidateVerification?: boolean } | undefined,
    ];
    expect(options).toEqual({ invalidateVerification: true });
  });

  it("does not persist or invalidate when nothing was replaced", async () => {
    validateImages.mockResolvedValue({
      total: 1,
      broken: [],
      replacedCount: 0,
      files: [
        { name: "app/page.tsx", content: `<img src="${DEAD_URL}" alt="Studio" />` },
      ],
      warnings: [],
    });

    const res = await POST(postRequest({ versionId: "ver_1", autoFix: true }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(updateVersionFiles).not.toHaveBeenCalled();
  });

  it("autoFix: true does NOT record transient failures even though they were replaced in the pass", async () => {
    validateImages.mockResolvedValue({
      total: 1,
      broken: [
        {
          url: DEAD_URL,
          alt: "Studio",
          file: "app/page.tsx",
          status: 503,
          replacementUrl: LIVE_URL,
        },
      ],
      replacedCount: 1,
      files: [
        { name: "app/page.tsx", content: `<img src="${LIVE_URL}" alt="Studio" />` },
      ],
      warnings: [],
    });

    const res = await POST(postRequest({ versionId: "ver_1", autoFix: true }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(recordKnownBrokenImageReplacements).not.toHaveBeenCalled();
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
    expect(updateVersionFiles).toHaveBeenCalledWith(
      "ver_1",
      expect.any(String),
      { invalidateVerification: true },
    );
  });

  it("surfaces a foreign version lease as 409 version_busy instead of swallowing it into a soft warning", async () => {
    // The write happens inside a try/catch that soft-warns on failure — a lease
    // block must NOT be swallowed there (that would 200 as if nothing was busy);
    // it is re-thrown and translated to the canonical retryable 409.
    updateVersionFiles.mockRejectedValue(new VersionLeaseHeldError("ver_1"));

    const res = await POST(postRequest({ versionId: "ver_1", autoFix: true }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; retryable?: boolean };
    expect(body.code).toBe("version_busy");
    expect(body.retryable).toBe(true);
  });
});
