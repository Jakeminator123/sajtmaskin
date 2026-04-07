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
  brief: { label: "Analyserar brief", progress: 5, tip: "Vi analyserar din brief och planerar sajtens struktur..." },
  scaffold: { label: "Väljer grundmall", progress: 10, tip: "Vi väljer den bästa tekniska grunden för din sajt." },
  generation: { label: "Genererar kod", progress: 30, tip: "LLM:en skapar sidor, komponenter och innehåll." },
  autofix: { label: "Åtgärdar fel", progress: 70, tip: "Automatisk felsökning och korrigering pågår." },
  verifier: { label: "Verifierar kvalitet", progress: 80, tip: "Vi granskar koden för att säkerställa kvalitet." },
  validate_syntax: { label: "Validerar syntax", progress: 85, tip: "Syntaxkontroll och sista polering." },
  parse_merge_preflight: { label: "Förbereder filer", progress: 90, tip: "Slutsteg: filer sparas och version skapas." },
  preview: { label: "Startar preview", progress: 95, tip: "Din sajt förbereds för visning..." },
  done: { label: "Klar!", progress: 100, tip: "Din sajt är redo att visas." },
};

const FALLBACK_TIPS = [
  "Dina val påverkar layout, färgpalett och typografi.",
  "Varje sektion byggs med responsiv design i åtanke.",
  "Vi skapar unika texter anpassade för din målgrupp.",
  "Bilderna väljs ut för att matcha din varumärkeskänsla.",
  "Navigation och användarflöde optimeras automatiskt.",
  "SEO-grunderna läggs in redan från start.",
  "Din sajt byggs med modern teknik för snabb laddning.",
  "Responsiv design — ser bra ut på mobil, surfplatta och dator.",
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
        <div className="text-6xl font-light tracking-tighter text-foreground tabular-nums">{pct}%</div>

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
                      ? "animate-pulse bg-primary/70"
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
