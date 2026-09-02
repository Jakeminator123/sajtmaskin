export type PhysicsShape = "box" | "circle";

export interface PhysicsItemSpec {
  id: string;
  width: number;
  height: number;
  shape: PhysicsShape;
}

export const PHYSICS_MAX_BODIES = 30;

export function clampBodyCount(n: number, max = PHYSICS_MAX_BODIES): number {
  return Math.min(Math.max(0, Math.floor(n)), max);
}

export function spawnPositions(
  count: number,
  stageWidth: number,
  itemWidth: number,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const safeWidth = Math.max(stageWidth, 1);
  const safeItem = Math.max(itemWidth, 1);
  const columns = Math.max(1, Math.floor(safeWidth / safeItem));
  const cell = safeWidth / columns;
  const offsetAmt = Math.min(16, cell / 6);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const offset = (i % 2 === 0 ? -1 : 1) * offsetAmt;
    const x = Math.min(Math.max(cell * col + cell / 2 + offset, 0), safeWidth);
    const y = -40 - row * 104;
    positions.push({ x, y });
  }

  return positions;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toTransform(
  x: number,
  y: number,
  angle: number,
  width: number,
  height: number,
): string {
  const tx = round2(x - width / 2);
  const ty = round2(y - height / 2);
  const rot = round2(angle);
  return `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}rad)`;
}
