import type { Euler, Quaternion, Vector3 } from "three";

/**
 * Delat layoutkontrakt för 3D-kortet. Ett fullt utsträckt lodrätt rep är
 * kortets lägsta möjliga viloläge, så den beräkningen är den konservativa
 * gränsen för om hela visitkortet ryms i kameran.
 */
export const LANYARD_CARD_LAYOUT = {
  ropeSegmentLength: 0.7,
  ropeSegmentCount: 3,
  cardJointY: 1.45,
  fixedAnchorY: 2.8,
  cardWidth: 1.6,
  cardHeight: 2.3,
  cardDepth: 0.04,
  cardVisualOffsetY: -0.05,
  initialImpulse: { x: -0.8, y: 0, z: 0.2 },
  cameraDistance: 11,
  cameraFovDegrees: 25,
} as const;

type Vector3Value = Readonly<{ x: number; y: number; z: number }>;
type QuaternionValue = Vector3Value & Readonly<{ w: number }>;

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
  } = LANYARD_CARD_LAYOUT;
  const cardBodyY =
    fixedAnchorY - ropeSegmentLength * ropeSegmentCount - cardJointY;
  const cardCenterY = cardBodyY + cardVisualOffsetY;
  const cardHalfHeight = cardHeight / 2;
  const cameraHalfHeight =
    Math.tan((cameraFovDegrees * Math.PI) / 360) * cameraDistance;
  const cameraBottom = -cameraHalfHeight;
  const cameraTop = cameraHalfHeight;
  const cardBottom = cardCenterY - cardHalfHeight;
  const cardTop = cardCenterY + cardHalfHeight;

  return {
    cardBottom,
    cardCenterY,
    cardTop,
    cameraBottom,
    cameraTop,
    bottomMargin: cardBottom - cameraBottom,
    topMargin: cameraTop - cardTop,
  };
}
