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

  it("retains when the fresh/latest version has no preview yet (follow-up flash fix)", () => {
    // The follow-up-completion case: the just-generated version is active
    // (fresh/not-yet-in-list or latest), no previewUrl resolves yet, a live VM
    // preview is on screen.
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        activeVersionIsFreshOrLatest: true,
      }),
    ).toBe(true);
  });

  it("does NOT retain when an OLDER (non-latest, in-list) version is active", () => {
    // Bugbot #1: retaining here would display the previous version's site while
    // a user-selected, preview-less OLDER version is active.
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        activeVersionIsFreshOrLatest: false,
      }),
    ).toBe(false);
  });

  it("does not retain when the new version already resolved a preview URL", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: "https://vm-fly-jakem.fly.dev/chat-456",
        currentPreviewUrl: liveUrl,
        activeVersionIsFreshOrLatest: true,
      }),
    ).toBe(false);
  });

  it("does not retain when there is no current preview to keep", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: null,
        activeVersionIsFreshOrLatest: true,
      }),
    ).toBe(false);
  });

  it("does not retain when the version did not change", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: false,
        nextDemoUrl: null,
        currentPreviewUrl: liveUrl,
        activeVersionIsFreshOrLatest: true,
      }),
    ).toBe(false);
  });

  it("does not retain a non-tier-2 (shim / plain) current preview", () => {
    expect(
      shouldRetainLastGoodPreviewOnVersionChange({
        didChangeVersion: true,
        nextDemoUrl: null,
        currentPreviewUrl: "https://app.example/api/preview-render?id=1",
        activeVersionIsFreshOrLatest: true,
      }),
    ).toBe(false);
  });
});
