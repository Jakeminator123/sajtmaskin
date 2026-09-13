import {
  DataTexture,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
} from "three";

/**
 * Three.js `roughnessMap` läser G-kanalen (ORM-konvention). En `RedFormat`-
 * textur ger G=0 → roughness blir 0 och kornet syns inte.
 */
export const LANYARD_GRAIN_SIZE = 256;

export function fillLanyardGrainRgba(
  data: Uint8Array,
  size = LANYARD_GRAIN_SIZE,
) {
  if (data.length < size * size * 4) {
    throw new Error("grain buffer too small for RGBA");
  }
  for (let i = 0; i < size * size; i += 1) {
    const x = i % size;
    const y = (i / size) | 0;
    const n = 188 + ((x * 13 + y * 37 + (x ^ y) * 5) % 55);
    const offset = i * 4;
    data[offset] = n;
    data[offset + 1] = n;
    data[offset + 2] = n;
    data[offset + 3] = 255;
  }
  return data;
}

export function createCardGrainTexture() {
  const size = LANYARD_GRAIN_SIZE;
  const data = fillLanyardGrainRgba(new Uint8Array(size * size * 4), size);
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2.4, 3.4);
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
