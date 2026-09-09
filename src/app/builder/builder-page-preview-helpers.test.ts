import { describe, expect, it } from "vitest";
import {
  pickVersionPreviewUrl,
  previewHandoffKey,
  rememberAppliedPreviewHandoffKey,
  shouldHandoffUnchangedPreviewUrlOnVersionAdvance,
  shouldPreserveUserRouteNavigation,
  shouldRetainLastGoodPreviewOnVersionChange,
  shouldRetainLiveTier2DuringAsyncPersist,
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

describe("shouldRetainLiveTier2DuringAsyncPersist", () => {
  const liveUrl = "https://vm-fly-jakem.fly.dev/chat-123";
  const staleFallback = "https://vm-fly-jakem.fly.dev/chat-999";

  it("retains the live tier-2 preview while the row's own preview_url is still persisting via after()", () => {
    // The after() window: same version, no own URL resolved yet, so nextDemoUrl
    // is a pure fallback that differs from the live preview already on screen.
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(true);
  });

  it("does NOT retain once the active row resolved its own preview URL (persist landed)", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: true,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does NOT retain when the version changed (a real switch must re-sync)", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: true,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does NOT retain when the user explicitly selected the active version", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: true,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does NOT retain a non-tier-2 (shim/plain) current preview", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: "https://app.example/api/preview-render?id=1",
      }),
    ).toBe(false);
  });

  it("is a no-op when the fallback already equals the current preview", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: liveUrl,
        currentPreviewUrl: liveUrl,
      }),
    ).toBe(false);
  });

  it("does NOT retain when there is no current preview to keep", () => {
    expect(
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion: false,
        userSelectedActiveVersion: false,
        activeVersionHasOwnPreview: false,
        nextDemoUrl: staleFallback,
        currentPreviewUrl: null,
      }),
    ).toBe(false);
  });
});

describe("shouldHandoffUnchangedPreviewUrlOnVersionAdvance", () => {
  const liveUrl = "https://demo.fly.dev/chat-123";

  function countBumps(versionIds: string[], initiallyApplied: string[]): number {
    const applied = new Set(initiallyApplied);
    let bumps = 0;
    for (const versionId of versionIds) {
      if (
        shouldHandoffUnchangedPreviewUrlOnVersionAdvance({
          nextDemoUrl: liveUrl,
          currentPreviewUrl: liveUrl,
          versionId,
          appliedKeys: applied,
        })
      ) {
        bumps += 1;
        rememberAppliedPreviewHandoffKey(applied, previewHandoffKey(versionId, liveUrl));
      }
    }
    return bumps;
  }

  it("handoffs once when a new version was never applied (hot-patch / Fast Edit Lane, no SSE URL)", () => {
    expect(countBumps(["v3"], [previewHandoffKey("v2", liveUrl)!])).toBe(1);
  });

  it("gives 0 bumps for the follow-up-done flicker v3(SSE) → v2 → v3 on the same URL", () => {
    // SSE preview-ready already applied v3:url. v2:url was applied by that
    // version's own preview-ready. activeVersionId then flickers v3→v2→v3
    // while `/versions` catches up (selectedVersionId guard). A latest-key
    // latch would bump twice; the applied-key set must not.
    const initiallyApplied = [
      previewHandoffKey("v2", liveUrl)!,
      previewHandoffKey("v3", liveUrl)!,
    ];
    expect(countBumps(["v2", "v3"], initiallyApplied)).toBe(0);
  });

  it("noops once the versionId:url pair is already in the applied set", () => {
    expect(
      shouldHandoffUnchangedPreviewUrlOnVersionAdvance({
        nextDemoUrl: liveUrl,
        currentPreviewUrl: liveUrl,
        versionId: "v3",
        appliedKeys: new Set([previewHandoffKey("v3", liveUrl)!]),
      }),
    ).toBe(false);
  });

  it("does not invent a bump on first paint when no pair has been applied yet", () => {
    expect(
      shouldHandoffUnchangedPreviewUrlOnVersionAdvance({
        nextDemoUrl: liveUrl,
        currentPreviewUrl: liveUrl,
        versionId: "v2",
        appliedKeys: new Set(),
      }),
    ).toBe(false);
  });

  it("does not handoff when the URL actually changed (set-url path owns that)", () => {
    expect(
      shouldHandoffUnchangedPreviewUrlOnVersionAdvance({
        nextDemoUrl: "https://demo.fly.dev/chat-456",
        currentPreviewUrl: liveUrl,
        versionId: "v3",
        appliedKeys: new Set([previewHandoffKey("v2", liveUrl)!]),
      }),
    ).toBe(false);
  });

  it("does not handoff a shim or missing URL", () => {
    expect(
      shouldHandoffUnchangedPreviewUrlOnVersionAdvance({
        nextDemoUrl: "https://app.example/api/preview-render?id=1",
        currentPreviewUrl: "https://app.example/api/preview-render?id=1",
        versionId: "v3",
        appliedKeys: new Set(["v2:https://app.example/api/preview-render?id=1"]),
      }),
    ).toBe(false);
  });
});
