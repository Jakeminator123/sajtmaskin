import { describe, expect, it } from "vitest";
import {
  pickVersionPreviewUrl,
  shouldPreserveUserRouteNavigation,
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

describe("shouldPreserveUserRouteNavigation", () => {
  const sessionBase = "https://vm-fly-jakem.fly.dev/chat-123";

  it("preserves a user-chosen subroute within the same session + version (page-tab fix)", () => {
    // The page-tab regression: tabs rewrite the URL to `/<chatId>/<route>`,
    // the DB row still holds the session base URL, and the sync effect used
    // to snap the iframe back to "/" on its next pass.
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: sessionBase,
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(true);
  });

  it("preserves when only query params differ (refresh token / inspect)", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: sessionBase,
        currentPreviewUrl: `${sessionBase}/kontakt?t=123&inspect=1`,
      }),
    ).toBe(true);
  });

  it("preserves across trailing-slash and URL-encoded chatId variants", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: `${sessionBase}/`,
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(true);
    // Encoded vs plain chatId segment must resolve to the same session.
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: "https://vm-fly-jakem.fly.dev/chat%2D123",
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(true);
  });

  it("does NOT preserve when the version changed (fresh generation must reload)", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: true,
        nextDemoUrl: sessionBase,
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(false);
  });

  it("does NOT preserve across different sessions (other chatId)", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: "https://vm-fly-jakem.fly.dev/chat-456",
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(false);
  });

  it("does NOT preserve across different hosts", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: "https://other-vm.fly.dev/chat-123",
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(false);
  });

  it("does NOT preserve non-tier-2 URLs (shim)", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: "https://app.example/api/preview-render?id=1",
        currentPreviewUrl: "https://app.example/api/preview-render?id=1&route=/om",
      }),
    ).toBe(false);
  });

  it("does NOT preserve when either URL is missing", () => {
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: null,
        currentPreviewUrl: `${sessionBase}/om`,
      }),
    ).toBe(false);
    expect(
      shouldPreserveUserRouteNavigation({
        didChangeVersion: false,
        nextDemoUrl: sessionBase,
        currentPreviewUrl: null,
      }),
    ).toBe(false);
  });
});
