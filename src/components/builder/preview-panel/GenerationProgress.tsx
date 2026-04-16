"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

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
  brief:                 { target: 8,   label: "Bygger backend…" },
  scaffold:              { target: 15,  label: "Väljer struktur…" },
  generation:            { target: 45,  label: "Genererar filer…" },
  autofix:               { target: 72,  label: "Fixar problem…" },
  verifier:              { target: 82,  label: "Kontrollerar…" },
  validate_syntax:       { target: 87,  label: "Validerar syntax…" },
  parse_merge_preflight: { target: 92,  label: "Förbereder filer…" },
  preview:               { target: 97,  label: "Startar preview…" },
  done:                  { target: 100, label: "Klar!" },
};

const TICK_MS = 50;
const SMOOTH_FACTOR = 0.04;

interface GenerationProgressProps {
  phase?: GenerationPhase;
}

export function GenerationProgress({ phase }: GenerationProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const phaseTarget = phase ? PHASE_TARGETS[phase]?.target ?? 0 : 2;
    targetRef.current = Math.max(targetRef.current, phaseTarget);
  }, [phase]);

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
  const label = phase ? PHASE_TARGETS[phase]?.label ?? "Skapar din sajt…" : "Skapar din sajt…";

  return (
    <div className="flex h-full flex-col items-center justify-center bg-card px-8 py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-border/40 bg-background/80 px-8 py-10 shadow-lg backdrop-blur-sm">
        <div className="text-2xl font-medium tracking-tight text-foreground tabular-nums">{pct}%</div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-in-out"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
