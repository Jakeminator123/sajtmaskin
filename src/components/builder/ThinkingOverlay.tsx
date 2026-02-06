"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Engaging loading overlay for builder thinking states.
 * Rotates through real business facts while AI generates code.
 */

const FACTS = [
  { company: "Spotify", fact: "Startade i en lägenhet i Stockholm 2006" },
  { company: "IKEA", fact: "Grundades av en 17-åring i Småland 1943" },
  { company: "Klarna", fact: "Värderades till $6.7 miljarder vid första börsintroduktionen" },
  { company: "Minecraft", fact: "Såldes till Microsoft för $2.5 miljarder 2014" },
  { company: "H&M", fact: "Första butiken hette Hennes och öppnade i Västerås 1947" },
  { company: "Volvo", fact: "Betyder 'jag rullar' på latin" },
  { company: "Northvolt", fact: "Europas största batterifabrik – grundad 2016" },
  { company: "Storytel", fact: "Finns i 25+ marknader med 2M+ prenumeranter" },
  { company: "King", fact: "Candy Crush laddades ner 2.7 miljarder gånger" },
  { company: "Hemnet", fact: "97% av alla bostadsaffärer i Sverige passerar Hemnet" },
  { company: "Truecaller", fact: "500 miljoner användare – grundat i Stockholm" },
  { company: "Epidemic Sound", fact: "Levererar musik till 90% av världens största YouTubers" },
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
