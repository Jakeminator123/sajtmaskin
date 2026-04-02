"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const PHASES = [
  { delay: 0, text: "Förbereder..." },
  { delay: 3000, text: "Genererar kod..." },
  { delay: 8000, text: "Förhandsgranskar..." },
];

export function ThinkingOverlay({ isVisible }: { isVisible: boolean }) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setPhaseIndex(0);
      return;
    }
    const timers = PHASES.slice(1).map((phase, i) =>
      setTimeout(() => setPhaseIndex(i + 1), phase.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-5">
      <Loader2 className="text-primary h-4 w-4 animate-spin" />
      <span className="text-muted-foreground text-sm transition-opacity duration-300">
        {PHASES[phaseIndex].text}
      </span>
    </div>
  );
}
