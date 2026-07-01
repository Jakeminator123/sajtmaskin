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

  it("retains an established tier-2 live preview on an automatic advance with no preview yet", () => {
    // The follow-up-completion white-flash case: version auto-advanced, no
    // previewUrl resolves yet, a live VM preview is already on screen, and the
    // user did NOT explicitly select this version.
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        userSelectedActiveVersion: false,
      }),
    ).toBe(true);
  });

  it("does NOT retain when the user explicitly selected the version (never show a different version's frame)", () => {
    // Bugbot #1: retaining here would display the previous version's site while
    // a user-selected, preview-less version is active.
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        userSelectedActiveVersion: true,
      }),
    ).toBe(false);
  });

  it("does not retain when the new version already resolved a preview URL", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: "https://vm-fly-jakem.fly.dev/chat-456",
        currentPreviewUrl: liveUrl,
        userSelectedActiveVersion: false,
      }),
    ).toBe(false);
  });

  it("does not retain when there is no current preview to keep", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: null,
        userSelectedActiveVersion: false,
      }),
    ).toBe(false);
  });

  it("does not retain when the version did not change", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: false,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        userSelectedActiveVersion: false,
      }),
    ).toBe(false);
  });

  it("does not retain a non-tier-2 (shim / plain) current preview", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: "https://app.example/api/preview-render?id=1",
        userSelectedActiveVersion: false,
      }),
    ).toBe(false);
  });
});
