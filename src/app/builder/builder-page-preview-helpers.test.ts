import { describe, expect, it } from "vitest";
import { pickVersionPreviewUrl } from "./builder-page-preview-helpers";

describe("pickVersionPreviewUrl", () => {
  it("prefers live preview when available", () => {
    expect(
      pickVersionPreviewUrl({
        previewUrl: "https://preview.example/app",
        legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
        verificationState: "verifying",
      }),
    ).toBe("https://preview.example/app");
  });

  it("returns null when live preview is missing", () => {
    expect(
      pickVersionPreviewUrl({
        previewUrl: null,
        legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
        verificationState: "pending",
      }),
    ).toBeNull();
  });
});
