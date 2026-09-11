import { RGBAFormat } from "three";
import { describe, expect, it } from "vitest";
import {
  LANYARD_GRAIN_SIZE,
  createCardGrainTexture,
  fillLanyardGrainRgba,
} from "./lanyard-card-grain";

describe("lanyard card grain", () => {
  it("writes roughness into the G channel Three actually samples", () => {
    const data = fillLanyardGrainRgba(
      new Uint8Array(LANYARD_GRAIN_SIZE * LANYARD_GRAIN_SIZE * 4),
    );
    let sampled = 0;
    let greenMatchesRed = true;
    for (let i = 0; i < data.length; i += 64) {
      sampled += 1;
      if (data[i + 1] === 0 || data[i + 1] !== data[i]) {
        greenMatchesRed = false;
        break;
      }
    }

    expect(sampled).toBeGreaterThan(10);
    expect(greenMatchesRed).toBe(true);
    expect(data[1]).toBeGreaterThan(180);
  });

  it("uploads an RGBA DataTexture so G is not implicitly zero", () => {
    const texture = createCardGrainTexture();
    expect(texture.format).toBe(RGBAFormat);
    expect(texture.image.width).toBe(LANYARD_GRAIN_SIZE);
    texture.dispose();
  });
});
