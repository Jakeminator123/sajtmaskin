import { beforeEach, describe, expect, it, vi } from "vitest";

const buildPreviewUrl = vi.hoisted(() => vi.fn());
const isLegacyPreviewShimsEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview", () => ({
  buildPreviewUrl,
}));

vi.mock("@/lib/env", () => ({
  isLegacyPreviewShimsEnabled,
}));

import { resolveEngineDemoUrl, resolveEngineDemoUrlDetails, withSandboxUrlExpiry } from "./demo-url";

describe("resolveEngineDemoUrl", () => {
  beforeEach(() => {
    buildPreviewUrl.mockReset();
    isLegacyPreviewShimsEnabled.mockReset();
    buildPreviewUrl.mockReturnValue("/api/preview-render?chatId=chat_1&versionId=ver_1");
    isLegacyPreviewShimsEnabled.mockReturnValue(false);
  });

  it("returns the legacy preview URL when PREVIEW mode is enabled", () => {
    isLegacyPreviewShimsEnabled.mockReturnValue(true);

    const result = resolveEngineDemoUrl("chat_1", {
      id: "ver_1",
      verification_state: "pending",
      sandbox_url: "https://sandbox.example/ver_1",
    });

    expect(result).toBe("/api/preview-render?chatId=chat_1&versionId=ver_1");
    expect(buildPreviewUrl).toHaveBeenCalledWith("chat_1", "ver_1", undefined);
  });

  it("uses a fresh sandbox URL in runtime-first mode", () => {
    const now = Date.now();
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_1",
      verification_state: "passed",
      sandbox_url: withSandboxUrlExpiry("https://sandbox.example/ver_1", 60_000, now),
    });

    expect(result).toEqual({
      demoUrl: "https://sandbox.example/ver_1",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "runtime",
    });
  });

  it("keeps demoUrl empty while runtime is still pending or expired", () => {
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_1",
      verification_state: "pending",
      sandbox_url: withSandboxUrlExpiry("https://sandbox.example/ver_1", 1, 0),
    });

    expect(result).toEqual({
      demoUrl: null,
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "pending-runtime",
    });
  });

  it("hides demoUrl entirely for failed versions", () => {
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_failed",
      verification_state: "failed",
      sandbox_url: "https://sandbox.example/ver_failed",
    });

    expect(result).toEqual({
      demoUrl: null,
      legacyPreviewUrl: null,
      mode: "none",
    });
  });
});
