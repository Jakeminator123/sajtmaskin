/**
 * The region clip decides which pixels the user actually gets back, and a clip
 * that leaves the page makes Playwright throw — which reaches the user as "the
 * button does nothing". So the edges are the tests that matter here.
 */

import { describe, expect, it } from "vitest";

import { clipFromRegion, MIN_REGION_PX, parseCaptureRegion } from "./capture-region";

describe("parseCaptureRegion", () => {
  it("accepts a well-formed rectangle", () => {
    expect(
      parseCaptureRegion({ xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 40 }),
    ).toEqual({ xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 40 });
  });

  it("ignores a zero-size drag so the point path takes over", () => {
    // A click that wobbled past the drag threshold would otherwise become a
    // 24px sliver of nothing instead of a useful crop around the point.
    expect(
      parseCaptureRegion({ xPercent: 10, yPercent: 20, widthPercent: 0, heightPercent: 40 }),
    ).toBeUndefined();
  });

  it("ignores a partial or non-numeric payload", () => {
    expect(parseCaptureRegion({ xPercent: 10, yPercent: 20 })).toBeUndefined();
    expect(
      parseCaptureRegion({ xPercent: "x", yPercent: 1, widthPercent: 1, heightPercent: 1 }),
    ).toBeUndefined();
    expect(parseCaptureRegion(null)).toBeUndefined();
  });

  it("reads numeric strings, since JSON bodies are not always typed", () => {
    expect(
      parseCaptureRegion({
        xPercent: "10",
        yPercent: "20",
        widthPercent: "30",
        heightPercent: "40",
      }),
    ).toEqual({ xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 40 });
  });
});

describe("clipFromRegion", () => {
  it("pads the rectangle on every side", () => {
    const clip = clipFromRegion(
      { xPercent: 25, yPercent: 25, widthPercent: 50, heightPercent: 50 },
      1000,
      800,
    );
    expect(clip).toEqual({ x: 240, y: 190, width: 520, height: 420 });
  });

  it("keeps a rectangle at the top-left corner inside the page", () => {
    const clip = clipFromRegion(
      { xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 },
      1000,
      800,
    );
    expect(clip.x).toBe(0);
    expect(clip.y).toBe(0);
  });

  it("keeps a full-bleed rectangle inside the page", () => {
    const clip = clipFromRegion(
      { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 },
      1000,
      800,
    );
    expect(clip.x + clip.width).toBeLessThanOrEqual(1000);
    expect(clip.y + clip.height).toBeLessThanOrEqual(800);
  });

  it("keeps a rectangle dragged to the bottom-right inside the page", () => {
    const clip = clipFromRegion(
      { xPercent: 90, yPercent: 90, widthPercent: 10, heightPercent: 10 },
      1000,
      800,
    );
    expect(clip.x + clip.width).toBeLessThanOrEqual(1000);
    expect(clip.y + clip.height).toBeLessThanOrEqual(800);
  });

  it("floors a sliver to something a person can actually look at", () => {
    const clip = clipFromRegion(
      { xPercent: 50, yPercent: 50, widthPercent: 0.1, heightPercent: 0.1 },
      1000,
      800,
    );
    expect(clip.width).toBeGreaterThanOrEqual(MIN_REGION_PX);
    expect(clip.height).toBeGreaterThanOrEqual(MIN_REGION_PX);
  });

  it("clamps percentages that arrived out of range", () => {
    const clip = clipFromRegion(
      { xPercent: 150, yPercent: -20, widthPercent: 400, heightPercent: 400 },
      1000,
      800,
    );
    expect(clip.x).toBeGreaterThanOrEqual(0);
    expect(clip.y).toBeGreaterThanOrEqual(0);
    expect(clip.x + clip.width).toBeLessThanOrEqual(1000);
    expect(clip.y + clip.height).toBeLessThanOrEqual(800);
  });
});
