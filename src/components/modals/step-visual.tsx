"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Target,
  Globe,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type StepVisualProps = {
  step: number;
  industry?: string;
  selectedVibe?: string;
  isBusy?: boolean;
};

type LottiePayload = Record<string, unknown>;

const PULSE_ANIMATION: LottiePayload = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 90,
  w: 120,
  h: 120,
  nm: "WizardPulse",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "PulseCircle",
      sr: 1,
      ks: {
        o: { a: 0, k: 70 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [60, 60, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [60, 60, 100] },
            { t: 45, s: [100, 100, 100] },
            { t: 90, s: [60, 60, 100] },
          ],
        },
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] }, nm: "Ellipse Path 1" },
            { ty: "fl", c: { a: 0, k: [0.19, 0.56, 0.96, 1] }, o: { a: 0, k: 100 }, r: 1, nm: "Fill 1" },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
              nm: "Transform",
            },
          ],
          nm: "Ellipse 1",
        },
      ],
      ip: 0,
      op: 90,
      st: 0,
      bm: 0,
    },
  ],
};

const SWEEP_ANIMATION: LottiePayload = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 120,
  w: 120,
  h: 120,
  nm: "WizardSweep",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "SweepRing",
      sr: 1,
      ks: {
        o: { a: 0, k: 80 },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 120, s: [360] }] },
        p: { a: 0, k: [60, 60, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [84, 84] }, nm: "Ellipse Path 1" },
            {
              ty: "st",
              c: { a: 0, k: [0.51, 0.77, 1, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 8 },
              lc: 2,
              lj: 2,
              ml: 4,
              nm: "Stroke 1",
            },
            { ty: "tm", s: { a: 0, k: 0 }, e: { a: 0, k: 36 }, o: { a: 0, k: 0 }, nm: "Trim Paths 1" },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
              nm: "Transform",
            },
          ],
          nm: "Ellipse 1",
        },
      ],
      ip: 0,
      op: 120,
      st: 0,
      bm: 0,
    },
  ],
};

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}

function renderStepIcon(step: number, className: string) {
  if (step === 1) return <Building2 className={className} />;
  if (step === 2) return <Target className={className} />;
  if (step === 3) return <Globe className={className} />;
  if (step === 4) return <Palette className={className} />;
  if (step === 5) return <Rocket className={className} />;
  return <Sparkles className={className} />;
}

export function StepVisual({ step, industry, selectedVibe, isBusy = false }: StepVisualProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const animationData = useMemo(() => {
    if (isBusy || step === 3) return SWEEP_ANIMATION;
    return PULSE_ANIMATION;
  }, [isBusy, step]);

  const accentClass = useMemo(() => {
    if (step === 4 && selectedVibe === "luxury") return "text-amber-300";
    if (step === 1 && industry === "tech") return "text-cyan-300";
    return "text-primary";
  }, [industry, selectedVibe, step]);

  if (prefersReducedMotion) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-secondary/40">
        {renderStepIcon(step, `h-4 w-4 ${accentClass}`)}
      </div>
    );
  }

  return (
    <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border/40 bg-secondary/30">
      <Lottie animationData={animationData} loop autoPlay className="h-10 w-10" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {renderStepIcon(step, `h-4 w-4 ${accentClass}`)}
      </div>
    </div>
  );
}
