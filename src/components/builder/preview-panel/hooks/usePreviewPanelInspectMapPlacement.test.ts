// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import { usePreviewPanelInspectMapPlacement } from "./usePreviewPanelInspectMapPlacement";
import type { InspectEngine } from "../preview-panel-types";

/**
 * Regression test for the element-map pre-warm timer leak (CI flake in run
 * 29202297223 on #500): the `sleep()` timer inside the pre-warm effect fired
 * AFTER unmount/jsdom-teardown ("ReferenceError: window is not defined"),
 * because the effect cleanup only flipped `cancelled` without clearing the
 * pending timeout. The cleanup must leave zero pending timers behind.
 */

function harness(overrides?: { previewUrl?: string | null; inspectEngine?: InspectEngine }) {
  const iframeRef = { current: null } as RefObject<HTMLIFrameElement | null>;
  return renderHook(() =>
    usePreviewPanelInspectMapPlacement({
      inspectorEnabled: true,
      previewUrl: overrides?.previewUrl ?? "https://chat-1.fly.dev/preview",
      versionId: "ver_1",
      placementMode: false,
      iframeLoading: false,
      externalLoading: false,
      iframeRef,
      fetchFilesForRegistry: vi.fn(),
      setInspectStatus: vi.fn(),
      setLastCodeMatch: vi.fn(),
      inspectEngine: overrides?.inspectEngine ?? "map",
    }),
  );
}

describe("usePreviewPanelInspectMapPlacement — pre-warm timer cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the pending pre-warm sleep timer on unmount (no post-teardown firing)", () => {
    const rendered = harness();
    // The pre-warm effect schedules its first sleep (2000 ms) immediately.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    rendered.unmount();

    // The cleanup must clear the pending sleep — nothing may remain scheduled
    // that could fire after jsdom teardown.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules no pre-warm timer at all for the bridge engine", () => {
    const rendered = harness({ inspectEngine: "bridge" });
    expect(vi.getTimerCount()).toBe(0);
    rendered.unmount();
  });
});
