"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  onOpen: () => void;
  pulsing?: boolean;
  attention?: boolean;
  label?: string;
  shortcutLabel?: string;
  className?: string;
};

/**
 * Tiny floating pill that opens the builder's details drawer.
 * Visually quiet by default; pulses softly while the engine is working.
 * Also hooks up Cmd/Ctrl+K as a power-user shortcut.
 */
export function BuilderDisclosurePill({
  onOpen,
  pulsing = false,
  attention = false,
  label = "Verktyg",
  shortcutLabel = "⌘K",
  className,
}: Props) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isK = event.key === "k" || event.key === "K";
      if (!isK) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label} (${shortcutLabel})`}
      className={cn(
        "group pointer-events-auto fixed right-5 bottom-5 z-40 flex items-center gap-2",
        "rounded-full border border-border/60 bg-background/80 px-3 py-1.5",
        "text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur",
        "transition-[background-color,color,border-color,box-shadow] duration-200",
        "hover:text-foreground hover:border-border hover:bg-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full",
            attention ? "bg-primary/70" : "bg-muted-foreground/60",
            pulsing && "motion-safe:animate-ping",
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            attention ? "bg-primary" : "bg-muted-foreground",
          )}
        />
      </span>
      <span className="hidden sm:inline">{label}</span>
      <kbd className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground">
        {shortcutLabel}
      </kbd>
    </button>
  );
}
