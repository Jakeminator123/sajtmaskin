import { Texture } from "three";
import { describe, expect, it } from "vitest";
import {
  LANYARD_CARD_LAYOUT,
  applyLanyardTextureCrop,
  calculateSettledCardFrame,
  getLanyardCardFaceSize,
  lanyardIdleGust,
  lanyardIdleVisualSway,
  lanyardPointerProximity,
  lanyardPointerTiltTarget,
  lanyardTextureToCss,
} from "./lanyard-card-layout";

describe("lanyard card layout", () => {
  it("crops square branding art to the standing card aspect", () => {
    const cardAspect = LANYARD_CARD_LAYOUT.cardWidth / LANYARD_CARD_LAYOUT.cardHeight;
    const frontAspect =
      LANYARD_CARD_LAYOUT.frontTexture.repeatX / LANYARD_CARD_LAYOUT.frontTexture.repeatY;
    const backAspect =
      LANYARD_CARD_LAYOUT.backTexture.repeatX / LANYARD_CARD_LAYOUT.backTexture.repeatY;

    expect(frontAspect).toBeCloseTo(cardAspect, 2);
    expect(backAspect).toBeCloseTo(cardAspect, 2);
    expect(LANYARD_CARD_LAYOUT.frontTexture.repeatX).toBeLessThan(1);
    expect(LANYARD_CARD_LAYOUT.backTexture.repeatY).toBeLessThan(1);
  });

  it("keeps the settled card inside the camera with breathing room", () => {
    const frame = calculateSettledCardFrame();

    expect(frame.bottomMargin).toBeGreaterThan(0.2);
    expect(frame.topMargin).toBeGreaterThan(0.2);
    expect(frame.cardCenterY).toBeLessThan(0);
    expect(frame.cardCenterY).toBeGreaterThan(frame.cameraBottom);
    expect(frame.ropeTopMargin).toBeGreaterThan(-0.05);
    expect(frame.cameraTop).toBeGreaterThan(LANYARD_CARD_LAYOUT.fixedAnchorY - 0.08);
  });

  it("mirrors Three crop windows into CSS for the 2D fallback", () => {
    const css = lanyardTextureToCss(LANYARD_CARD_LAYOUT.frontTexture);
    const width = Number.parseFloat(css.width);
    const left = Number.parseFloat(css.left);

    expect(width).toBeCloseTo(100 / LANYARD_CARD_LAYOUT.frontTexture.repeatX, 5);
    expect(left).toBeLessThan(0);
    expect(css.height).toBe("100%");
  });

  it("applies crop, color space and anisotropy in place", () => {
    const texture = new Texture();
    applyLanyardTextureCrop(texture, LANYARD_CARD_LAYOUT.frontTexture, 8);

    expect(texture.repeat.x).toBe(LANYARD_CARD_LAYOUT.frontTexture.repeatX);
    expect(texture.repeat.y).toBe(LANYARD_CARD_LAYOUT.frontTexture.repeatY);
    expect(texture.offset.x).toBe(LANYARD_CARD_LAYOUT.frontTexture.offsetX);
    expect(texture.anisotropy).toBe(8);
    expect(texture.version).toBeGreaterThan(0);
  });

  it("insets the printed faces so rounded corners do not clip the art", () => {
    const face = getLanyardCardFaceSize();
    expect(face.width).toBeLessThan(LANYARD_CARD_LAYOUT.cardWidth);
    expect(face.height).toBeLessThan(LANYARD_CARD_LAYOUT.cardHeight);
    expect(face.z).toBeGreaterThan(LANYARD_CARD_LAYOUT.cardDepth / 2);
  });

  it("keeps a visible idle yaw so the front face is not locked at 0", () => {
    const a = lanyardIdleVisualSway(0.8);
    const b = lanyardIdleVisualSway(2.4);
    expect(Math.abs(a.yaw)).toBeGreaterThan(0.02);
    expect(a.yaw).not.toBeCloseTo(b.yaw, 3);
    expect(Math.abs(a.yaw)).toBeLessThan(0.25);
    expect(Math.abs(a.pitch)).toBeLessThan(0.08);
  });

  it("follows the pointer more on hover than when the cursor is far away", () => {
    const hover = lanyardPointerTiltTarget({
      pointerX: 0.8,
      pointerY: -0.4,
      dragged: false,
      proximity: 1,
    });
    const far = lanyardPointerTiltTarget({
      pointerX: 0.8,
      pointerY: -0.4,
      dragged: false,
      proximity: 0,
    });
    const drag = lanyardPointerTiltTarget({
      pointerX: 0.8,
      pointerY: -0.4,
      dragged: true,
      proximity: 1,
    });

    expect(hover.y).toBeGreaterThan(0.1);
    expect(far.y).toBe(0);
    expect(Math.abs(drag.y)).toBeGreaterThan(Math.abs(hover.y));
    expect(lanyardPointerProximity(0, 0, true, false)).toBe(1);
    expect(lanyardPointerProximity(0.9, 0.9, false, false)).toBe(0);
    expect(lanyardPointerProximity(0, 0, false, true)).toBeGreaterThan(0.7);
  });

  it("gusts reverse so idle physics keeps dangling instead of parking", () => {
    const right = lanyardIdleGust(Math.PI / 3.4);
    const left = lanyardIdleGust((3 * Math.PI) / 3.4);
    expect(right.impulse.x).toBeGreaterThan(0);
    expect(left.impulse.x).toBeLessThan(0);
    expect(Math.abs(left.impulse.x)).toBeLessThan(0.4);
  });
});
