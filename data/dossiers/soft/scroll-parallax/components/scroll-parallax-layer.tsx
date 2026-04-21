"use client";

import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

type Range = [number, number];

export interface ScrollParallaxLayerProps {
  targetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Translation in viewport-height percent. Default [-8, 8]. */
  translateYRange?: Range;
  /** Optional opacity mapping over the same scroll progress. */
  opacityRange?: Range;
  /** Optional scale mapping. */
  scaleRange?: Range;
  /** `useScroll`'s offset prop. */
  offset?: [string, string];
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_TRANSLATE_RANGE: Range = [-8, 8];
const DEFAULT_OFFSET: [string, string] = ["start end", "end start"];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * Single-layer scroll-driven parallax wrapper.
 *
 * Owns three production-required concerns:
 *  1. prefers-reduced-motion bypass that keeps the layer visible at its
 *     visual end-state (never hidden).
 *  2. viewport-unit translateY defaults so the effect scales across
 *     breakpoints rather than being pixel-pinned.
 *  3. shared `useScroll` per `targetRef` so multiple sibling layers in the
 *     same section reuse one scroll calculation.
 */
export function ScrollParallaxLayer({
  targetRef,
  children,
  translateYRange = DEFAULT_TRANSLATE_RANGE,
  opacityRange,
  scaleRange,
  offset = DEFAULT_OFFSET,
  className,
  style,
}: ScrollParallaxLayerProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: offset as Parameters<typeof useScroll>[0]["offset"],
  });

  const translateY = useTransform(
    scrollYProgress,
    [0, 1],
    [`${translateYRange[0]}vh`, `${translateYRange[1]}vh`],
  );
  const opacity = useTransform(scrollYProgress, [0, 1], opacityRange ?? [1, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleRange ?? [1, 1]);

  if (reducedMotion) {
    const endOpacity = opacityRange ? Math.max(...opacityRange) : 1;
    return (
      <div className={className} style={{ ...style, opacity: endOpacity }}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={{
        ...style,
        translateY,
        opacity: opacityRange ? opacity : undefined,
        scale: scaleRange ? scale : undefined,
        willChange: "transform",
      }}
    >
      {children}
    </motion.div>
  );
}
