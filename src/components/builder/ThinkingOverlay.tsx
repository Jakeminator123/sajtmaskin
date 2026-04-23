"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Engaging loading overlay for builder thinking states.
 * Rotates through real business facts while AI generates code.
 */

const FACTS = [
  { company: "Sajtmaskin", fact: "Genererar Next.js-sajter med AI — från prompt till live-preview" },
  { company: "Scaffold-system", fact: "Väljer automatiskt rätt sidstruktur baserat på din beskrivning" },
  { company: "Quality Gate", fact: "Varje genererad sajt genomgår syntax-validering och visuell QA" },
  { company: "Live Preview", fact: "Din sajt körs i en riktig VM med Next.js — inte bara en statisk bild" },
  { company: "Autofix", fact: "Mekaniska och LLM-drivna fixar rättar vanliga kodfel automatiskt" },
  { company: "Post-check", fact: "SEO, analytics och tillgänglighet granskas efter varje generering" },
];

export function ThinkingOverlay({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;
  return <ThinkingOverlayContent />;
}

function ThinkingOverlayContent() {
  const [factIndex, setFactIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setFactIndex((prev) => (prev + 1) % FACTS.length);
        setFadeIn(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const current = FACTS[factIndex];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-4 px-4 py-6">
      <div className="relative flex items-center gap-3">
        <Loader2 className="text-primary h-5 w-5 animate-spin" />
        <span className="text-muted-foreground text-sm">AI genererar...</span>
      </div>

      <div
        aria-live="polite"
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
