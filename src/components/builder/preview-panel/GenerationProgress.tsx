"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/Mascot";
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

const PHASE_TARGETS: Record<NonNullable<GenerationPhase>, { target: number; label: string }> = {
  brief:                 { target: 10, label: "Planerar sidor" },
  scaffold:              { target: 22, label: "Väljer layout" },
  generation:            { target: 52, label: "Bygger layout" },
  autofix:               { target: 70, label: "Polerar detaljer" },
  verifier:              { target: 80, label: "Kvalitetskoll" },
  validate_syntax:       { target: 86, label: "Validerar syntax" },
  parse_merge_preflight: { target: 92, label: "Förbereder filer" },
  preview:               { target: 96, label: "Laddar preview" },
  done:                  { target: 100, label: "Klar" },
};

const TICK_MS = 50;
const SMOOTH_FACTOR = 0.08;
// Hur långt det tidsdrivna golvet kryper över tid (ease-out mot ~95 % på 45 s).
const TIME_CEILING = 95;
const TIME_CONSTANT_MS = 18_000;

interface GenerationProgressProps {
  phase?: GenerationPhase;
  forceComplete?: boolean;
  className?: string;
}

export function GenerationProgress({ phase, forceComplete, className }: GenerationProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayLabel, setDisplayLabel] = useState<string>("");
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<NonNullable<GenerationPhase> | null>(null);

  const isIdle = !forceComplete && !phase;
  const resolvedPhase: NonNullable<GenerationPhase> | null = forceComplete
    ? "done"
    : phase ?? null;

  // Start/stoppa tidsdrivet creep.
  useEffect(() => {
    if (isIdle) {
      startedAtRef.current = null;
      currentRef.current = 0;
      targetRef.current = 0;
      setDisplayProgress(0);
      setDisplayLabel("Redo att bygga");
      return;
    }
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    if (resolvedPhase) {
      lastPhaseRef.current = resolvedPhase;
      setDisplayLabel(PHASE_TARGETS[resolvedPhase].label);
    }
  }, [isIdle, resolvedPhase]);

  // Animation-loop: kombinerar tidsgolv + fas-mål, smooth toward target.
  useEffect(() => {
    if (isIdle) return;

    let running = true;
    const tick = () => {
      if (!running) return;

      let target: number;
      if (forceComplete) {
        target = 100;
      } else {
        const startedAt = startedAtRef.current ?? Date.now();
        const elapsed = Date.now() - startedAt;
        // Asymptotisk approach mot TIME_CEILING.
        const timeFloor = TIME_CEILING * (1 - Math.exp(-elapsed / TIME_CONSTANT_MS));
        const phaseTarget = resolvedPhase ? PHASE_TARGETS[resolvedPhase].target : 0;
        target = Math.max(timeFloor, phaseTarget);
      }

      targetRef.current = Math.max(targetRef.current, target);
      const diff = targetRef.current - currentRef.current;
      if (Math.abs(diff) < 0.1) {
        currentRef.current = targetRef.current;
      } else {
        currentRef.current += diff * SMOOTH_FACTOR;
      }
      setDisplayProgress(currentRef.current);

      if (running) window.setTimeout(tick, TICK_MS);
    };
    tick();
    return () => {
      running = false;
    };
  }, [isIdle, forceComplete, resolvedPhase]);

  const pct = Math.min(100, Math.round(displayProgress));

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center bg-background px-8 py-12",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <Mascot
          slot={isIdle ? "wave" : "hero"}
          priority
          decorative
          size={192}
          className={cn(
            "drop-shadow-[0_16px_28px_rgba(10,12,24,0.14)]",
            !isIdle && "motion-safe:animate-pulse",
          )}
        />

        {!isIdle && (
          <>
            <div className="text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-5xl">
              {pct}
              <span className="ml-1 text-base font-medium text-muted-foreground align-top">%</span>
            </div>

            <div
              className="h-[2px] w-full overflow-hidden rounded-full bg-border/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div
                className="h-full rounded-full bg-foreground/90 transition-[width] duration-300 ease-out"
                style={{ width: `${displayProgress}%` }}
              />
            </div>
          </>
        )}

        {!isIdle && (
          <p
            key={displayLabel}
            className="text-sm font-medium text-muted-foreground motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-300"
          >
            {displayLabel || "Skapar din sajt"}
          </p>
        )}
      </div>
    </div>
  );
}
