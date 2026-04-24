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

  // Layout history:
  // - Original: `absolute inset-x-0 bottom-16 z-10` — covered the *last*
  //   streamed messages in MessageList while AI was generating.
  // - Plan 02 fix: moved to `top-2` (still absolute inside MessageList's
  //   container) — covered the *first* messages instead. User reported it
  //   was still hiding agentlog content.
  // - Now (post-plan-02 follow-up): rendered as a normal flex row OUTSIDE
  //   MessageList's container in BuilderShellContent. Takes its own line
  //   between the env-variable card and the chat stream — covers nothing.
  return (
    <div className="border-border/40 flex justify-center border-b px-4 py-1.5">
      <div
        className="text-muted-foreground flex max-w-md items-center gap-3 truncate"
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
