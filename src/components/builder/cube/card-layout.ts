/**
 * Ren geometri för kortläget och kubens position/storlek.
 *
 * Grundregel: det sparade värdet (från en stor skärm) skrivs aldrig över bara
 * för att scenen är mindre just nu. `fitRect` räknar fram en effektiv rektangel
 * vid rendering; först när användaren själv drar eller ändrar storlek blir den
 * effektiva rektangeln det nya sparade värdet.
 */

import { CUBE_FACE_IDS, type CubeFaceId } from "./cube-model";

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point, Size {}

export interface SizeLimits {
  min: Size;
  max: Size;
}

export const STAGE_MARGIN = 12;
/** Plats som kortfältet längst ned tar; kort ska inte hamna under det. */
export const CARD_BAR_RESERVE = 56;
export const CARD_SHRINK = 0.88;
export const CARD_GROW = 1.14;
export const CARD_CASCADE = 28;
export const CARD_GAP = 12;
/**
 * Sidor som börjar nedfällda i kortläget. De fyra övriga står längs scenens
 * kanter, så att sajten syns i mitten.
 */
export const DEFAULT_FOLDED_CARDS: readonly CubeFaceId[] = ["tools", "sitemap"];

export const CARD_LIMITS: SizeLimits = {
  min: { width: 240, height: 180 },
  max: { width: 760, height: 900 },
};

export const CUBE_LIMITS: SizeLimits = {
  min: { width: 300, height: 320 },
  max: { width: 720, height: 900 },
};

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampSize(size: Size, limits: SizeLimits): Size {
  return {
    width: Math.round(clamp(size.width, limits.min.width, limits.max.width)),
    height: Math.round(clamp(size.height, limits.min.height, limits.max.height)),
  };
}

/** Grän för var ett objekt med given storlek får ligga på scenen. */
export function dragBounds(stage: Size, size: Size, margin = STAGE_MARGIN, bottomReserve = 0) {
  const maxX = stage.width - size.width - margin;
  const maxY = stage.height - size.height - margin - bottomReserve;
  return {
    minX: margin,
    minY: margin,
    maxX: Math.max(margin, maxX),
    maxY: Math.max(margin, maxY),
  };
}

export function clampPoint(point: Point, stage: Size, size: Size, margin = STAGE_MARGIN, bottomReserve = 0): Point {
  const b = dragBounds(stage, size, margin, bottomReserve);
  return {
    x: Math.round(clamp(point.x, b.minX, b.maxX)),
    y: Math.round(clamp(point.y, b.minY, b.maxY)),
  };
}

/**
 * Passa in en sparad rektangel i en (kanske mindre) scen: storleken krymps till
 * vad som får plats (men aldrig under min om scenen tillåter det), positionen
 * klämms. Indata ändras inte.
 */
export function fitRect(saved: Rect, stage: Size, limits: SizeLimits, margin = STAGE_MARGIN, bottomReserve = 0): Rect {
  const room = {
    width: Math.max(0, stage.width - margin * 2),
    height: Math.max(0, stage.height - margin * 2 - bottomReserve),
  };
  const size = clampSize(saved, limits);
  const width = Math.round(Math.min(size.width, Math.max(room.width, Math.min(limits.min.width, room.width))));
  const height = Math.round(Math.min(size.height, Math.max(room.height, Math.min(limits.min.height, room.height))));
  const point = clampPoint(saved, stage, { width, height }, margin, bottomReserve);
  return { ...point, width, height };
}

/** Krymp/väx ett kort genom att multiplicera bredd och höjd (inte CSS-scale). */
export function scaleCard(rect: Rect, factor: number, stage: Size, limits = CARD_LIMITS): Rect {
  const size = clampSize({ width: rect.width * factor, height: rect.height * factor }, limits);
  // Behåll mittpunkten så kortet växer "på plats".
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const point = clampPoint({ x: cx - size.width / 2, y: cy - size.height / 2 }, stage, size, STAGE_MARGIN, CARD_BAR_RESERVE);
  return { ...point, ...size };
}

