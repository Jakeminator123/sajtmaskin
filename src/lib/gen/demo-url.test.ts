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

  it("falls back to legacy preview URL when sandbox URL is missing or expired", () => {
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_1",
      verification_state: "pending",
      sandbox_url: withSandboxUrlExpiry("https://sandbox.example/ver_1", 1, 0),
    });

    expect(result).toEqual({
      demoUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "pending-runtime",
    });
  });

  it("falls back to legacy preview for version with no sandbox URL at all", () => {
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_1",
      verification_state: "pending",
      sandbox_url: null,
    });

    expect(result).toEqual({
      demoUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "pending-runtime",
    });
  });

  it("falls back to legacy preview for version with empty sandbox URL", () => {
    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_1",
      verification_state: "passed",
      sandbox_url: "",
    });

    expect(result).toEqual({
      demoUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "pending-runtime",
    });
  });

  it("shows legacy preview for failed versions so iframe is never blank", () => {
    buildPreviewUrl.mockReturnValue("/api/preview-render?chatId=chat_1&versionId=ver_failed");

    const result = resolveEngineDemoUrlDetails("chat_1", {
      id: "ver_failed",
      verification_state: "failed",
      sandbox_url: "https://sandbox.example/ver_failed",
    });

    expect(result).toEqual({
      demoUrl: "/api/preview-render?chatId=chat_1&versionId=ver_failed",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_failed",
      mode: "verification-failed",
    });
  });
});
