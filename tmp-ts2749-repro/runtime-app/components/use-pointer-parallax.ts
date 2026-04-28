"use client";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import React from "react";
import { useEffect, useRef } from "react";



type PointerPosition = {
  x: number;
  y: number;
};

export function usePointerParallax(
  targetRef: React.RefObject<HTMLElement | null>,
) {
  const reducedMotion = useReducedMotion();
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) {
      pointerRef.current = { x: 0, y: 0 };
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const target = targetRef.current;

      if (!target) {
        pointerRef.current = { x: 0, y: 0 };
        return;
      }

      const rect = target.getBoundingClientRect();

      if (
        rect.width === 0 ||
        rect.height === 0 ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        pointerRef.current = { x: 0, y: 0 };
        return;
      }

      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;

      pointerRef.current = {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      };
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [reducedMotion, targetRef]);

  return pointerRef;
}