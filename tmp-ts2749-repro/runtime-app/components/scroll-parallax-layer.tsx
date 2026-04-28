"use client";

import type { ReactNode, RefObject } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "../hooks/use-reduced-motion";

type Range = [number, number];

type ScrollParallaxLayerProps = {
  targetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  translateYRange?: Range;
  opacityRange?: Range;
  scaleRange?: Range;
  offset?: ("start end" | "end start")[];
  className?: string;
};

export function ScrollParallaxLayer({
  targetRef,
  children,
  translateYRange = [-8, 8],
  opacityRange,
  scaleRange,
  offset = ["start end", "end start"],
  className,
}: ScrollParallaxLayerProps) {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset,
  });

  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [`${translateYRange[0]}vh`, `${translateYRange[1]}vh`],
  );

  const opacityInputRange: Range = opacityRange ?? [1, 1];
  const scaleInputRange: Range = scaleRange ?? [1, 1];

  const opacity = useTransform(scrollYProgress, [0, 1], opacityInputRange);
  const scale = useTransform(scrollYProgress, [0, 1], scaleInputRange);

  if (reducedMotion) {
    return (
      <div
        className={className}
        style={opacityRange ? { opacity: Math.max(...opacityRange) } : undefined}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} style={{ y, opacity, scale }}>
      {children}
    </motion.div>
  );
}

export default ScrollParallaxLayer;