/**
 * Standardplacering. Fyra kort står längs kanterna så att sajten syns i
 * mitten: svaren över chatten till vänster (som i chattpanelen), avataren över
 * byggloggen till höger. Verktyg och sajtkarta börjar nedfällda
 * (`DEFAULT_FOLDED_CARDS`) och öppnas i mitten, upptill.
 *
 * En scen som är för smal eller låg för två kolumner får kaskaden i stället.
 */
export function defaultCardRects(stage: Size): Record<CubeFaceId, Rect> {
  const room = {
    width: stage.width - STAGE_MARGIN * 2,
    height: stage.height - STAGE_MARGIN * 2 - CARD_BAR_RESERVE,
  };
  const column = Math.round(clamp(stage.width * 0.26, 300, 400));
  // Chatten behöver höjd för komposern; svaren får resten.
  const chat = Math.round(clamp(room.height * 0.44, 260, 340));
  const answers = room.height - CARD_GAP - chat;
  if (room.width < column * 2 + CARD_GAP || answers < CARD_LIMITS.min.height) {
    return cascadeCardRects(stage);
  }
  const left = STAGE_MARGIN;
  const right = stage.width - STAGE_MARGIN - column;
  const top = STAGE_MARGIN;
  const avatar = Math.round(clamp(room.height * 0.5, 220, 420));
  const middle = 320;
  const placed: Record<CubeFaceId, Rect> = {
    answers: { x: left, y: top, width: column, height: answers },
    chat: { x: left, y: top + answers + CARD_GAP, width: column, height: chat },
    avatar: { x: right, y: top, width: column, height: avatar },
    buildlog: {
      x: right,
      y: top + avatar + CARD_GAP,
      width: column,
      height: room.height - CARD_GAP - avatar,
    },
    tools: { x: left + column + CARD_GAP, y: top, width: middle, height: 320 },
    sitemap: { x: right - CARD_GAP - middle, y: top, width: middle, height: 380 },
  };
  const out = {} as Record<CubeFaceId, Rect>;
  for (const face of CUBE_FACE_IDS) {
    out[face] = fitRect(placed[face], stage, CARD_LIMITS, STAGE_MARGIN, CARD_BAR_RESERVE);
  }
  return out;
}

/**
 * Kaskad: kort i kolumner (så många som får plats, högst tre), varje kolumn
 * förskjuten `CARD_CASCADE` px nedåt/åt höger. Kolumnerna fylls från höger
 * kant. Reserv för scener där standardplaceringen inte får plats.
 */
export function cascadeCardRects(
  stage: Size,
  faces: readonly CubeFaceId[] = CUBE_FACE_IDS,
  cardSize: Size = { width: 360, height: 440 },
): Record<CubeFaceId, Rect> {
  const usable = stage.width - STAGE_MARGIN * 2;
  const columns = Math.max(1, Math.min(3, Math.floor((usable + 16) / (cardSize.width + 16 + CARD_CASCADE))));
  const perColumn = Math.ceil(faces.length / columns);
  const out = {} as Record<CubeFaceId, Rect>;
  faces.forEach((face, index) => {
    const column = Math.floor(index / perColumn);
    const row = index % perColumn;
    const columnFromRight = columns - 1 - column;
    const x = stage.width - STAGE_MARGIN - cardSize.width - columnFromRight * (cardSize.width + 16 + CARD_CASCADE) - (perColumn - 1 - row) * CARD_CASCADE;
    const y = STAGE_MARGIN + row * CARD_CASCADE * 1.6;
    out[face] = fitRect({ x, y, ...cardSize }, stage, CARD_LIMITS, STAGE_MARGIN, CARD_BAR_RESERVE);
  });
  return out;
}

/** Lyft ett kort överst; returnerar ny ordning (sista = överst). */
export function raise(order: readonly CubeFaceId[], face: CubeFaceId): CubeFaceId[] {
  return [...order.filter((f) => f !== face), face];
}

export type ResizeEdge = "e" | "s" | "se" | "w" | "n" | "nw" | "ne" | "sw";

