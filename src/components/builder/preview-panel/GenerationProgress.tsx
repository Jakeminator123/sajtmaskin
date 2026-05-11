"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type GenerationPhase =
  | "brief"
  | "scaffold"
  | "generation"
  | "url_expand"
  | "autofix"
  | "materialize_images"
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
  url_expand:            { target: 62, label: "Förbereder länkar" },
  autofix:               { target: 70, label: "Polerar detaljer" },
  materialize_images:    { target: 74, label: "Hämtar bilder" },
  verifier:              { target: 80, label: "Kvalitetskoll" },
  validate_syntax:       { target: 86, label: "Validerar syntax" },
  parse_merge_preflight: { target: 92, label: "Förbereder filer" },
  preview:               { target: 96, label: "Laddar preview" },
  done:                  { target: 100, label: "Klar" },
};

const TICK_MS = 50;
const SMOOTH_FACTOR = 0.08;
// Tidsdrivet creep: snabb snap till ~1 % i första tickarna, sedan lugn
// asymptotisk ramp mot 95 % så att en ~10 min bygg-körning landar runt ~92 %
// och vi aldrig stannar synligt. Exponentialkurva: p(t) = CEIL * (1 - e^(-t/TAU)).
const TIME_CEILING = 95;
const TIME_CONSTANT_MS = 180_000; // ~3 min tidskonstant → ~92 % efter 10 min
const INITIAL_FLOOR = 1; // visa alltid minst 1 % direkt när bygget startar

interface GenerationProgressProps {
  phase?: GenerationPhase;
  forceComplete?: boolean;
  className?: string;
}

export function GenerationProgress({ phase, forceComplete, className }: GenerationProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayLabel, setDisplayLabel] = useState<string>("Skapar din sajt");
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
      // snappa omedelbart till 1 % så bannern inte blinkar upp med "0 %".
      currentRef.current = INITIAL_FLOOR;
      targetRef.current = INITIAL_FLOOR;
      setDisplayProgress(INITIAL_FLOOR);
    }
    if (resolvedPhase) {
      lastPhaseRef.current = resolvedPhase;
      setDisplayLabel(PHASE_TARGETS[resolvedPhase].label);
    } else {
      // Ingen fas än — behåll default-texten; initialiseras redan via useState.
      setDisplayLabel("Skapar din sajt");
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
        const timeFloor = TIME_CEILING * (1 - Math.exp(-elapsed / TIME_CONSTANT_MS));
        const phaseTarget = resolvedPhase ? PHASE_TARGETS[resolvedPhase].target : 0;
        target = Math.max(INITIAL_FLOOR, timeFloor, phaseTarget);
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
      <div className="flex w-full max-w-md flex-col items-center gap-7">
        <div className="flex items-baseline gap-1.5 text-foreground">
          <span className="font-serif text-6xl font-normal tracking-tight tabular-nums sm:text-7xl">
            {isIdle ? 0 : pct}
          </span>
          <span className="text-lg font-normal text-muted-foreground">%</span>
        </div>

        <div
          className="h-[3px] w-full overflow-hidden rounded-full bg-[hsl(var(--brand-sand))]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isIdle ? 0 : pct}
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500"
            style={{
              width: isIdle ? "0%" : `${displayProgress}%`,
              transitionTimingFunction: "var(--ease-out-soft, cubic-bezier(0.16, 1, 0.3, 1))",
            }}
          />
        </div>

        <p
          key={displayLabel}
          className="text-center text-sm tracking-wide text-muted-foreground motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-500"
        >
          {isIdle ? "Redo att bygga" : displayLabel || "Skapar din sajt"}
        </p>
      </div>
    </div>
  );
}
