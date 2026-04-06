import { describe, expect, it } from "vitest";
import { pickVersionPreviewUrl } from "./builder-page-preview-helpers";

describe("pickVersionPreviewUrl", () => {
  it("prefers sandbox preview when available", () => {
    expect(
      pickVersionPreviewUrl({
        sandboxUrl: "https://preview.example/app",
        legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
        verificationState: "verifying",
      }),
    ).toBe("https://preview.example/app");
  });

  it("falls back to shim preview while version is verifying", () => {
    expect(
      pickVersionPreviewUrl({
        sandboxUrl: null,
        legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
        verificationState: "pending",
      }),
    ).toBe("/api/preview-render?chatId=chat_1&versionId=ver_1");
  });

  it("does not use shim fallback for non-verifying versions without sandbox", () => {
    expect(
      pickVersionPreviewUrl({
        sandboxUrl: null,
        legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
        verificationState: "passed",
      }),
    ).toBeNull();
  });
});
