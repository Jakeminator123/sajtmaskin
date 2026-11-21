/**
 * Kuben: ren logik för den sexsidiga byggpanelen.
 *
 * Modellen är en "jordglob", inte en fri tärning. Fyra sidor bildar en
 * ekvator (chatt → svar → bygglogg → verktyg) och två är poler (avatar uppe,
 * sajtkarta nere). Innehållet ritas alltid upprätt, så en fri tärning (där en
 * sida kan hamna upp och ned eller roterad 90°) kan inte återges ärligt. Globen
 * håller ändå grannskapet geometriskt sant: polens vänstra kant gränsar mot
 * ankarets vänstra granne, nedre kanten mot ankaret och övre kanten mot ankarets
 * motsida ("över polen landar man på baksidan").
 *
 * Minnet som behövs är `anchor`: den ekvatorsida man senast stod på. På en
 * ekvatorsida är ankaret sidan själv.
 */

export const CUBE_FACE_IDS = ["chat", "answers", "buildlog", "tools", "avatar", "sitemap"] as const;
export type CubeFaceId = (typeof CUBE_FACE_IDS)[number];

export const EQUATOR_FACE_IDS = ["chat", "answers", "buildlog", "tools"] as const;
export type EquatorFaceId = (typeof EQUATOR_FACE_IDS)[number];

export type CubeDirection = "left" | "right" | "up" | "down";
export const CUBE_DIRECTIONS: readonly CubeDirection[] = ["right", "left", "up", "down"];

export type CubeAxis = "x" | "y";

export interface CubeOrientation {
  face: CubeFaceId;
  /** Senaste ekvatorsida; avgör polernas grannar. Lika med `face` på ekvatorn. */
  anchor: EquatorFaceId;
}

export interface CubeTurnStep {
  from: CubeFaceId;
  to: CubeFaceId;
  direction: CubeDirection;
  /** `y` = vridning runt lodrät axel (vänster/höger), `x` = runt vågrät. */
  axis: CubeAxis;
  /**
   * Tecken på lådans rotationsvinkel i CSS-konventionen (`rotateY(+)`
   * vrider högerkanten bakåt, `rotateX(+)` vrider nederkanten framåt).
   * Höger/upp = -1, vänster/ned = +1.
   */
  sign: 1 | -1;
  degrees: 90;
  before: CubeOrientation;
  after: CubeOrientation;
}

export function isEquatorFace(face: CubeFaceId): face is EquatorFaceId {
  return (EQUATOR_FACE_IDS as readonly string[]).includes(face);
}

export function orientationOf(face: CubeFaceId, anchor: EquatorFaceId = "chat"): CubeOrientation {
  return isEquatorFace(face) ? { face, anchor: face } : { face, anchor };
}

function equatorStep(face: EquatorFaceId, offset: number): EquatorFaceId {
  const i = EQUATOR_FACE_IDS.indexOf(face);
  return EQUATOR_FACE_IDS[(i + offset + 4) % 4];
}

export function oppositeOf(face: CubeFaceId): CubeFaceId {
  if (face === "avatar") return "sitemap";
  if (face === "sitemap") return "avatar";
  return equatorStep(face, 2);
}

const DIRECTION_AXIS: Record<CubeDirection, { axis: CubeAxis; sign: 1 | -1 }> = {
  right: { axis: "y", sign: -1 },
  left: { axis: "y", sign: 1 },
  up: { axis: "x", sign: -1 },
  down: { axis: "x", sign: 1 },
};

/** Grannen i en riktning plus orienteringen man landar i. */
export function neighborOrientation(
  from: CubeOrientation | CubeFaceId,
  direction: CubeDirection,
): CubeOrientation {
  const o = typeof from === "string" ? orientationOf(from) : from;
  const { face, anchor } = o;
  if (isEquatorFace(face)) {
    if (direction === "right") return orientationOf(equatorStep(face, 1));
    if (direction === "left") return orientationOf(equatorStep(face, -1));
    if (direction === "up") return { face: "avatar", anchor: face };
    return { face: "sitemap", anchor: face };
  }
  // Pol: vänster/höger går till ankarets ekvatorgrannar.
  if (direction === "right") return orientationOf(equatorStep(anchor, 1));
  if (direction === "left") return orientationOf(equatorStep(anchor, -1));
  const towardAnchor = face === "avatar" ? "down" : "up";
  if (direction === towardAnchor) return orientationOf(anchor);
  // Över polen: landa på ankarets motsida (upprätt).
  return orientationOf(equatorStep(anchor, 2));
}

export function neighborOf(from: CubeOrientation | CubeFaceId, direction: CubeDirection): CubeFaceId {
  return neighborOrientation(from, direction).face;
}

