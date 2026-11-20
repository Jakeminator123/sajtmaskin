/**
 * Kubens 3D-geometri som rena strängar. Komponenten skriver dem direkt på
 * DOM-noderna i en rAF-loop; i vila har ingen nod någon transform alls, så den
 * aktiva sidan är vanlig platt DOM (skarp text, IME, markering, fokusringar).
 *
 * Två varianter jämförs:
 *
 * - `virtual` (B): bara utgående och inkommande sida finns i 3D under ett
 *   90°-steg. Varje sida bär sin egen `perspective()` och delar origo (båda
 *   ligger på samma rektangel), så projektionen blir gemensam utan
 *   `preserve-3d`. Två synliga sidor av en konvex låda överlappar aldrig, så
 *   ingen djupsortering behövs. Inga plattningsfällor kan uppstå.
 * - `box` (A): en riktig låda. Sidlagret blir `preserve-3d` och roterar; fyra
 *   ringsidor placeras runt det med djupet satt per axel. Kräver att varken
 *   lagret eller scenen bär overflow/opacity/filter under vridningen.
 *
 * Djupet D = W vid vridning runt Y och D = H runt X, så varje sida visas i
 * full W x H när den står framåt trots att panelen är hög.
 */

import { neighborOrientation, type CubeDirection, type CubeFaceId, type CubeTurnStep } from "./cube-model";

export type CubeGeometry = "virtual" | "box";

export function turnDepth(step: Pick<CubeTurnStep, "axis">, width: number, height: number): number {
  return step.axis === "y" ? width : height;
}

/** Perspektivet skalar med panelen så att vridningen ser likadan ut i alla storlekar. */
export function turnPerspective(width: number, height: number): number {
  return Math.round(Math.max(width, height) * 2.6);
}

/** Mjuk in/ut. Monoton och exakt 0/1 i ändarna. */
export function easeTurn(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function rotate(axis: "x" | "y", deg: number): string {
  // Avrunda så att 0/90 blir exakta och strängarna stabila i tester.
  const d = Math.round(deg * 1000) / 1000;
  return axis === "y" ? `rotateY(${d}deg)` : `rotateX(${d}deg)`;
}

/**
 * Hur långt lådan ska skjutas bakåt så att närmaste kant aldrig kommer
 * närmare betraktaren än vilande sidan. Utan detta sväller lådan upp till
 * ~20 % mitt i en vridning och täcker huvud och docka.
 */
export function turnRecess(depth: number, deg: number): number {
  const r = (deg * Math.PI) / 180;
  return Math.round((depth / 2) * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)) - 1) * 100) / 100;
}

/** Hur mycket en sida skuggas vid en given vinkel (0 = rakt fram). */
export function shadeFor(deg: number): number {
  return Math.round(Math.abs(Math.sin((deg * Math.PI) / 180)) * 0.55 * 1000) / 1000;
}

export interface FacePose {
  face: CubeFaceId;
  transform: string;
  shade: number;
}

/** B: två sidor, egen perspective() per sida. `t` är redan easad. */
export function virtualTurnPoses(step: CubeTurnStep, t: number, width: number, height: number): FacePose[] {
  const depth = turnDepth(step, width, height);
  const p = turnPerspective(width, height);
  const theta = step.sign * 90 * t;
  const thetaIn = theta - step.sign * 90;
  const half = Math.round((depth / 2) * 100) / 100;
  const back = Math.round((half + turnRecess(depth, theta)) * 100) / 100;
  const pose = (face: CubeFaceId, deg: number): FacePose => ({
    face,
    transform: `perspective(${p}px) translateZ(${-back}px) ${rotate(step.axis, deg)} translateZ(${half}px)`,
    shade: shadeFor(deg),
  });
  return [pose(step.from, theta), pose(step.to, thetaIn)];
}

const OPPOSITE: Record<CubeDirection, CubeDirection> = { right: "left", left: "right", up: "down", down: "up" };

/**
 * A: hela ringen runt stegets axel. Lagret roterar (`layerTransform`),
 * sidorna har fasta placeringar på lådan. Scenen bär perspektivet.
 */
export function boxTurnPoses(
  step: CubeTurnStep,
  t: number,
  width: number,
  height: number,
): { layerTransform: string; perspective: number; faces: FacePose[] } {
  const depth = turnDepth(step, width, height);
  const half = Math.round((depth / 2) * 100) / 100;
  const theta = step.sign * 90 * t;
  const ahead = neighborOrientation(step.after, step.direction).face;
  const behind = neighborOrientation(step.before, OPPOSITE[step.direction]).face;
  const placements: Array<[CubeFaceId, number]> = [
    [step.from, 0],
    [step.to, -step.sign * 90],
    [ahead, -step.sign * 180],
    [behind, step.sign * 90],
  ];
  const unique = new Map<CubeFaceId, number>();
  for (const [face, deg] of placements) if (!unique.has(face)) unique.set(face, deg);
  return {
    layerTransform: `translateZ(${-Math.round((half + turnRecess(depth, theta)) * 100) / 100}px) ${rotate(step.axis, theta)}`,
    perspective: turnPerspective(width, height),
    faces: [...unique].map(([face, deg]) => ({
      face,
      transform: `${rotate(step.axis, deg)} translateZ(${half}px)`,
      shade: shadeFor(deg + theta),
    })),
  };
}
