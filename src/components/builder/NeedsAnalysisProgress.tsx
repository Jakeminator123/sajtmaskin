"use client";

import { useEffect, useRef, useState } from "react";
import {
  Globe,
  Briefcase,
  Link2,
  Target,
  Users,
  LayoutGrid,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NeedsAnalysisProgressProps {
  completionRatio: number;
  answeredCount: number;
  totalCount: number;
}

const STEP_ICONS = [Globe, Briefcase, Link2, Target, Users, LayoutGrid, Palette];

const MICRO_COPY: { threshold: number; text: string }[] = [
  { threshold: 0, text: "Vi börjar forma din sajt..." },
  { threshold: 0.15, text: "Bra — jag börjar se en riktning" },
  { threshold: 0.3, text: "Snyggt. Bilden klarnar" },
  { threshold: 0.5, text: "Halvvägs! Bara några frågor kvar" },
  { threshold: 0.7, text: "Nästan där — din sajt tar form" },
  { threshold: 0.85, text: "Sista detaljerna..." },
  { threshold: 1, text: "Perfekt! Nu bygger jag din sajt" },
];

const FUN_FACTS = [
  "Din sajt blir mobilanpassad från start",
  "75% av besökare bedömer trovärdighet utifrån design",
  "En snabb sajt ökar konverteringar med upp till 30%",
  "Första intrycket skapas på under 0,05 sekunder",
  "Vi optimerar automatiskt för sökmotorer",
  "Över 50% av all webbtrafik kommer från mobilen",
  "En tydlig CTA kan fördubbla dina leads",
];

function getMicroCopy(ratio: number): string {
  let copy = MICRO_COPY[0].text;
  for (const entry of MICRO_COPY) {
    if (ratio >= entry.threshold) copy = entry.text;
  }
  return copy;
}

const RADIUS = 90;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2;

export function NeedsAnalysisProgress({
  completionRatio,
  answeredCount,
  totalCount,
}: NeedsAnalysisProgressProps) {
  const [displayedRatio, setDisplayedRatio] = useState(0);
  const [displayedPercent, setDisplayedPercent] = useState(0);
  const animRef = useRef<number | null>(null);
  const prevRatioRef = useRef(0);
  const [funFact, setFunFact] = useState(() => FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)]);

  useEffect(() => {
    if (answeredCount > 0) {
      setFunFact(FUN_FACTS[answeredCount % FUN_FACTS.length]);
    }
  }, [answeredCount]);

  useEffect(() => {
    const from = prevRatioRef.current;
    const to = completionRatio;
    if (from === to) return;

    const start = performance.now();
    const duration = 600;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      const current = from + (to - from) * eased;
      setDisplayedRatio(current);
      setDisplayedPercent(Math.round(current * 100));
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        prevRatioRef.current = to;
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [completionRatio]);

  const dashOffset = CIRCUMFERENCE * (1 - displayedRatio);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-gradient-to-b from-neutral-950 to-neutral-900 px-6">
      {/* Circle + percentage */}
      <div className="relative">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-white/[0.06]"
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="transition-none"
          />
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent-orange)" />
              <stop offset="100%" stopColor="var(--accent-orange)" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums text-white">
            {displayedPercent}%
          </span>
          <span className="mt-1 text-xs text-white/30">
            {answeredCount} av {totalCount}
          </span>
        </div>

        {/* Step icons around the ring */}
        {STEP_ICONS.slice(0, totalCount).map((Icon, i) => {
          const angle = (i / totalCount) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const iconRadius = RADIUS + STROKE + 18;
          const x = SIZE / 2 + iconRadius * Math.cos(rad);
          const y = SIZE / 2 + iconRadius * Math.sin(rad);
          const isAnswered = i < answeredCount;
          return (
            <div
              key={i}
              className={cn(
                "absolute flex h-7 w-7 items-center justify-center rounded-full transition-all duration-500",
                isAnswered
                  ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]"
                  : "bg-white/[0.04] text-white/15",
              )}
              style={{
                left: x - 14,
                top: y - 14,
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            </div>
          );
        })}
      </div>

      {/* Micro copy */}
      <div className="text-center">
        <p className="text-sm font-medium text-white/70">
          {getMicroCopy(completionRatio)}
        </p>
        <p className="mt-3 text-xs text-white/25">
          {funFact}
        </p>
      </div>
    </div>
  );
}
