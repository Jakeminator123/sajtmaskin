"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/components/landing-v2/landing-hooks";
import { cn } from "@/lib/utils";
import { PreviewBackdrop } from "./PreviewBackdrop";

/** 16 px glid + intoning, samma kurva och längd som designprovet. */
const STATUS_ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translateY(16px) scale(0.99)" },
  { opacity: 1, transform: "translateY(0) scale(1)" },
];
const STATUS_ENTER_MS = 380;

export interface PreviewBackdropStageProps {
  /** Vidarebefordras till {@link PreviewBackdrop}: rörlig scen eller stillbild. */
  motion: boolean;
  /**
   * Byter värde när presentationen byter tillstånd. Bara ett byte animeras —
   * ingen kontinuerlig rörelse i texten, och ingen animation på första ritningen.
   */
  statusKey: string;
  /** `welcome` lägger byggförvalen vid ytans vänsterkant. */
  variant?: "status" | "welcome";
  children: ReactNode;
}

/**
 * Previewrektangelns dekorations- och statuslager: Moving Background 2 bakom
 * en kompakt yta för produktens verkliga texter, frågor och knappar.
 *
 * Bakgrunden hör bara till den här rektangeln — den följer aldrig med i
 * exporterade eller genererade användarsajter, och den ritas bara i lägen där
 * previewytan ändå saknar en användbar sajt att visa.
 */
export function PreviewBackdropStage({
  motion,
  statusKey,
  variant = "status",
  children,
}: PreviewBackdropStageProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastStatusKey = useRef<string | null>(null);

  // Web Animations i stället för `key`-remount: kortets innehåll behåller sina
  // DOM-noder, så fokus på en riktig knapp inte tappas vid ett statusbyte.
  useEffect(() => {
    const node = contentRef.current;
    const previous = lastStatusKey.current;
    lastStatusKey.current = statusKey;
    if (!node || previous === null || previous === statusKey) return;
    if (prefersReducedMotion || typeof node.animate !== "function") return;
    for (const animation of node.getAnimations()) animation.cancel();
    node.animate(STATUS_ENTER_KEYFRAMES, {
      duration: STATUS_ENTER_MS,
      easing: "cubic-bezier(.16,1,.3,1)",
    });
  }, [statusKey, prefersReducedMotion]);

  // `pb-16` reserverar nederkanten åt `PreviewBackdrop`s egen kontroll. Kortets
  // `max-h-full` mäts mot content-boxen, så kortet kan aldrig växa ner under
  // kontrollen — även när previewpanelen är låg.
  return (
    <div
      className={cn(
        "relative isolate flex h-full flex-col overflow-hidden px-3 pt-4 pb-16 sm:px-6",
        variant === "welcome" ? "items-start justify-start" : "items-center justify-center",
      )}
    >
      <PreviewBackdrop motion={motion} />
      {/* Opak kortyta håller text och kontroller läsbara över scenen. */}
      <div
        className="bg-card border-border/70 relative z-10 flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-xl border p-4 shadow-lg"
      >
        <div
          ref={contentRef}
          className={cn(
            "text-muted-foreground flex flex-col",
            variant === "welcome" ? "items-stretch text-left" : "items-center text-center",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
