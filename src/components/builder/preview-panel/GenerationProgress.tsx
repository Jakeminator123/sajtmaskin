"use client";

import { useEffect, useRef, useState } from "react";
import { MascotVideo } from "@/components/mascot/MascotVideo";
import { cn } from "@/lib/utils";

export type GenerationPhase =
  | "brief"
  | "scaffold"
  | "generation"
  | "autofix"
  | "verifier"
  | "validate_syntax"
  | "parse_merge_preflight"
  | "preview"
  | "done"
  | null;

// Apple-minimal progress: a single 0-100% journey. Every phase nudges the
// target up; we never exceed 95 until the iframe confirms `preview-ready`
// (phase === "done"), at which point we snap cleanly to 100.
const PHASE_TARGETS: Record<NonNullable<GenerationPhase>, { target: number; label: string }> = {
  brief:                 { target: 8,  label: "Planerar sidor" },
  scaffold:              { target: 18, label: "Väljer layout" },
  generation:            { target: 48, label: "Bygger layout" },
  autofix:               { target: 68, label: "Polerar detaljer" },
  verifier:              { target: 78, label: "Kvalitetskoll" },
  validate_syntax:       { target: 84, label: "Validerar syntax" },
  parse_merge_preflight: { target: 90, label: "Förbereder filer" },
  preview:               { target: 95, label: "Laddar preview" },
  done:                  { target: 100, label: "Klar" },
};

const TICK_MS = 50;
// Ease-out smoothing: bigger steps when far, gentle when close.
const SMOOTH_FACTOR = 0.06;

interface GenerationProgressProps {
  phase?: GenerationPhase;
  /** Optional override — used when preview-ready signals completion. */
  forceComplete?: boolean;
  className?: string;
}

export function GenerationProgress({ phase, forceComplete, className }: GenerationProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const phaseTarget = phase ? PHASE_TARGETS[phase]?.target ?? 0 : 3;
    const effective = forceComplete ? 100 : phaseTarget;
    targetRef.current = Math.max(targetRef.current, effective);
  }, [phase, forceComplete]);

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;

      const target = targetRef.current;
      const current = currentRef.current;
      const diff = target - current;

      if (Math.abs(diff) < 0.1) {
        currentRef.current = target;
      } else {
        currentRef.current = current + diff * SMOOTH_FACTOR;
      }

      setDisplayProgress(currentRef.current);
      rafRef.current = window.setTimeout(() => {
        if (running) animate();
      }, TICK_MS);
    };

    animate();
    return () => {
      running = false;
      if (rafRef.current !== null) clearTimeout(rafRef.current);
    };
  }, []);

  const pct = Math.round(displayProgress);
  const isIdle = !forceComplete && !phase;
  const resolvedPhase: NonNullable<GenerationPhase> = forceComplete ? "done" : (phase ?? "brief");
  const label = isIdle ? "Redo att bygga" : PHASE_TARGETS[resolvedPhase]?.label ?? "Skapar din sajt";

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center bg-background px-8 py-12",
        className,
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <MascotVideo
          className="h-auto w-[clamp(180px,22vw,260px)] drop-shadow-[0_18px_30px_rgba(10,12,24,0.15)]"
          aria-hidden
        />

        <div className="text-6xl font-semibold tracking-tight text-foreground tabular-nums transition-opacity duration-300 sm:text-7xl">
          {pct}
          <span className="ml-1 text-xl font-medium text-muted-foreground align-top">%</span>
        </div>

        <div
          className="h-[2px] w-full overflow-hidden rounded-full bg-border/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-foreground/90 transition-[width] duration-500 ease-out"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        <p
          key={label}
          className="text-sm font-medium text-muted-foreground motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-300"
        >
          {label}
        </p>
      </div>
    </div>
  );
}
