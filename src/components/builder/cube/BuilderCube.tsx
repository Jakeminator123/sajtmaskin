"use client";

/**
 * Kuben: en flytande, sexsidig byggpanel som också kan fällas ut till sex
 * fristående kort över förhandsvisningen.
 *
 * Bärande beslut (se cube-geometry.ts för jämförelsen A/B):
 *
 * - Alla sex sidor är syskon i ETT lager och byter aldrig förälder. Läge
 *   (kub/kort/flikar) ändrar bara position, storlek, roll och synlighet, så
 *   chattens scroll, ett textutkast och en levande `<video>` överlever.
 * - 3D finns bara under en vridning. I vila har ingen sida någon transform, så
 *   den aktiva sidan är vanlig platt DOM (skarp text, IME, markering).
 * - Transformer skrivs direkt i DOM från en rAF-loop; React renderas bara vid
 *   stegets gränser (vilka sidor som rör sig, vilken som står fram).
 * - Dolda sidor: `visibility:hidden` + `content-visibility:hidden` + `inert` +
 *   `aria-hidden`. Inget av dem avmonterar eller nollställer scroll.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { Box, ChevronDown, GripVertical, LayoutGrid, Minus, PanelLeft, Plus, RotateCcw } from "lucide-react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  CUBE_FACE_IDS,
  advanceTurn,
  idleTurnState,
  isTurnIdle,
  neighborOf,
  planTurn,
  retargetTurn,
  turnDestination,
  type CubeDirection,
  type CubeFaceId,
  orientationOf,
  type CubeOrientation,
  type CubeTurnState,
  type CubeTurnStep,
} from "./cube-model";
import { boxTurnPoses, easeTurn, virtualTurnPoses, type CubeGeometry, type FacePose } from "./cube-geometry";
import {
  CARD_BAR_RESERVE,
  CARD_GROW,
  CARD_LIMITS,
  CARD_SHRINK,
  CUBE_BEVEL,
  CUBE_DOCK,
  CUBE_HEAD,
  NARROW_MAX_WIDTH,
  STAGE_MARGIN,
  clampPoint,
  cubeFrame,
  defaultCardRects,
  fitRect,
  raise,
  resizeCube,
  resizeFrom,
  scaleCard,
  type Point,
  type Rect,
  type ResizeEdge,
  type Size,
} from "./card-layout";
import { nudgeHandler, usePointerDrag } from "./cube-drag";
import type { CubeMode } from "./cube-layout-storage";

export interface CubeFaceSpec {
  label: string;
  icon: ReactNode;
  content: ReactNode;
  badge?: number | "dot";
}

export interface CubeCardsState {
  rects: Partial<Record<CubeFaceId, Rect>>;
  folded: CubeFaceId[];
  /** Z-ordning, sista = överst. */
  order: CubeFaceId[];
}

/** Hur dolda sidor göms. Labbval för mätningen; standard är det som vann. */
export type HiddenFaceStrategy = "content-visibility" | "visibility" | "display";

export interface BuilderCubeProps {
  faces: Record<CubeFaceId, CubeFaceSpec>;
  activeFace: CubeFaceId;
  onActiveFaceChange: (face: CubeFaceId) => void;
  position: Point;
  onPositionChange: (position: Point) => void;
  /** Panelens (sidans) storlek, utan huvud/ram/docka. */
  size: Size;
  onSizeChange: (size: Size) => void;
  mode: CubeMode;
  onModeChange: (mode: CubeMode) => void;
  /** Kortlägets layout. Utelämnad → intern state. */
  cards?: CubeCardsState;
  onCardsChange?: (cards: CubeCardsState) => void;
  onResetLayout?: () => void;
  /**
   * Lämna kuben för den vanliga panelen. Utelämnad → ingen knapp (kuben är då
   * ytans enda läge, som i tester).
   */
  onExit?: () => void;
  geometry?: CubeGeometry;
  hiddenStrategy?: HiddenFaceStrategy;
  /** Tvinga reducerad rörelse (labb/tester); annars följs mediafrågan. */
  reducedMotion?: boolean;
  className?: string;
  /** Tillgänglig rubrik för hela panelen. */
  label?: string;
}

/** Accentfärg per sida: kortkant, ikon och fasens ton. Fulla klassnamn för Tailwind. */
export const FACE_ACCENTS: Record<CubeFaceId, { text: string; edge: string; soft: string }> = {
  chat: { text: "text-sky-400", edge: "border-t-sky-400/70", soft: "bg-sky-400/15" },
  answers: { text: "text-violet-400", edge: "border-t-violet-400/70", soft: "bg-violet-400/15" },
  buildlog: { text: "text-amber-400", edge: "border-t-amber-400/70", soft: "bg-amber-400/15" },
  tools: { text: "text-emerald-400", edge: "border-t-emerald-400/70", soft: "bg-emerald-400/15" },
  avatar: { text: "text-rose-400", edge: "border-t-rose-400/70", soft: "bg-rose-400/15" },
  sitemap: { text: "text-cyan-400", edge: "border-t-cyan-400/70", soft: "bg-cyan-400/15" },
};

const TURN_MS = 460;
const TURN_FAST_MS = 260;
const FOLD_MS = 420;
const FADE_MS = 160;
const CARD_HEAD = 40;
const MAX_TILT_DEG = 5;
const NARROW_QUERY = `(max-width: ${NARROW_MAX_WIDTH - 0.02}px)`;
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === "function";
}

/** Släpp en draglutning mjukt tillbaka till platt (ingen transform i vila). */
function easeOutTilt(el: HTMLElement) {
  const current = el.style.transform;
  const origin = el.style.transformOrigin;
  el.style.transform = "";
  el.style.transformOrigin = "";
  if (current && canAnimate(el)) {
    el.animate(
      [
        { transform: current, transformOrigin: origin },
        { transform: "none", transformOrigin: origin },
      ],
      { duration: 220, easing: "ease-out" },
    );
  }
}

