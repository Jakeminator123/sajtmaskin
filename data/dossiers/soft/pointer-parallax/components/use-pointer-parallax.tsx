"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";

export type PointerPosition = { x: number; y: number };

/**
 * Listen to pointermove on window and write pointer position normalized to
 * [-1, 1] across the targetRef's bounding box.
 *
 * Returns a MutableRefObject so consumers can read inside useFrame (R3F) or
 * a vanilla requestAnimationFrame loop without triggering React re-renders.
 *
 * Frozen at { x: 0, y: 0 } when prefers-reduced-motion: reduce.
 */
export function usePointerParallax(
  targetRef: RefObject<HTMLElement | null>,
): MutableRefObject<PointerPosition> {
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceQuery.matches;
    const onReduceChange = () => {
      reduced = reduceQuery.matches;
      if (reduced) {
        pointerRef.current.x = 0;
        pointerRef.current.y = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced) return;
      const rect = targetRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const relativeX = (event.clientX - rect.left) / rect.width;
      const relativeY = (event.clientY - rect.top) / rect.height;
      pointerRef.current.x = clamp((relativeX - 0.5) * 2, -1, 1);
      pointerRef.current.y = clamp((0.5 - relativeY) * 2, -1, 1);
    };

    reduceQuery.addEventListener("change", onReduceChange);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      reduceQuery.removeEventListener("change", onReduceChange);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [targetRef]);

  return pointerRef;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
