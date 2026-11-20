export type LanyardTextureCrop = {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
};

export type LanyardTextureCss = {
  width: string;
  height: string;
  left: string;
  top: string;
};

/**
 * Samma crop-fönster som 3D-framsidan. Bor här (utan Three) så
 * hero-laddningskortet inte drar in WebGL-chunken.
 */
export const LANYARD_FRONT_TEXTURE_CROP = {
  repeatX: 0.696,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0,
} as const satisfies LanyardTextureCrop;

/**
 * CSS-motsvarighet till Three-crop: samma fönster på 2D-fallback och
 * cookie-flippens baksida som på 3D-planen.
 */
export function lanyardTextureToCss(crop: LanyardTextureCrop): LanyardTextureCss {
  const widthPct = 100 / crop.repeatX;
  const heightPct = 100 / crop.repeatY;
  const startX = (1 - crop.repeatX) / 2 + crop.offsetX;
  const startY = (1 - crop.repeatY) / 2 + crop.offsetY;
  return {
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${-startX * widthPct}%`,
    top: `${-startY * heightPct}%`,
  };
}
