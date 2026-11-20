"use client";

import { useCallback, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

/** Element i ett handtag som aldrig ska starta en dragning. */
export const DRAG_EXEMPT_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "a[href]",
  "iframe",
  "video[controls]",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='slider']",
  "[role='switch']",
  "[role='tab']",
  "[data-no-drag]",
].join(",");

/** Pixlar innan en tryckning räknas som dragning (klick ska förbli klick). */
export const DRAG_THRESHOLD_PX = 3;
export const KEY_STEP_PX = 10;
export const KEY_STEP_LARGE_PX = 40;

/**
 * Sant om tryckningen träffade något interaktivt inne i handtaget. Greppet
 * (`data-cube-grip`) är en knapp men får alltid dra.
 */
export function isDragExempt(target: EventTarget | null, handle: Element): boolean {
  if (!(target instanceof Element)) return true;
  const grip = target.closest("[data-cube-grip]");
  if (grip && handle.contains(grip)) return false;
  const hit = target.closest(DRAG_EXEMPT_SELECTOR);
  return Boolean(hit && hit !== handle && handle.contains(hit));
}

/** Piltangent → förflyttning; null för andra tangenter. */
export function keyboardNudge(event: Pick<KeyboardEvent, "key" | "shiftKey">): { dx: number; dy: number } | null {
  const step = event.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX;
  switch (event.key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

export interface DragCallbacks {
  /** Returnera false för att avbryta (t.ex. smal skärm). */
  onStart?: () => boolean | void;
  onMove: (dx: number, dy: number, velocity: { x: number; y: number }) => void;
  onEnd?: (moved: boolean) => void;
}

/**
 * Pekar-capture på ett handtag. Rörelser slås ihop per animationsruta så att
 * förälderns state uppdateras högst en gång per frame.
 */
export function usePointerDrag({ onStart, onMove, onEnd }: DragCallbacks, options: { exempt?: boolean } = {}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
    moved: boolean;
    frame: number | null;
  } | null>(null);
  const callbacks = useRef({ onStart, onMove, onEnd });
  useLayoutEffect(() => {
    callbacks.current = { onStart, onMove, onEnd };
  });
  const useExempt = options.exempt !== false;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || drag.current) return;
      if (useExempt && isDragExempt(event.target, event.currentTarget)) return;
      if (callbacks.current.onStart?.() === false) return;
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastT: event.timeStamp,
        vx: 0,
        vy: 0,
        moved: false,
        frame: null,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // jsdom/äldre webbläsare: dragningen fungerar ändå medan pekaren är över handtaget.
      }
    },
    [useExempt],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dt = Math.max(1, event.timeStamp - d.lastT);
    // Utjämnad hastighet (px/ms) för lutningen.
    d.vx = d.vx * 0.6 + ((event.clientX - d.lastX) / dt) * 0.4;
    d.vy = d.vy * 0.6 + ((event.clientY - d.lastY) / dt) * 0.4;
    d.lastX = event.clientX;
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      // Ingen textmarkering medan man drar.
      window.getSelection?.()?.removeAllRanges();
    }
    if (d.frame !== null) return;
    d.frame = requestAnimationFrame(() => {
      const cur = drag.current;
      if (!cur) return;
      cur.frame = null;
      callbacks.current.onMove(cur.lastX - cur.startX, cur.lastY - cur.startY, { x: cur.vx, y: cur.vy });
    });
  }, []);

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.frame !== null) cancelAnimationFrame(d.frame);
    if (d.moved) callbacks.current.onMove(d.lastX - d.startX, d.lastY - d.startY, { x: 0, y: 0 });
    drag.current = null;
    callbacks.current.onEnd?.(d.moved);
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
}

/** Piltangenter på ett grepp. */
export function nudgeHandler(move: (dx: number, dy: number) => void) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    const nudge = keyboardNudge(event);
    if (!nudge) return;
    event.preventDefault();
    move(nudge.dx, nudge.dy);
  };
}
