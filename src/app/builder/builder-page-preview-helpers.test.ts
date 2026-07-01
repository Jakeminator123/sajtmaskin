import { describe, expect, it } from "vitest";
import {
  pickVersionPreviewUrl,
  shouldRetainLastGoodPreviewOnVersionChange,
} from "./builder-page-preview-helpers";

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

describe("shouldRetainLastGoodPreviewOnVersionChange", () => {
  const liveUrl = "https://vm-fly-jakem.fly.dev/chat-123";

  it("retains an established tier-2 live preview when switching to a version without a preview yet", () => {
    // The follow-up-completion white-flash case: version changed, new version
    // has no previewUrl yet, but a live VM preview is already on screen.
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(true);
  });

  it("does not retain when the new version already resolved a preview URL", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: "https://vm-fly-jakem.fly.dev/chat-456",
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does not retain when there is no current preview to keep", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: null,
      }),
    ).toBe(false);
  });

  it("does not retain when the version did not change", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: false,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does not retain a non-tier-2 (shim / plain) current preview", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: "https://app.example/api/preview-render?id=1",
      }),
    ).toBe(false);
  });
});
