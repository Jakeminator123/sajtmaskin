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

  // Layout note (plan-02 / STATUS-01): tidigare positionerad `absolute
  // inset-x-0 bottom-16` vilket lade overlay:n ovanpå nederkanten av
  // `MessageList` och dolde de senaste streamade reasoning/agentlog-raderna
  // medan AI genererade. Flyttad till ett kompakt header-band längst upp
  // (`top-2`) så den inte konkurrerar med chat-strömmen om vertikal
  // skärmyta. `pointer-events-none` behålls så den inte blockerar klick.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4">
      <div
        className="border-border/60 bg-background/85 text-muted-foreground flex max-w-md items-center gap-3 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur-sm"
        aria-live="polite"
      >
        <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="text-xs font-medium">AI genererar</span>
        <span className="text-muted-foreground/40 text-xs">·</span>
        <span
          className={`text-muted-foreground/70 truncate text-xs transition-opacity duration-300 ${
            fadeIn ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-foreground/70 font-medium">{current.company}</span>
          {" — "}
          {current.fact}
        </span>
      </div>
    </div>
  );
}
