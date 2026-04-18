"use client";

import { cn } from "@/lib/utils";

/**
 * Animated mascot — looped, muted, transparent WebM (VP9 alpha).
 *
 * The mascot video lives at `/mascot/SM_video.webm` with a real alpha
 * channel so it composites cleanly over any background. A PNG poster
 * (master.png) is used as a fallback while the video loads or if the
 * browser can't decode VP9 alpha.
 *
 * Callers control the size via `className` (e.g. `h-auto w-[220px]`).
 * The component is decorative by default; pass `aria-label` if you need
 * it announced.
 */
interface MascotVideoProps {
  className?: string;
  /** When set, the video becomes non-decorative and announces this label. */
  "aria-label"?: string;
  /** Force decorative behaviour (default). */
  "aria-hidden"?: boolean;
}

export function MascotVideo({
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden = true,
}: MascotVideoProps) {
  return (
    <video
      className={cn("pointer-events-none select-none", className)}
      src="/mascot/SM_video.webm"
      poster="/mascot/master.png"
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaLabel}
    />
  );
}
