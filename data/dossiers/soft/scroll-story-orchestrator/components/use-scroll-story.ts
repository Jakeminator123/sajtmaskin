"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  useMotionValueEvent,
  useScroll,
  type MotionValue,
} from "framer-motion";

const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function stepIndexFromProgress(
  progress: number,
  stepCount: number,
): number {
  if (!Number.isFinite(progress) || stepCount <= 0) return 0;
  const raw = Math.floor(progress * stepCount);
  return Math.min(Math.max(raw, 0), stepCount - 1);
}

export function useScrollStory({
  containerRef,
  stepCount,
}: {
  containerRef: RefObject<HTMLElement | null>;
  stepCount: number;
}): {
  progress: MotionValue<number>;
  activeIndex: number;
  mode: "sticky" | "linear";
  reducedMotion: boolean;
} {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [activeIndex, setActiveIndex] = useState(0);
  // Linear until after mount so SSR HTML matches the first client paint.
  const [mode, setMode] = useState<"sticky" | "linear">("linear");
  const [reducedMotion, setReducedMotion] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = stepIndexFromProgress(value, stepCount);
    setActiveIndex((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    // No matchMedia (very old browsers, some test runners): stay linear.
    if (typeof window.matchMedia !== "function") return;

    const desktopMq = window.matchMedia(DESKTOP_QUERY);
    const reduceMq = window.matchMedia(REDUCED_MOTION_QUERY);

    const sync = () => {
      const reduce = reduceMq.matches;
      setReducedMotion(reduce);
      setMode(desktopMq.matches && !reduce ? "sticky" : "linear");
    };

    sync();
    desktopMq.addEventListener("change", sync);
    reduceMq.addEventListener("change", sync);
    return () => {
      desktopMq.removeEventListener("change", sync);
      reduceMq.removeEventListener("change", sync);
    };
  }, []);

  return {
    progress: scrollYProgress,
    activeIndex,
    mode,
    reducedMotion,
  };
}
