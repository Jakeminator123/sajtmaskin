import { beforeEach, describe, expect, it, vi } from "vitest";

const getChat = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getLatestVersionFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository-pg", () => ({ getChat, getVersionById }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles, getLatestVersionFiles }));
vi.mock("@/lib/gen/preview/legacy/compatibility-shim", () => ({
  isShimPreviewDisabled: () => false,
}));

import { GET } from "./route";

describe("GET /api/preview-render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["chatId", `chatId=${"x".repeat(201)}`],
    ["versionId", `chatId=chat_1&versionId=${"x".repeat(201)}`],
    ["route", `chatId=chat_1&route=${"x".repeat(2_049)}`],
  ])("rejects an oversized %s before repository lookup", async (_field, query) => {
    const response = await GET(new Request(`http://localhost/api/preview-render?${query}`));

    expect(response.status).toBe(400);
    expect(getChat).not.toHaveBeenCalled();
    expect(getVersionById).not.toHaveBeenCalled();
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(getLatestVersionFiles).not.toHaveBeenCalled();
  });
});
