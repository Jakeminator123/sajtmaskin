"use client";

import { useReducedMotion } from "../hooks/use-reduced-motion";
import type { ReactNode, RefObject } from "react";
import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { usePointerParallax } from "./use-pointer-parallax";

type PointerParallaxLayerProps = {
  targetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  intensity?: number;
  rotateIntensity?: number;
  damping?: number;
  className?: string;
};

export function PointerParallaxLayer({
  targetRef,
  children,
  intensity = 8,
  rotateIntensity = 0,
  damping = 0.12,
  className,
}: PointerParallaxLayerProps) {
  const reducedMotion = useReducedMotion();
  const pointerRef = usePointerParallax(targetRef);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);

  const springX = useSpring(rawX, { stiffness: 120, damping: 20 / damping });
  const springY = useSpring(rawY, { stiffness: 120, damping: 20 / damping });
  const springRotateX = useSpring(rawRotateX, {
    stiffness: 120,
    damping: 20 / damping,
  });
  const springRotateY = useSpring(rawRotateY, {
    stiffness: 120,
    damping: 20 / damping,
  });

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const pointer = pointerRef.current;

      rawX.set(pointer.x * intensity);
      rawY.set(pointer.y * intensity);
      rawRotateX.set(pointer.y * rotateIntensity * -1);
      rawRotateY.set(pointer.x * rotateIntensity);

      frame = window.requestAnimationFrame(update);
    };

    if (reducedMotion) {
      rawX.set(0);
      rawY.set(0);
      rawRotateX.set(0);
      rawRotateY.set(0);
      return;
    }

    frame = window.requestAnimationFrame(update);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    intensity,
    pointerRef,
    rawRotateX,
    rawRotateY,
    rawX,
    rawY,
    reducedMotion,
    rotateIntensity,
  ]);

  return (
    <motion.div
      className={className}
      style={{
        x: springX,
        y: springY,
        rotateX: springRotateX,
        rotateY: springRotateY,
      }}
    >
      {children}
    </motion.div>
  );
}

export default PointerParallaxLayer;