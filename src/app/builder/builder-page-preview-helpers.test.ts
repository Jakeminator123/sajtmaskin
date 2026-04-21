import { describe, expect, it } from "vitest";
import { pickVersionPreviewUrl } from "./builder-page-preview-helpers";

describe("pickVersionPreviewUrl", () => {
  it("prefers live preview when available", () => {
    expect(
      pickVersionPreviewUrl({
        previewUrl: "https://preview.example/app",
        verificationState: "verifying",
      }),
    ).toBe("https://preview.example/app");
  });

  it("returns null when live preview is missing", () => {
    expect(
      pickVersionPreviewUrl({
        previewUrl: null,
        verificationState: "pending",
      }),
    ).toBeNull();
  });
});
