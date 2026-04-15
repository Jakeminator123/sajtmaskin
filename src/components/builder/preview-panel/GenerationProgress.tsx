"use client";

import { useEffect, useRef, useState } from "react";
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

const PHASE_CONFIG: Record<
  NonNullable<GenerationPhase>,
  { label: string; progress: number; tip: string }
> = {
  brief: { label: "Analyserar brief", progress: 5, tip: "Planerar sajtens struktur." },
  scaffold: { label: "Väljer grundmall", progress: 10, tip: "Väljer teknisk grund." },
  generation: { label: "Genererar kod", progress: 30, tip: "Skapar sidor och komponenter." },
  autofix: { label: "Åtgärdar fel", progress: 70, tip: "Korrigerar automatiskt." },
  verifier: { label: "Verifierar kvalitet", progress: 80, tip: "Granskar koden." },
  validate_syntax: { label: "Validerar syntax", progress: 85, tip: "Kontrollerar syntax." },
  parse_merge_preflight: { label: "Förbereder filer", progress: 90, tip: "Sparar filer." },
  preview: { label: "Startar preview", progress: 95, tip: "Förbereder visning." },
  done: { label: "Klar!", progress: 100, tip: "Din sajt är redo." },
};

const FALLBACK_TIPS = [
  "Layout och typografi anpassas efter dina val.",
  "Responsiv design för alla skärmstorlekar.",
  "Unik text anpassad för din målgrupp.",
  "Navigation och flöde optimeras.",
  "SEO-grunder från start.",
  "Modern teknik för snabb laddning.",
];

const TIP_INTERVAL_MS = 6000;
const TOTAL_DURATION_MS = 10 * 60 * 1000;

interface GenerationProgressProps {
  phase?: GenerationPhase;
}

export function GenerationProgress({ phase }: GenerationProgressProps) {
  const [timeProgress, setTimeProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeTip, setFadeTip] = useState(true);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const raw = Math.min(elapsed / TOTAL_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - raw, 1.4);
      setTimeProgress(Math.min(eased * 100, 99.5));
    };
    const id = setInterval(tick, 400);
    tick();
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setFadeTip(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % FALLBACK_TIPS.length);
        setFadeTip(true);
      }, 300);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const phaseConfig = phase ? PHASE_CONFIG[phase] : null;
  const progress = phaseConfig
    ? Math.max(phaseConfig.progress, Math.min(timeProgress, phaseConfig.progress + 15))
    : timeProgress;
  const pct = Math.round(progress);
  const label = phaseConfig?.label ?? "Bygger din sajt...";
  const tip = phaseConfig?.tip ?? FALLBACK_TIPS[tipIndex];

  const orderedPhases: NonNullable<GenerationPhase>[] = [
    "brief", "scaffold", "generation", "autofix", "verifier", "preview",
  ];
  const activeIdx = phase ? orderedPhases.indexOf(phase) : -1;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-8 py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-border/40 bg-card/80 px-8 py-10 shadow-lg backdrop-blur-sm">
        <div className="text-2xl font-medium tracking-tight text-foreground tabular-nums">{pct}%</div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-sm font-medium text-foreground">{label}</p>

        {phase && (
          <div className="flex items-center gap-1.5">
            {orderedPhases.map((p, i) => (
              <div
                key={p}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors duration-300",
                  i < activeIdx
                    ? "bg-primary"
                    : i === activeIdx
                      ? "bg-primary/70"
                      : "bg-muted",
                )}
                title={PHASE_CONFIG[p].label}
              />
            ))}
          </div>
        )}

        <p
          className="min-h-[1.2em] max-w-xs text-center text-xs text-muted-foreground/70 transition-opacity duration-300"
          style={{ opacity: phaseConfig ? 1 : fadeTip ? 1 : 0 }}
        >
          {tip}
        </p>
      </div>
    </div>
  );
}
