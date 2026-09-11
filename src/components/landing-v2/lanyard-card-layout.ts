import { SRGBColorSpace, type Euler, type Quaternion, type Texture, type Vector3 } from "three";

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
 * Delat layoutkontrakt för 3D-kortet. Ett fullt utsträckt lodrätt rep är
 * kortets lägsta möjliga viloläge, så den beräkningen är den konservativa
 * gränsen för om hela visitkortet ryms i kameran. Kameran tittar högt
 * nog för att ankaret (snöret upp mot headern) ska ligga i frustumen.
 *
 * Texturerna i `public/branding/lanyard-card*.png` är kvadratiska 1024² med
 * det stående motivet i mitten. Crop-fönstret matchar kortets sidoförhållande
 * så framsida och baksida sitter flush — inte som en dekal med mörk ram.
 */
export const LANYARD_CARD_LAYOUT = {
  ropeSegmentLength: 0.7,
  ropeSegmentCount: 3,
  cardJointY: 1.45,
  fixedAnchorY: 2.8,
  cardWidth: 1.6,
  cardHeight: 2.3,
  cardDepth: 0.055,
  cardRadius: 0.1,
  cardVisualOffsetY: -0.05,
  faceInset: 0.035,
  colliderHalfExtents: [0.85, 1.2, 0.028] as const,
  cardLinearDamping: 2.5,
  cardAngularDamping: 2.5,
  ropeLinearDamping: 2,
  ropeAngularDamping: 2,
  gravity: [0, -46, 0] as const,
  initialImpulse: { x: -0.85, y: 0, z: 0.2 },
  cameraDistance: 11,
  cameraFovDegrees: 28,
  cameraY: 0,
  cameraLookAtY: 0.16,
  frontTexture: {
    repeatX: 0.696,
    repeatY: 1,
    offsetX: 0,
    offsetY: 0,
  } satisfies LanyardTextureCrop,
  backTexture: {
    repeatX: 0.62,
    repeatY: 0.89,
    offsetX: 0,
    offsetY: 0.012,
  } satisfies LanyardTextureCrop,
} as const;

type Vector3Value = Readonly<{ x: number; y: number; z: number }>;
type QuaternionValue = Vector3Value & Readonly<{ w: number }>;

export function getLanyardCardFaceSize() {
  const { cardWidth, cardHeight, cardDepth, faceInset } = LANYARD_CARD_LAYOUT;
  return {
    width: cardWidth - faceInset * 2,
    height: cardHeight - faceInset * 2,
    z: cardDepth / 2 + 0.0015,
  };
}

export function applyLanyardTextureCrop(
  texture: Texture,
  crop: LanyardTextureCrop,
  anisotropy = 1,
) {
  texture.colorSpace = SRGBColorSpace;
  texture.center.set(0.5, 0.5);
  texture.repeat.set(crop.repeatX, crop.repeatY);
  texture.offset.set(crop.offsetX, crop.offsetY);
  texture.anisotropy = Math.max(1, anisotropy);
  texture.needsUpdate = true;
  return texture;
}

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

/**
 * Delad rotationsreglering för live-loopen och Rapier-regressionstestet.
 * Scratch-objekten skickas in så produktionsloopen inte allokerar per frame.
 */
export function stabilizeLanyardAngularVelocity(
  angularVelocity: Vector3Value,
  rotation: QuaternionValue,
  scratchEuler: Euler,
  scratchQuaternion: Quaternion,
  target: Vector3,
) {
  scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  scratchEuler.setFromQuaternion(scratchQuaternion);
  return target.set(
    angularVelocity.x - scratchEuler.x * 0.3,
    angularVelocity.y - scratchEuler.y * 0.6,
    angularVelocity.z - scratchEuler.z * 0.2,
  );
}

export function calculateSettledCardFrame() {
  const {
    ropeSegmentLength,
    ropeSegmentCount,
    cardJointY,
    fixedAnchorY,
    cardHeight,
    cardVisualOffsetY,
    cameraDistance,
    cameraFovDegrees,
    cameraLookAtY,
  } = LANYARD_CARD_LAYOUT;
  const cardBodyY =
    fixedAnchorY - ropeSegmentLength * ropeSegmentCount - cardJointY;
  const cardCenterY = cardBodyY + cardVisualOffsetY;
  const cardHalfHeight = cardHeight / 2;
  const cameraHalfHeight =
    Math.tan((cameraFovDegrees * Math.PI) / 360) * cameraDistance;
  const cameraBottom = cameraLookAtY - cameraHalfHeight;
  const cameraTop = cameraLookAtY + cameraHalfHeight;
  const cardBottom = cardCenterY - cardHalfHeight;
  const cardTop = cardCenterY + cardHalfHeight;
  const ropeAnchorY = fixedAnchorY;

  return {
    cardBottom,
    cardCenterY,
    cardTop,
    cameraBottom,
    cameraTop,
    ropeAnchorY,
    bottomMargin: cardBottom - cameraBottom,
    topMargin: cameraTop - cardTop,
    ropeTopMargin: cameraTop - ropeAnchorY,
  };
}