/** Storleksändring från en kant/hörn. Positionen följer med vid n/w-kanter. */
export function resizeFrom(start: Rect, edge: ResizeEdge, dx: number, dy: number, stage: Size, limits: SizeLimits, bottomReserve = 0): Rect {
  let { x, y, width, height } = start;
  if (edge.includes("e")) width = start.width + dx;
  if (edge.includes("s")) height = start.height + dy;
  if (edge.includes("w")) width = start.width - dx;
  if (edge.includes("n")) height = start.height - dy;
  const maxW = Math.min(
    limits.max.width,
    edge.includes("w") ? start.x + start.width - STAGE_MARGIN : stage.width - STAGE_MARGIN - start.x,
  );
  const maxH = Math.min(
    limits.max.height,
    edge.includes("n") ? start.y + start.height - STAGE_MARGIN : stage.height - STAGE_MARGIN - bottomReserve - start.y,
  );
  width = Math.round(clamp(width, limits.min.width, Math.max(limits.min.width, maxW)));
  height = Math.round(clamp(height, limits.min.height, Math.max(limits.min.height, maxH)));
  if (edge.includes("w")) x = start.x + start.width - width;
  if (edge.includes("n")) y = start.y + start.height - height;
  return { x: Math.round(x), y: Math.round(y), width, height };
}

// ---------------------------------------------------------------------------
// Kubens ram: huvud ovanför, fasad ram (sidornas "tjocklek") runt panelen,
// docka under. `size` i API:t är panelens (sidans) W x H.
// ---------------------------------------------------------------------------

export const CUBE_HEAD = 44;
export const CUBE_BEVEL = 14;
export const CUBE_DOCK = 52;
export const NARROW_MAX_WIDTH = 640;

export interface CubeFrame {
  outer: Rect;
  body: Rect;
}

function chromeLimits(): SizeLimits {
  const w = CUBE_BEVEL * 2;
  const h = CUBE_HEAD + CUBE_BEVEL * 2 + CUBE_DOCK;
  return {
    min: { width: CUBE_LIMITS.min.width + w, height: CUBE_LIMITS.min.height + h },
    max: { width: CUBE_LIMITS.max.width + w, height: CUBE_LIMITS.max.height + h },
  };
}

export function outerFromBody(position: Point, size: Size): Rect {
  return {
    x: position.x,
    y: position.y,
    width: size.width + CUBE_BEVEL * 2,
    height: size.height + CUBE_HEAD + CUBE_BEVEL * 2 + CUBE_DOCK,
  };
}

export function bodyFromOuter(outer: Rect): Rect {
  return {
    x: outer.x + CUBE_BEVEL,
    y: outer.y + CUBE_HEAD + CUBE_BEVEL,
    width: outer.width - CUBE_BEVEL * 2,
    height: outer.height - CUBE_HEAD - CUBE_BEVEL * 2 - CUBE_DOCK,
  };
}

/**
 * Effektiv ram för kuben på en scen. Smal scen: flikar i full bredd längst
 * ned (bottenark), ingen dragning. Inbäddat läge fyller hela chattytan.
 * Annars används sparad position/storlek inpassad.
 */
export function cubeFrame(
  position: Point,
  size: Size,
  stage: Size,
  narrow: boolean,
  embedded = false,
): CubeFrame {
  if (narrow || embedded) {
    const height = embedded
      ? stage.height
      : Math.round(Math.min(stage.height, Math.max(320, stage.height * 0.62)));
    const outer = { x: 0, y: Math.max(0, stage.height - height), width: stage.width, height };
    const header = CUBE_DOCK + (embedded ? CUBE_HEAD : 0);
    return {
      outer,
      body: { x: 0, y: outer.y + header, width: stage.width, height: Math.max(0, height - header) },
    };
  }
  const outer = fitRect(outerFromBody(position, size), stage, chromeLimits());
  return { outer, body: bodyFromOuter(outer) };
}

/** Storleksändring av kuben från en kant; returnerar ny position och panelstorlek. */
export function resizeCube(start: Rect, edge: ResizeEdge, dx: number, dy: number, stage: Size): { position: Point; size: Size } {
  const outer = resizeFrom(start, edge, dx, dy, stage, chromeLimits());
  const body = bodyFromOuter(outer);
  return { position: { x: outer.x, y: outer.y }, size: { width: body.width, height: body.height } };
}
