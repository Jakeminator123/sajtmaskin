import { Texture } from "three";
import { describe, expect, it } from "vitest";
import {
  LANYARD_CARD_LAYOUT,
  applyLanyardTextureCrop,
  calculateSettledCardFrame,
  getLanyardCardFaceSize,
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
});