export function makeStep(before: CubeOrientation, direction: CubeDirection): CubeTurnStep {
  const after = neighborOrientation(before, direction);
  const { axis, sign } = DIRECTION_AXIS[direction];
  return { from: before.face, to: after.face, direction, axis, sign, degrees: 90, before, after };
}

/** Vänd ett steg (för avbrott tillbaka till startsidan). */
export function reverseStep(step: CubeTurnStep): CubeTurnStep {
  const opposite: Record<CubeDirection, CubeDirection> = {
    right: "left",
    left: "right",
    up: "down",
    down: "up",
  };
  return {
    from: step.to,
    to: step.from,
    direction: opposite[step.direction],
    axis: step.axis,
    sign: step.sign === 1 ? -1 : 1,
    degrees: 90,
    before: step.after,
    after: step.before,
  };
}

/**
 * Kortaste vägen (BFS) från en orientering till en sida. Deterministisk: bland
 * lika korta vägar vinner den som byter riktning minst gånger (pol till pol går
 * rakt ned/upp via ankaret), därefter grannordningen höger, vänster, upp, ned.
 * Högst två steg i den här kartan.
 */
export function planTurn(from: CubeOrientation | CubeFaceId, to: CubeFaceId): CubeTurnStep[] {
  const start = typeof from === "string" ? orientationOf(from) : from;
  if (start.face === to) return [];
  const key = (o: CubeOrientation) => `${o.face}/${o.anchor}`;
  const turnsInPath = (path: CubeTurnStep[]) =>
    path.reduce((n, step, i) => n + (i > 0 && path[i - 1].direction !== step.direction ? 1 : 0), 0);
  const seen = new Set([key(start)]);
  let frontier: Array<{ at: CubeOrientation; path: CubeTurnStep[] }> = [{ at: start, path: [] }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    const found: CubeTurnStep[][] = [];
    const levelSeen = new Set<string>();
    for (const node of frontier) {
      for (const direction of CUBE_DIRECTIONS) {
        const step = makeStep(node.at, direction);
        const path = [...node.path, step];
        if (step.to === to) {
          found.push(path);
          continue;
        }
        const k = key(step.after);
        if (seen.has(k) || levelSeen.has(k)) continue;
        levelSeen.add(k);
        next.push({ at: step.after, path });
      }
    }
    if (found.length > 0) {
      // Stabil sortering: lika antal riktningsbyten behåller grannordningen.
      return [...found].sort((a, b) => turnsInPath(a) - turnsInPath(b))[0];
    }
    for (const k of levelSeen) seen.add(k);
    frontier = next;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Turn-motor (ren tillståndsmaskin; komponenten driver `progress` med rAF)
// ---------------------------------------------------------------------------

export interface CubeTurnState {
  /** Orienteringen när inget vrids (eller före aktuellt steg). */
  settled: CubeOrientation;
  current: CubeTurnStep | null;
  /** 0..1 för `current`. */
  progress: number;
  queue: CubeTurnStep[];
}

export function idleTurnState(face: CubeFaceId, anchor?: EquatorFaceId): CubeTurnState {
  return { settled: orientationOf(face, anchor), current: null, progress: 0, queue: [] };
}

/** Sidan som visas när allt är klart. */
export function turnDestination(state: CubeTurnState): CubeFaceId {
  const last = state.queue.at(-1) ?? state.current;
  return last ? last.to : state.settled.face;
}

/**
 * Begär en ny målsida. Avbrott hoppar aldrig: ett steg som pågår får antingen
 * gå klart (och kön planeras om från dess slut) eller vändas på plats om målet
 * är sidan det just lämnar (vändningen tar kvarvarande vinkel, aldrig ett hopp). Snabba klick ersätter kön, så motorn slutar alltid
 * på den senast begärda sidan.
 */
export function retargetTurn(state: CubeTurnState, target: CubeFaceId): CubeTurnState {
  const { current } = state;
  if (!current) {
    return { ...state, queue: planTurn(state.settled, target) };
  }
  if (target === current.from) {
    const reversed = reverseStep(current);
    return {
      settled: current.after,
      current: reversed,
      progress: 1 - state.progress,
      queue: [],
    };
  }
  return { ...state, queue: planTurn(current.after, target) };
}

/** Flytta fram motorn. Returnerar nytt tillstånd; `progress` klipps till 0..1. */
export function advanceTurn(state: CubeTurnState, delta: number): CubeTurnState {
  let next = state;
  if (!next.current) {
    if (next.queue.length === 0) return next;
    next = { ...next, current: next.queue[0], queue: next.queue.slice(1), progress: 0 };
  }
  const progress = Math.min(1, next.progress + delta);
  if (progress < 1) return { ...next, progress };
  const done = next.current as CubeTurnStep;
  return { settled: done.after, current: null, progress: 0, queue: next.queue };
}

export function isTurnIdle(state: CubeTurnState): boolean {
  return !state.current && state.queue.length === 0;
}
