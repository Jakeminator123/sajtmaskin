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
  /** `welcome` ger ett bredare, rullbart kort med plats för byggvalen. */
  variant?: "status" | "welcome";
  children: ReactNode;
}

/**
 * Previewrektangelns dekorations- och statuslager: Moving Background 2 bakom
 * ett fönsterliknande kort med produktens verkliga texter, frågor och knappar.
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

  return (
    <div className="relative isolate flex h-full flex-col items-center justify-center overflow-hidden px-6 py-8">
      <PreviewBackdrop motion={motion} />
      {/*
        Opakt kort, ingen heltäckande dimma över scenen. `--muted-foreground`
        mot #211b38 ger 5.6:1 och klarar AA; en genomskinlig kortbakgrund gör
        kontrasten beroende av vilken videoruta som råkar ligga bakom.
      */}
      <div
        className={cn(
          "relative z-10 flex max-h-full w-full flex-col overflow-y-auto rounded-2xl border border-violet-300/30 bg-[#211b38] pb-6 text-center shadow-[0_15px_50px_rgba(43,16,51,0.4)]",
          variant === "welcome" ? "max-w-lg" : "max-w-md",
        )}
      >
        <div
          aria-hidden="true"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-t-2xl border-b border-violet-300/15 bg-violet-400/10 px-3.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-violet-300/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-violet-300/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-violet-300/40" />
          <span className="ml-auto text-[8px] tracking-[0.13em] text-violet-200/80">
            FÖRHANDSVISNING
          </span>
        </div>
        <div
          ref={contentRef}
          className="text-muted-foreground flex flex-col items-center px-6 pt-6 text-center"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
