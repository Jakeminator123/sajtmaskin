"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Engaging loading overlay for builder thinking states.
 * Rotates through real business facts while AI generates code.
 */

const FACTS = [
  { company: "Max Ventures", fact: "Investerar och utvecklar innovativa företag inom olika branscher" },
  { company: "Bilen&Jag", fact: "Svensk plattform som förenklar köp och ägande av bil" },
  { company: "Prometheus", fact: "Internationellt ledande AI-företag inom poker" },
  { company: "DG97", fact: "Kontorshotellet på Drottninggatan" },
  { company: "1753 Scincare", fact: "Hudvårdsmärke med fokus på naturliga ingredienser" },
  { company: "Raymond Media", fact: "Producerar digitalt innehåll för ledande varumärken" },
];

export function ThinkingOverlay({ isVisible }: { isVisible: boolean }) {
  const [factIndex, setFactIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setFactIndex((prev) => (prev + 1) % FACTS.length);
        setFadeIn(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const current = FACTS[factIndex];

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <div className="relative flex items-center gap-3">
        <Loader2 className="text-primary h-5 w-5 animate-spin" />
        <span className="text-muted-foreground text-sm">AI genererar...</span>
      </div>

      <div
        className={`max-w-sm text-center transition-opacity duration-300 ${
          fadeIn ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="text-muted-foreground/60 text-xs">
          <span className="text-foreground/80 font-medium">{current.company}</span>
          {" — "}
          {current.fact}
        </p>
      </div>
    </div>
  );
}
