"use client";

import { Sparkles, Wrench } from "lucide-react";
import { useCallback } from "react";

export type BuilderMode = "starter" | "pro";

const MODE_STORAGE_KEY = "sajtmaskin-builder-mode";

export function readStoredMode(): BuilderMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === "starter" || stored === "pro") return stored;
  return null;
}

export function writeStoredMode(mode: BuilderMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export function ModeSelector({ onSelect }: { onSelect: (mode: BuilderMode) => void }) {
  const pick = useCallback(
    (mode: BuilderMode) => {
      writeStoredMode(mode);
      onSelect(mode);
    },
    [onSelect],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xl animate-fade-up space-y-6 text-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Hur van är du att bygga hemsidor?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Välj läget som passar dig bäst just nu. Du kan byta senare.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pick("starter")}
            className="group relative flex flex-col items-center gap-3 rounded-3xl border-2 border-border/40 bg-card/90 px-6 py-8 shadow-lg backdrop-blur-xl transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <Sparkles className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold text-foreground">Amatör</span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              Jag guidar dig steg för steg med frågor, förslag och tydliga nästa steg.
            </span>
          </button>

          <button
            type="button"
            onClick={() => pick("pro")}
            className="group relative flex flex-col items-center gap-3 rounded-3xl border-2 border-border/40 bg-card/90 px-6 py-8 shadow-lg backdrop-blur-xl transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <Wrench className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold text-foreground">Pro</span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              För dig som vill styra fler detaljer och använda fler verktyg direkt.
            </span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground/60">
          Båda lägen bygger med samma motor i bakgrunden.
        </p>
      </div>
    </div>
  );
}