function rectStyle(r: Rect): CSSProperties {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

function flipFrom(from: Rect, to: Rect): string {
  const sx = to.width > 0 ? from.width / to.width : 1;
  const sy = to.height > 0 ? from.height / to.height : 1;
  return `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${sx}, ${sy})`;
}

function Badge({ badge }: { badge?: number | "dot" }) {
  if (badge === undefined || badge === 0) return null;
  if (badge === "dot") {
    return <span className="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full" aria-hidden="true" />;
  }
  return (
    <span
      className="bg-primary text-primary-foreground absolute -top-1.5 -right-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums"
      aria-hidden="true"
    >
      {badge > 99 ? "99+" : badge}
    </span>
  );
}

function badgeText(badge?: number | "dot"): string {
  if (badge === undefined || badge === 0) return "";
  return badge === "dot" ? ", nytt" : `, ${badge} nya`;
}

export function BuilderCube({
  faces,
  activeFace,
  onActiveFaceChange,
  position,
  onPositionChange,
  size,
  onSizeChange,
  mode,
  onModeChange,
  cards: cardsProp,
  onCardsChange,
  onResetLayout,
  onExit,
  geometry = "virtual",
  hiddenStrategy = "content-visibility",
  reducedMotion: reducedProp,
  className,
  label = "Byggpanel",
}: BuilderCubeProps) {
  const uid = useId();
  const tabId = (f: CubeFaceId) => `${uid}-tab-${f}`;
  const panelId = (f: CubeFaceId) => `${uid}-panel-${f}`;
  const titleId = (f: CubeFaceId) => `${uid}-title-${f}`;

  const narrow = useMediaQuery(NARROW_QUERY);
  const reducedQuery = useMediaQuery(REDUCED_QUERY);
  const reduced = reducedProp ?? reducedQuery;
  const layoutMode: "cube" | "cards" | "tabs" = narrow ? "tabs" : mode;

  // ---- Scenens storlek -----------------------------------------------------
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const faceEls = useRef<Partial<Record<CubeFaceId, HTMLDivElement | null>>>({});
  const shadeEls = useRef<Partial<Record<CubeFaceId, HTMLDivElement | null>>>({});
  const barButtons = useRef<Partial<Record<CubeFaceId, HTMLButtonElement | null>>>({});
  const [stage, setStage] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // jsdom mäter 0; fall tillbaka till fönstret.
      const width = r.width || window.innerWidth;
      const height = r.height || window.innerHeight;
      setStage((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const stageSize = useMemo<Size>(() => stage ?? { width: 0, height: 0 }, [stage]);
  const frame = useMemo(() => cubeFrame(position, size, stageSize, narrow), [position, size, stageSize, narrow]);

  // ---- Kortläge (kontrollerat eller internt) -----------------------------
  const [cardsInternal, setCardsInternal] = useState<CubeCardsState>({ rects: {}, folded: [], order: [...CUBE_FACE_IDS] });
  const cards = cardsProp ?? cardsInternal;
  const cardsRef = useRef(cards);
  useLayoutEffect(() => {
    cardsRef.current = cards;
  });
  const setCards = useCallback(
    (update: (prev: CubeCardsState) => CubeCardsState) => {
      const next = update(cardsRef.current);
      if (next === cardsRef.current) return;
      cardsRef.current = next;
      if (onCardsChange) onCardsChange(next);
      else setCardsInternal(next);
    },
    [onCardsChange],
  );
  const defaults = useMemo(() => defaultCardRects(stageSize), [stageSize]);
  const cardRect = useCallback(
    (face: CubeFaceId): Rect =>
      fitRect(cards.rects[face] ?? defaults[face], stageSize, CARD_LIMITS, STAGE_MARGIN, CARD_BAR_RESERVE),
    [cards.rects, defaults, stageSize],
  );

  // ---- Vridmotor -----------------------------------------------------------
  const engine = useRef<CubeTurnState>(idleTurnState(activeFace));
  const [settled, setSettled] = useState<CubeOrientation>(() => orientationOf(activeFace));
  const displayed = settled.face;
  const [motion, setMotion] = useState<CubeFaceId[]>([]);
  const rafId = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);
  const focusFollows = useRef(false);
  const live = useRef({ body: frame.body, geometry });
  useLayoutEffect(() => {
    live.current = { body: frame.body, geometry };
  });

  const clearPoses = useCallback(() => {
    for (const face of CUBE_FACE_IDS) {
      const el = faceEls.current[face];
      if (el) {
        el.style.transform = "";
        el.style.backfaceVisibility = "";
        el.style.willChange = "";
      }
      const shade = shadeEls.current[face];
      if (shade) shade.style.opacity = "0";
    }
    const root = rootRef.current;
    const layer = layerRef.current;
    if (root) {
      root.style.perspective = "";
      root.style.perspectiveOrigin = "";
    }
    if (layer) {
      layer.style.transform = "";
      layer.style.transformStyle = "";
      layer.style.transformOrigin = "";
    }
  }, []);

  const facesInStep = useCallback((step: CubeTurnStep): CubeFaceId[] => {
    if (live.current.geometry === "box") {
      const { body } = live.current;
      return boxTurnPoses(step, 0, body.width, body.height).faces.map((p) => p.face);
    }
    return [step.from, step.to];
  }, []);

  const applyPoses = useCallback(() => {
    const s = engine.current;
    const step = s.current;
    if (!step) return;
    const { body, geometry: geo } = live.current;
    const t = easeTurn(s.progress);
    let poses: FacePose[];
    if (geo === "box") {
      const box = boxTurnPoses(step, t, body.width, body.height);
      const root = rootRef.current;
      const layer = layerRef.current;
      const cx = body.x + body.width / 2;
      const cy = body.y + body.height / 2;
      if (root) {
        root.style.perspective = `${box.perspective}px`;
        root.style.perspectiveOrigin = `${cx}px ${cy}px`;
      }
      if (layer) {
        layer.style.transformStyle = "preserve-3d";
        layer.style.transformOrigin = `${cx}px ${cy}px`;
        layer.style.transform = box.layerTransform;
      }
      poses = box.faces;
    } else {
      poses = virtualTurnPoses(step, t, body.width, body.height);
    }
    for (const pose of poses) {
      const el = faceEls.current[pose.face];
      if (el) {
        el.style.transform = pose.transform;
        el.style.backfaceVisibility = "hidden";
        el.style.willChange = "transform";
      }
      const shade = shadeEls.current[pose.face];
      if (shade) shade.style.opacity = String(pose.shade);
    }
  }, []);

  const settleFocus = useCallback(() => {
    if (!focusFollows.current) return;
    focusFollows.current = false;
    const panel = faceEls.current[engine.current.settled.face];
    panel?.focus({ preventScroll: true });
  }, []);

  const tickRef = useRef<(ts: number) => void>(() => {});
  const tick: (ts: number) => void = useCallback(
    (ts: number) => {
      const prevTs = lastTs.current ?? ts;
      lastTs.current = ts;
      const dt = Math.min(64, ts - prevTs);
      const before = engine.current;
      const duration = before.queue.length > 0 ? TURN_FAST_MS : TURN_MS;
      let next = advanceTurn(before, dt / duration);
      // Steg klart men kön inte tom: börja nästa i samma ruta (inget glapp).
      if (!next.current && next.queue.length > 0) next = advanceTurn(next, 0);
      engine.current = next;
      if (next.current !== before.current) {
        const step = next.current;
        flushSync(() => {
          setSettled(next.settled);
          setMotion(step ? facesInStep(step) : []);
        });
        clearPoses();
      }
      if (isTurnIdle(next)) {
        rafId.current = null;
        lastTs.current = null;
        clearPoses();
        settleFocus();
        return;
      }
      applyPoses();
      rafId.current = requestAnimationFrame(tickRef.current);
    },
    [applyPoses, clearPoses, facesInStep, settleFocus],
  );
  useLayoutEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const snapTo = useCallback(
    (face: CubeFaceId) => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastTs.current = null;
      const path = planTurn(engine.current.current?.after ?? engine.current.settled, face);
      const anchor = path.at(-1)?.after.anchor ?? engine.current.settled.anchor;
      engine.current = idleTurnState(face, anchor);
      clearPoses();
      setMotion([]);
      setSettled(engine.current.settled);
    },
    [clearPoses],
  );

  const prevActive = useRef(activeFace);
  useEffect(() => {
    if (prevActive.current === activeFace && turnDestination(engine.current) === activeFace) return;
    const from = displayed;
    prevActive.current = activeFace;
    const fromEl = faceEls.current[from];
    const hadFocus = !!fromEl && fromEl.contains(document.activeElement);
    if (layoutMode !== "cube" || reduced) {
      // Motorn bor i refs och rAF; att landa direkt måste ske här, inte under rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synkar extern motor mot prop
      snapTo(activeFace);
      if (hadFocus && layoutMode !== "cards") {
        // Sidan man stod på försvann: flytta fokus till nya flikpanelen.
        requestAnimationFrame(() => faceEls.current[activeFace]?.focus({ preventScroll: true }));
      }
      const el = faceEls.current[activeFace];
      if (layoutMode !== "cards" && reduced && from !== activeFace && canAnimate(el)) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
      }
      return;
    }
    if (hadFocus) focusFollows.current = true;
    engine.current = retargetTurn(engine.current, activeFace);
    if (rafId.current === null && !isTurnIdle(engine.current)) {
      rafId.current = requestAnimationFrame(tickRef.current);
    }
  }, [activeFace, displayed, layoutMode, reduced, snapTo]);

  // Byte av läge mitt i en vridning: landa direkt.
  useEffect(() => {
    if (layoutMode !== "cube" && !isTurnIdle(engine.current)) snapTo(turnDestination(engine.current));
  }, [layoutMode, snapTo]);

  useEffect(
    () => () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    },
    [],
  );

  // ---- Utfällning / ihopfällning (FLIP på samma noder) -------------------
  const [prevLayoutMode, setPrevLayoutMode] = useState(layoutMode);
  const [foldPhase, setFoldPhase] = useState<null | "folding" | "unfolding">(null);
  if (prevLayoutMode !== layoutMode) {
    setPrevLayoutMode(layoutMode);
    const animated = !reduced && stage !== null && prevLayoutMode !== "tabs" && layoutMode !== "tabs";
    setFoldPhase(animated ? (layoutMode === "cube" ? "folding" : "unfolding") : null);
  }

  const rectFor = useCallback(
    (face: CubeFaceId): Rect => (layoutMode === "cards" ? cardRect(face) : frame.body),
    [layoutMode, cardRect, frame.body],
  );
  const committedRects = useRef<Partial<Record<CubeFaceId, Rect>>>({});
  const committedMode = useRef(layoutMode);
  const committedFolded = useRef<CubeFaceId[]>(cards.folded);
  const runningAnims = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const modeChanged = committedMode.current !== layoutMode;
    const prevRects = committedRects.current;
    const nextRects: Partial<Record<CubeFaceId, Rect>> = {};
    for (const face of CUBE_FACE_IDS) nextRects[face] = rectFor(face);

    if (modeChanged) {
      for (const a of runningAnims.current) a.cancel();
      runningAnims.current = [];
      const anims: Animation[] = [];
      if (reduced || !foldPhase) {
        if (reduced && layoutMode !== "tabs") {
          for (const face of CUBE_FACE_IDS) {
            const el = faceEls.current[face];
            if (canAnimate(el)) anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS }));
          }
        }
      } else {
        const order = layoutMode === "cards" ? CUBE_FACE_IDS : [...CUBE_FACE_IDS].reverse();
        order.forEach((face, i) => {
          const el = faceEls.current[face];
          const from = prevRects[face];
          const to = nextRects[face];
          if (!canAnimate(el) || !from || !to) return;
          const isFront = face === displayed;
          const delay = i * 28;
          const frames: Keyframe[] =
            foldPhase === "unfolding"
              ? [
                  { transform: flipFrom(from, to), opacity: isFront ? 1 : 0, transformOrigin: "0 0" },
                  { transform: "none", opacity: 1, transformOrigin: "0 0", offset: 1 },
                ]
              : [
                  { transform: flipFrom(from, to), opacity: 1, transformOrigin: "0 0" },
                  { opacity: isFront ? 1 : 0.9, offset: 0.7 },
                  { transform: "none", opacity: isFront ? 1 : 0, transformOrigin: "0 0" },
                ];
          anims.push(
            el.animate(frames, {
              duration: FOLD_MS,
              delay,
              easing: "cubic-bezier(.2,.8,.2,1)",
              fill: "backwards",
            }),
          );
        });
      }
      runningAnims.current = anims;
      if (foldPhase) {
        const done = () => {
          if (runningAnims.current === anims) setFoldPhase(null);
        };
        if (anims.length === 0) done();
        else Promise.all(anims.map((a) => a.finished)).then(done, done);
      }
    } else if (layoutMode === "cards") {
      // Kort som just öppnats från fältet växer ut från sin knapp.
      const reopened = committedFolded.current.filter((f) => !cards.folded.includes(f));
      for (const face of reopened) {
        const el = faceEls.current[face];
        const btn = barButtons.current[face];
        const to = nextRects[face];
        const root = rootRef.current;
        if (!canAnimate(el) || !btn || !to || !root) continue;
        if (reduced) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
          continue;
        }
        const b = btn.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        const from = { x: b.left - r.left, y: b.top - r.top, width: b.width, height: b.height };
        el.animate(
          [
            { transform: flipFrom(from, to), opacity: 0, transformOrigin: "0 0" },
            { transform: "none", opacity: 1, transformOrigin: "0 0" },
          ],
          { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
    }
    committedMode.current = layoutMode;
    committedRects.current = nextRects;
    committedFolded.current = cards.folded;
  });

  // ---- Lutning medan man drar ---------------------------------------------
  const tiltTargets = useRef<HTMLElement[]>([]);
  /** Lutning efter draghastighet; varje element får kubens mitt som origo. */
  const applyTilt = useCallback(
    (targets: Array<{ el: HTMLElement; origin: Point }>, velocity: { x: number; y: number }, perspective: number) => {
      if (reduced) return;
      const ry = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, velocity.x * 6));
      const rx = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, -velocity.y * 6));
      tiltTargets.current = targets.map((t) => t.el);
      for (const { el, origin } of targets) {
        el.style.transformOrigin = `${origin.x}px ${origin.y}px`;
        el.style.transform = `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      }
    },
    [reduced],
  );
  const releaseTilt = useCallback(() => {
    const targets = tiltTargets.current;
    tiltTargets.current = [];
    for (const el of targets) easeOutTilt(el);
  }, []);

  // ---- Kubens dragning och storlek ----------------------------------------
  const dragStart = useRef<Rect | null>(null);
  const cubeDrag = usePointerDrag({
    onStart: () => {
      if (layoutMode !== "cube") return false;
      dragStart.current = frame.outer;
    },
    onMove: (dx, dy, velocity) => {
      const start = dragStart.current;
      if (!start) return;
      onPositionChange(clampPoint({ x: start.x + dx, y: start.y + dy }, stageSize, start));
      const chrome = chromeRef.current;
      const face = faceEls.current[displayed];
      if (chrome && face && isTurnIdle(engine.current)) {
        // Ram och sida är separata noder; samma perspektiv och samma origo
        // (kubens mitt) gör att de lutar som en kropp.
        const cx = start.width / 2;
        const cy = start.height / 2;
        applyTilt(
          [
            { el: chrome, origin: { x: cx, y: cy } },
            { el: face, origin: { x: cx - CUBE_BEVEL, y: cy - CUBE_HEAD - CUBE_BEVEL } },
          ],
          velocity,
          1600,
        );
      }
    },
    onEnd: () => {
      dragStart.current = null;
      releaseTilt();
    },
  });

  const moveCubeBy = (dx: number, dy: number) => {
    onPositionChange(clampPoint({ x: frame.outer.x + dx, y: frame.outer.y + dy }, stageSize, frame.outer));
  };

  const resizeStart = useRef<Rect | null>(null);
  const resizeEdge = useRef<ResizeEdge>("se");
  const cubeResize = usePointerDrag(
    {
      onStart: () => {
        if (layoutMode !== "cube") return false;
        resizeStart.current = frame.outer;
      },
      onMove: (dx, dy) => {
        const start = resizeStart.current;
        if (!start) return;
        const next = resizeCube(start, resizeEdge.current, dx, dy, stageSize);
        onSizeChange(next.size);
        if (next.position.x !== start.x || next.position.y !== start.y) onPositionChange(next.position);
      },
      onEnd: () => {
        resizeStart.current = null;
      },
    },
    { exempt: false },
  );
  const startCubeResize = (edge: ResizeEdge) => (event: ReactPointerEvent<HTMLElement>) => {
    resizeEdge.current = edge;
    cubeResize.onPointerDown(event);
  };

  // ---- Kortens dragning, storlek, lyft, fällning ---------------------------
  const cardDragFace = useRef<CubeFaceId | null>(null);
  const cardStart = useRef<Rect | null>(null);
  const cardEdge = useRef<ResizeEdge>("se");
  const setCardRect = useCallback(
    (face: CubeFaceId, rect: Rect) => setCards((prev) => ({ ...prev, rects: { ...prev.rects, [face]: rect } })),
    [setCards],
  );
  const raiseCard = useCallback(
    (face: CubeFaceId) => {
      setCards((prev) => (prev.order.at(-1) === face ? prev : { ...prev, order: raise(prev.order, face) }));
      if (face !== activeFace) onActiveFaceChange(face);
    },
    [setCards, activeFace, onActiveFaceChange],
  );
  // Ett nedtryck var som helst i kortet lyfter det. Lyssnaren sitter i DOM:en:
  // en sidas innehåll kan vara värdat utifrån (`relocation.tsx`), och
  // React-händelser därifrån bubblar inte genom kubens komponentträd.
  useEffect(() => {
    if (layoutMode !== "cards") return;
    const release = CUBE_FACE_IDS.map((face) => {
      const el = faceEls.current[face];
      if (!el) return null;
      const onDown = () => raiseCard(face);
      el.addEventListener("pointerdown", onDown, true);
      return () => el.removeEventListener("pointerdown", onDown, true);
    });
    return () => {
      for (const off of release) off?.();
    };
  }, [layoutMode, raiseCard]);
  const cardDrag = usePointerDrag({
    onStart: () => {
      const face = cardDragFace.current;
      if (!face || layoutMode !== "cards") return false;
      cardStart.current = cardRect(face);
    },
    onMove: (dx, dy, velocity) => {
      const face = cardDragFace.current;
      const start = cardStart.current;
      if (!face || !start) return;
      const p = clampPoint({ x: start.x + dx, y: start.y + dy }, stageSize, start, STAGE_MARGIN, CARD_BAR_RESERVE);
      setCardRect(face, { ...start, ...p });
      const el = faceEls.current[face];
      if (el) applyTilt([{ el, origin: { x: start.width / 2, y: start.height / 2 } }], velocity, 1400);
    },
    onEnd: () => {
      cardStart.current = null;
      releaseTilt();
    },
  });
  const cardResize = usePointerDrag(
    {
      onStart: () => {
        const face = cardDragFace.current;
        if (!face || layoutMode !== "cards") return false;
        cardStart.current = cardRect(face);
      },
      onMove: (dx, dy) => {
        const face = cardDragFace.current;
        const start = cardStart.current;
        if (!face || !start) return;
        setCardRect(face, resizeFrom(start, cardEdge.current, dx, dy, stageSize, CARD_LIMITS, CARD_BAR_RESERVE));
      },
      onEnd: () => {
        cardStart.current = null;
      },
    },
    { exempt: false },
  );

  const foldingCards = useRef(new Set<CubeFaceId>());
  const foldCard = (face: CubeFaceId) => {
    if (foldingCards.current.has(face)) return;
    const el = faceEls.current[face];
    const btn = barButtons.current[face];
    const root = rootRef.current;
    const hadFocus = !!el && el.contains(document.activeElement);
    const commit = () => {
      foldingCards.current.delete(face);
      setCards((prev) => (prev.folded.includes(face) ? prev : { ...prev, folded: [...prev.folded, face] }));
      if (hadFocus) requestAnimationFrame(() => barButtons.current[face]?.focus());
      if (activeFace === face) {
        const open = cardsRef.current.order.filter((f) => f !== face && !cardsRef.current.folded.includes(f));
        const top = open.at(-1);
        if (top) onActiveFaceChange(top);
      }
    };
    if (!canAnimate(el) || !btn || !root) return commit();
    foldingCards.current.add(face);
    const b = btn.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const from = cardRect(face);
    const to = { x: b.left - r.left, y: b.top - r.top, width: b.width, height: b.height };
    const anim = reduced
      ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: "forwards" })
      : el.animate(
          [
            { transform: "none", opacity: 1, transformOrigin: "0 0" },
            {
              transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width}, ${to.height / from.height})`,
              opacity: 0,
              transformOrigin: "0 0",
            },
          ],
          { duration: 260, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
        );
    anim.finished.then(
      () => {
        commit();
        // Låt React dölja kortet innan fyllnaden släpps (inget blink).
        requestAnimationFrame(() => anim.cancel());
      },
      () => commit(),
    );
  };
  const toggleCard = (face: CubeFaceId) => {
    if (cards.folded.includes(face)) {
      setCards((prev) => ({ ...prev, folded: prev.folded.filter((f) => f !== face), order: raise(prev.order, face) }));
      if (face !== activeFace) onActiveFaceChange(face);
    } else {
      foldCard(face);
    }
  };

  // Kortläge: en extern aktivering lyfter kortet överst.
  useEffect(() => {
    if (layoutMode !== "cards") return;
    setCards((prev) => (prev.order.at(-1) === activeFace ? prev : { ...prev, order: raise(prev.order, activeFace) }));
  }, [activeFace, layoutMode, setCards]);

  // ---- Dockan (tablist) ----------------------------------------------------
  const tabRefs = useRef<Partial<Record<CubeFaceId, HTMLButtonElement | null>>>({});
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, face: CubeFaceId) => {
    const i = CUBE_FACE_IDS.indexOf(face);
    let next: CubeFaceId | null = null;
    if (event.key === "ArrowRight") next = CUBE_FACE_IDS[(i + 1) % 6];
    else if (event.key === "ArrowLeft") next = CUBE_FACE_IDS[(i + 5) % 6];
    else if (event.key === "Home") next = CUBE_FACE_IDS[0];
    else if (event.key === "End") next = CUBE_FACE_IDS[5];
    if (!next) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    onActiveFaceChange(next);
  };

  // ---- Rendering -----------------------------------------------------------
  const ready = stage !== null;
  const turning = motion.length > 0;
  const isOpen = (face: CubeFaceId) => {
    if (layoutMode === "cards") return !cards.folded.includes(face) || foldPhase === "unfolding";
    if (foldPhase) return true;
    return face === displayed || motion.includes(face);
  };
  const isInteractive = (face: CubeFaceId) => {
    if (!isOpen(face) || foldPhase) return false;
    if (layoutMode === "cards") return true;
    return face === displayed && !turning;
  };
  const zFor = (face: CubeFaceId) => {
    if (layoutMode === "cards") return 10 + Math.max(0, cards.order.indexOf(face));
    if (face === displayed) return 3;
    return motion.includes(face) ? 2 : 1;
  };

  const hiddenClass: Record<HiddenFaceStrategy, string> = {
    "content-visibility": "invisible [content-visibility:hidden]",
    visibility: "invisible",
    display: "hidden",
  };

  const neighbours = useMemo(() => {
    const dirs: CubeDirection[] = ["up", "right", "down", "left"];
    return Object.fromEntries(dirs.map((d) => [d, neighborOf(settled, d)])) as Record<CubeDirection, CubeFaceId>;
  }, [settled]);

  const outer = frame.outer;

  const dock = (
    <div
      role="tablist"
      aria-label="Sidor"
      aria-orientation="horizontal"
      className="bg-background pointer-events-auto flex items-stretch gap-1 rounded-xl border border-border/70 p-1"
    >
      {CUBE_FACE_IDS.map((face) => {
        const spec = faces[face];
        const selected = face === activeFace;
        return (
          <button
            key={face}
            ref={(el) => {
              tabRefs.current[face] = el;
            }}
            id={tabId(face)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId(face)}
            aria-label={`${spec.label}${badgeText(spec.badge)}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onActiveFaceChange(face)}
            onKeyDown={(e) => onTabKeyDown(e, face)}
            className={cn(
              "focus-visible:ring-ring relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2",
              selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span className={cn("relative [&_svg]:size-4", selected && FACE_ACCENTS[face].text)} aria-hidden="true">
              {spec.icon}
              <Badge badge={spec.badge} />
            </span>
            <span className="max-w-full truncate">{spec.label}</span>
          </button>
        );
      })}
    </div>
  );

  const bevel = (dir: CubeDirection) => {
    const face = neighbours[dir];
    const spec = faces[face];
    const s = CUBE_BEVEL;
    const body = frame.body;
    const geom: Record<CubeDirection, { rect: Rect; clip: string }> = {
      up: {
        rect: { x: body.x - s, y: body.y - s, width: body.width + 2 * s, height: s },
        clip: `polygon(0 0, 100% 0, calc(100% - ${s}px) 100%, ${s}px 100%)`,
      },
      down: {
        rect: { x: body.x - s, y: body.y + body.height, width: body.width + 2 * s, height: s },
        clip: `polygon(${s}px 0, calc(100% - ${s}px) 0, 100% 100%, 0 100%)`,
      },
      left: {
        rect: { x: body.x - s, y: body.y - s, width: s, height: body.height + 2 * s },
        clip: `polygon(0 0, 100% ${s}px, 100% calc(100% - ${s}px), 0 100%)`,
      },
      right: {
        rect: { x: body.x + body.width, y: body.y - s, width: s, height: body.height + 2 * s },
        clip: `polygon(0 ${s}px, 100% 0, 100% 100%, 0 calc(100% - ${s}px))`,
      },
    };
    const g = geom[dir];
    const local = { ...g.rect, x: g.rect.x - outer.x, y: g.rect.y - outer.y };
    const shading: Record<CubeDirection, string> = {
      up: "bg-gradient-to-b from-white/[0.10] to-white/[0.03]",
      left: "bg-gradient-to-r from-white/[0.07] to-white/[0.02]",
      right: "bg-gradient-to-l from-black/50 to-black/15",
      down: "bg-gradient-to-t from-black/55 to-black/15",
    };
    const dirLabel: Record<CubeDirection, string> = { up: "uppåt", down: "nedåt", left: "åt vänster", right: "åt höger" };
    return (
      <button
        key={dir}
        type="button"
        tabIndex={-1}
        data-cube-bevel={dir}
        title={`${spec.label} (vrid ${dirLabel[dir]})`}
        aria-label={`Vrid ${dirLabel[dir]} till ${spec.label}`}
        onClick={() => onActiveFaceChange(face)}
        style={{ ...rectStyle(local), clipPath: g.clip }}
        className={cn(
          "group pointer-events-auto absolute flex items-center justify-center border-0 bg-muted/40 p-0 transition-colors hover:bg-muted/80",
        )}
      >
        <span className={cn("absolute inset-0", shading[dir])} aria-hidden="true" />
        <span
          className={cn(
            "relative opacity-70 transition-opacity group-hover:opacity-100 [&_svg]:size-3",
            FACE_ACCENTS[face].text,
          )}
          aria-hidden="true"
        >
          {spec.icon}
        </span>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className={cn("pointer-events-none absolute inset-0", !ready && "invisible", className)}
      data-cube-mode={layoutMode}
      data-cube-geometry={geometry}
      aria-label={label}
      role="region"
    >
      {/* Ram: huvud, fasade kanter, docka. Bara i kub- och flikläge. */}
      {layoutMode !== "cards" && foldPhase !== "unfolding" ? (
        <div
          ref={chromeRef}
          className="pointer-events-none absolute"
          style={rectStyle(outer)}
          data-cube-chrome=""
        >
          {layoutMode === "cube" ? (
            <>
              <div
                {...cubeDrag}
                data-cube-header=""
                className="from-muted to-background pointer-events-auto absolute inset-x-0 top-0 flex cursor-grab touch-none items-center gap-2 rounded-t-xl border border-b-0 border-border bg-linear-to-b px-2 select-none active:cursor-grabbing"
                style={{ height: CUBE_HEAD }}
              >
                <button
                  type="button"
                  data-cube-grip=""
                  aria-label="Flytta panelen. Piltangenter flyttar 10 px, med Skift 40 px."
                  onKeyDown={nudgeHandler(moveCubeBy)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2"
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </button>
                <span className={cn("[&_svg]:size-4", FACE_ACCENTS[activeFace].text)} aria-hidden="true">
                  {faces[activeFace].icon}
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
                  {faces[activeFace].label}
                </span>
                {onResetLayout ? (
                  <button
                    type="button"
                    onClick={onResetLayout}
                    aria-label="Återställ layout"
                    title="Återställ layout"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 outline-none focus-visible:ring-2"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                {onExit ? (
                  <button
                    type="button"
                    onClick={onExit}
                    aria-label="Öppna chatten som sidopanel"
                    title="Öppna chatten som sidopanel"
                    className="border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20 focus-visible:ring-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"
                  >
                    <PanelLeft className="size-3.5" aria-hidden="true" />
                  Sidopanel
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onModeChange("cards")}
                  aria-label="Fäll ut till kort"
                  title="Fäll ut till kort"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 outline-none focus-visible:ring-2"
                >
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <div
                className="from-background to-muted/80 pointer-events-none absolute inset-x-0 rounded-b-xl border border-t-0 border-border bg-linear-to-b shadow-[0_22px_56px_-24px_rgba(0,0,0,0.65)]"
                style={{ top: CUBE_HEAD, bottom: 0 }}
                aria-hidden="true"
              />
              {(["up", "right", "down", "left"] as CubeDirection[]).map(bevel)}
              <div className="absolute inset-x-1.5 bottom-1.5" style={{ height: CUBE_DOCK - 8 }}>
                {dock}
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-auto absolute top-6 -right-1 bottom-6 w-2 cursor-ew-resize touch-none"
                onPointerDown={startCubeResize("e")}
                onPointerMove={cubeResize.onPointerMove}
                onPointerUp={cubeResize.onPointerUp}
                onPointerCancel={cubeResize.onPointerCancel}
                data-cube-resize="e"
              />
              <div
                aria-hidden="true"
                className="pointer-events-auto absolute right-6 -bottom-1 left-6 h-2 cursor-ns-resize touch-none"
                onPointerDown={startCubeResize("s")}
                onPointerMove={cubeResize.onPointerMove}
                onPointerUp={cubeResize.onPointerUp}
                onPointerCancel={cubeResize.onPointerCancel}
                data-cube-resize="s"
              />
              <div
                aria-hidden="true"
                className="pointer-events-auto absolute -right-1 -bottom-1 size-5 cursor-nwse-resize touch-none after:absolute after:top-1 after:left-1 after:size-2 after:rounded-br-sm after:border-r-2 after:border-b-2 after:border-muted-foreground/60"
                onPointerDown={startCubeResize("se")}
                onPointerMove={cubeResize.onPointerMove}
                onPointerUp={cubeResize.onPointerUp}
                onPointerCancel={cubeResize.onPointerCancel}
                data-cube-resize="se"
              />
            </>
          ) : (
            <>
              <div className="pointer-events-none absolute inset-0 border-t border-border/70 bg-background" aria-hidden="true" />
              <div className="absolute inset-x-1 top-1" style={{ height: CUBE_DOCK - 8 }}>
                {dock}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Sidlagret: sex syskon som aldrig byter förälder. */}
      <div ref={layerRef} className="pointer-events-none absolute inset-0" data-cube-layer="">
        {CUBE_FACE_IDS.map((face) => {
          const spec = faces[face];
          const open = isOpen(face);
          const interactive = isInteractive(face);
          const rect = rectFor(face);
          const asCard = layoutMode === "cards";
          const accent = FACE_ACCENTS[face];
          return (
            <div
              key={face}
              ref={(el) => {
                faceEls.current[face] = el;
              }}
              id={panelId(face)}
              data-cube-face={face}
              data-state={interactive ? "active" : open ? "moving" : "hidden"}
              role={asCard ? "region" : "tabpanel"}
              aria-labelledby={asCard ? titleId(face) : tabId(face)}
              aria-hidden={interactive ? undefined : true}
              inert={!interactive}
              tabIndex={-1}
              style={{ ...rectStyle(rect), zIndex: zFor(face) }}
              className={cn(
                "bg-background text-foreground absolute flex flex-col overflow-hidden rounded-xl border border-border outline-none",
                "shadow-[0_18px_50px_-24px_rgba(0,0,0,0.75)] focus-within:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
                open ? "pointer-events-auto" : hiddenClass[hiddenStrategy],
                asCard && cn("border-t-2", accent.edge),
                layoutMode === "tabs" && "rounded-none border-x-0 border-b-0",
              )}
            >
              {asCard ? (
                <CardHeader
                  key="head"
                  face={face}
                  spec={spec}
                  titleId={titleId(face)}
                  drag={cardDrag}
                  onGrabFace={() => {
                    cardDragFace.current = face;
                  }}
                  onNudge={(dx, dy) => {
                    const r = cardRect(face);
                    setCardRect(face, { ...r, ...clampPoint({ x: r.x + dx, y: r.y + dy }, stageSize, r, STAGE_MARGIN, CARD_BAR_RESERVE) });
                  }}
                  onShrink={() => setCardRect(face, scaleCard(cardRect(face), CARD_SHRINK, stageSize))}
                  onGrow={() => setCardRect(face, scaleCard(cardRect(face), CARD_GROW, stageSize))}
                  onFold={() => foldCard(face)}
                />
              ) : null}
              <div key="content" className="relative min-h-0 flex-1" data-cube-content={face}>
                {spec.content}
              </div>
              <div
                key="shade"
                ref={(el) => {
                  shadeEls.current[face] = el;
                }}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-black opacity-0"
              />
              {asCard ? (
                <div key="resize">
                  {(["e", "s", "se"] as ResizeEdge[]).map((edge) => (
                    <div
                      key={edge}
                      aria-hidden="true"
                      data-card-resize={edge}
                      onPointerDown={(e) => {
                        cardDragFace.current = face;
                        cardEdge.current = edge;
                        cardResize.onPointerDown(e);
                      }}
                      onPointerMove={cardResize.onPointerMove}
                      onPointerUp={cardResize.onPointerUp}
                      onPointerCancel={cardResize.onPointerCancel}
                      className={cn(
                        "absolute touch-none",
                        edge === "e" && "top-10 right-0 bottom-4 w-1.5 cursor-ew-resize",
                        edge === "s" && "right-4 bottom-0 left-4 h-1.5 cursor-ns-resize",
                        edge === "se" && "right-0 bottom-0 size-4 cursor-nwse-resize",
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Kortfältet: utfällda/nedfällda kort och vägen tillbaka till kuben. */}
      {layoutMode === "cards" ? (
        <div
          role="toolbar"
          aria-label="Kort"
          className="bg-background pointer-events-auto absolute bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border/70 p-1 shadow-[0_8px_30px_-18px_rgba(0,0,0,0.6)]"
        >
          {CUBE_FACE_IDS.map((face) => {
            const spec = faces[face];
            const expanded = !cards.folded.includes(face);
            return (
              <button
                key={face}
                ref={(el) => {
                  barButtons.current[face] = el;
                }}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId(face)}
                aria-label={`${spec.label}${badgeText(spec.badge)}`}
                title={expanded ? `Fäll ned ${spec.label}` : `Öppna ${spec.label}`}
                onClick={() => toggleCard(face)}
                className={cn(
                  "focus-visible:ring-ring relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs outline-none focus-visible:ring-2",
                  expanded ? "text-foreground hover:bg-muted/60" : "text-muted-foreground bg-muted/40 hover:bg-muted/70",
                )}
              >
                <span className={cn("relative [&_svg]:size-3.5", expanded && FACE_ACCENTS[face].text)} aria-hidden="true">
                  {spec.icon}
                  <Badge badge={spec.badge} />
                </span>
                <span className="hidden md:inline">{spec.label}</span>
              </button>
            );
          })}
          <span className="bg-border mx-1 h-5 w-px" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onModeChange("cube")}
            aria-label="Samla till kub"
            title="Samla till kub"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-lg p-1.5 outline-none focus-visible:ring-2"
          >
            <Box className="size-4" aria-hidden="true" />
          </button>
          {onResetLayout ? (
            <button
              type="button"
              onClick={onResetLayout}
              aria-label="Återställ layout"
              title="Återställ layout"
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-lg p-1.5 outline-none focus-visible:ring-2"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              aria-label="Öppna chatten som sidopanel"
              title="Öppna chatten som sidopanel"
              className="border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20 focus-visible:ring-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"
            >
              <PanelLeft className="size-3.5" aria-hidden="true" />
                  Sidopanel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface CardHeaderProps {
  face: CubeFaceId;
  spec: CubeFaceSpec;
  titleId: string;
  drag: ReturnType<typeof usePointerDrag>;
  onGrabFace: () => void;
  onNudge: (dx: number, dy: number) => void;
  onShrink: () => void;
  onGrow: () => void;
  onFold: () => void;
}

function CardHeader({ face, spec, titleId, drag, onGrabFace, onNudge, onShrink, onGrow, onFold }: CardHeaderProps) {
  const btn =
    "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2";
  return (
    <div
      {...drag}
      onPointerDown={(e) => {
        onGrabFace();
        drag.onPointerDown(e);
      }}
      data-card-header={face}
      className="flex shrink-0 cursor-grab touch-none items-center gap-1.5 border-b border-border/60 px-1.5 select-none active:cursor-grabbing"
      style={{ height: CARD_HEAD }}
    >
      <button
        type="button"
        data-cube-grip=""
        aria-label={`Flytta ${spec.label}. Piltangenter flyttar 10 px, med Skift 40 px.`}
        onKeyDown={nudgeHandler(onNudge)}
        className={btn}
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </button>
      <span className={cn("relative [&_svg]:size-4", FACE_ACCENTS[face].text)} aria-hidden="true">
        {spec.icon}
        <Badge badge={spec.badge} />
      </span>
      <h2 id={titleId} className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
        {spec.label}
      </h2>
      <button type="button" onClick={onShrink} aria-label={`Mindre ${spec.label}`} title="Mindre" className={btn}>
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onGrow} aria-label={`Större ${spec.label}`} title="Större" className={btn}>
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onFold} aria-label={`Fäll ned ${spec.label} till fältet`} title="Fäll ned" className={btn}>
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
