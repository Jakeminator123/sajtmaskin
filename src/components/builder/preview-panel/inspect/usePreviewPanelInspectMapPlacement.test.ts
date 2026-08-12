// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type MouseEvent, type RefObject } from "react";
import { usePreviewPanelInspectMapPlacement } from "./usePreviewPanelInspectMapPlacement";
import type { InspectEngine } from "../preview-panel-types";
import type { ElementMapItem } from "@/lib/builder/types";

/**
 * Hook-level regressions for the placement/element-map hook. Both behaviours
 * below are invisible to unit tests of the helpers they use, so they are
 * asserted against the hook's own exposed state.
 */

function harness(overrides?: {
  previewUrl?: string | null;
  inspectEngine?: InspectEngine;
  placementMode?: boolean;
  composerMode?: boolean;
  homePageCode?: string | null;
  onRender?: () => void;
}) {
  const iframeRef = { current: null } as RefObject<HTMLIFrameElement | null>;
  return renderHook(() => {
    overrides?.onRender?.();
    // `inspectMode` ägs numera av builderskalet; hooken tar emot det som prop.
    const [inspectMode, setInspectMode] = useState(false);
    return usePreviewPanelInspectMapPlacement({
      inspectorEnabled: true,
      previewUrl: overrides?.previewUrl ?? "https://chat-1.fly.dev/preview",
      versionId: "ver_1",
      placementMode: overrides?.placementMode ?? false,
      composerMode: overrides?.composerMode ?? false,
      inspectMode,
      setInspectMode,
      iframeLoading: false,
      externalLoading: false,
      iframeRef,
      fetchFilesForRegistry: vi.fn(),
      setInspectStatus: vi.fn(),
      setLastCodeMatch: vi.fn(),
      inspectEngine: overrides?.inspectEngine ?? "map",
      homePageCode: overrides?.homePageCode ?? null,
    });
  });
}

/**
 * Regression test for the element-map pre-warm timer leak (CI flake in run
 * 29202297223 on #500): the `sleep()` timer inside the pre-warm effect fired
 * AFTER unmount/jsdom-teardown ("ReferenceError: window is not defined"),
 * because the effect cleanup only flipped `cancelled` without clearing the
 * pending timeout. The cleanup must leave zero pending timers behind.
 */
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

/**
 * Regression test for the placement dedupe bailout (Codex P1 on merged #604).
 * `nearestInsertionPoint` allocates a fresh object per call, so storing it
 * unconditionally (`setHoveredPlacement(insertion)`) re-renders PreviewPanel on
 * every pointer event — and since #602 wired `dragover` to this same handler,
 * that means every event of an entire drag. #604 only tested
 * `isSameInsertionPoint` in isolation, which leaves the bailout itself free to
 * be reverted with all tests still green. These assertions read the hook's
 * exposed state instead, so the behaviour is what is locked.
 */
describe("usePreviewPanelInspectMapPlacement — placement dedupe", () => {
  const VIEWPORT_HEIGHT = 600;

  function element(overrides: Partial<ElementMapItem> & { vpPercent: ElementMapItem["vpPercent"] }) {
    return {
      tag: "section",
      id: null,
      className: null,
      text: null,
      selector: "section",
      rect: { x: 0, y: 0, width: 1280, height: 800 },
      ...overrides,
    } satisfies ElementMapItem;
  }

  // Two well-separated zones => insertion lines at 0 / 40 / 90 / 100 percent.
  const ELEMENTS: ElementMapItem[] = [
    element({ className: "hero", selector: "section.hero", vpPercent: { x: 0, y: 0, w: 100, h: 40 } }),
    element({ tag: "footer", selector: "footer", vpPercent: { x: 0, y: 60, w: 100, h: 30 } }),
  ];

  /** A mousemove/dragover-shaped event at `clientY` inside a 1280x600 overlay. */
  function moveTo(clientY: number) {
    return {
      clientX: 100,
      clientY,
      currentTarget: {
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 1280, height: VIEWPORT_HEIGHT }),
      },
    } as unknown as MouseEvent<HTMLDivElement>;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function placementHarness() {
    let renders = 0;
    const rendered = harness({
      placementMode: true,
      // Bridge-engine: zoner kommer via applyBridgeSectionCandidates (inte Playwright).
      inspectEngine: "bridge",
      onRender: () => {
        renders += 1;
      },
    });
    act(() => {
      rendered.result.current.applyBridgeSectionCandidates(
        ELEMENTS.map((el) => ({
          tag: el.tag,
          id: el.id,
          className: el.className,
          text: el.text,
          selector: el.selector,
          vpPercent: el.vpPercent,
          rect: el.rect,
        })),
      );
    });
    await waitFor(() => expect(rendered.result.current.sectionZones.length).toBe(2));
    return { rendered, renderCount: () => renders };
  }

  it("keeps the same hoveredPlacement reference while the pointer resolves to the same line", async () => {
    const { rendered, renderCount } = await placementHarness();

    // 240px of 600 = 40% => the "after-hero" line.
    act(() => rendered.result.current.handlePlacementMouseMove(moveTo(240)));
    const first = rendered.result.current.hoveredPlacement;
    expect(first?.placement).toBe("after-hero");

    const rendersAfterFirst = renderCount();

    // A whole drag's worth of events that all resolve to the same line.
    for (const y of [241, 245, 250, 255, 260]) {
      act(() => rendered.result.current.handlePlacementMouseMove(moveTo(y)));
      expect(rendered.result.current.hoveredPlacement).toBe(first);
    }

    // React may render once more before bailing out on an identical value, but
    // it must not render per event the way the pre-bailout code did.
    expect(renderCount() - rendersAfterFirst).toBeLessThanOrEqual(1);

    rendered.unmount();
  });

  it("still updates when the pointer crosses to a different insertion line", async () => {
    const { rendered } = await placementHarness();

    act(() => rendered.result.current.handlePlacementMouseMove(moveTo(240)));
    const atHero = rendered.result.current.hoveredPlacement;
    expect(atHero?.placement).toBe("after-hero");

    // 540px of 600 = 90% => the "after-footer" line.
    act(() => rendered.result.current.handlePlacementMouseMove(moveTo(540)));
    const atFooter = rendered.result.current.hoveredPlacement;
    expect(atFooter?.placement).toBe("after-footer");
    expect(atFooter).not.toBe(atHero);

    rendered.unmount();
  });

  it("falls back to code-derived section zones when bridge map is empty", () => {
    const rendered = harness({
      composerMode: true,
      inspectEngine: "bridge",
      homePageCode: `
export default function Page() {
  return (
    <main>
      <section className="hero-banner">Welcome</section>
      <section className="pricing-table">Plans</section>
    </main>
  );
}
`,
    });
    expect(rendered.result.current.sectionZones.length).toBeGreaterThanOrEqual(2);
    expect(rendered.result.current.sectionZones.some((z) => z.type === "hero")).toBe(true);
    rendered.unmount();
  });
});
