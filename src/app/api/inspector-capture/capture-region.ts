/**
 * Geometry for "screenshot the area I dragged".
 *
 * Lives beside the route rather than inside it because a route file may only
 * export handlers — and because this is the part that decides which pixels the
 * user gets. It deserves tests that do not need a browser.
 */

/**
 * A rectangle the user dragged in the preview, in percent of the preview
 * surface.
 *
 * Percent rather than pixels for the same reason the point is: the browser
 * viewport we render the capture in is ours to choose and never matches the
 * iframe the user dragged over. Sending pixels would silently crop the wrong
 * area on any panel width but the one that happened to be open.
 */
export type CaptureRegion = {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type CaptureClip = { x: number; y: number; width: number; height: number };

/** Breathing room around a dragged rectangle so the edges are not flush cut. */
export const REGION_PADDING_PX = 10;
/** Below this a "region" is a slip of the hand, not a selection. */
export const MIN_REGION_PX = 24;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseCaptureRegion(value: unknown): CaptureRegion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const xPercent = toNumber(obj.xPercent);
  const yPercent = toNumber(obj.yPercent);
  const widthPercent = toNumber(obj.widthPercent);
  const heightPercent = toNumber(obj.heightPercent);
  if (![xPercent, yPercent, widthPercent, heightPercent].every(Number.isFinite)) return undefined;
  // A zero-size drag is a click that wobbled. Falling back to the point path
  // gives the user a usable image instead of a 24px sliver of nothing.
  if (widthPercent <= 0 || heightPercent <= 0) return undefined;
  return { xPercent, yPercent, widthPercent, heightPercent };
}

/**
 * Turn a dragged rectangle into a screenshot clip inside the viewport.
 *
 * Padded, floored to a usable size, and clamped so the clip never leaves the
 * page — Playwright throws on a clip that does, and a thrown capture reads to
 * the user as "the button is broken".
 */
export function clipFromRegion(
  region: CaptureRegion,
  viewportWidth: number,
  viewportHeight: number,
): CaptureClip {
  const rawX = (clamp(region.xPercent, 0, 100) / 100) * viewportWidth;
  const rawY = (clamp(region.yPercent, 0, 100) / 100) * viewportHeight;
  const rawWidth = (clamp(region.widthPercent, 0, 100) / 100) * viewportWidth;
  const rawHeight = (clamp(region.heightPercent, 0, 100) / 100) * viewportHeight;

  const width = clamp(Math.round(rawWidth) + REGION_PADDING_PX * 2, MIN_REGION_PX, viewportWidth);
  const height = clamp(
    Math.round(rawHeight) + REGION_PADDING_PX * 2,
    MIN_REGION_PX,
    viewportHeight,
  );
  const x = clamp(Math.round(rawX) - REGION_PADDING_PX, 0, Math.max(0, viewportWidth - width));
  const y = clamp(Math.round(rawY) - REGION_PADDING_PX, 0, Math.max(0, viewportHeight - height));
  return { x, y, width, height };
}
