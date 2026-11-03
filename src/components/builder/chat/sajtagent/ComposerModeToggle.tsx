"use client";

import { Bot, Hammer, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPOSER_MODES,
  COMPOSER_MODE_META,
  type ComposerMode,
} from "@/lib/builder/composer-route";

const MODE_ICON = {
  auto: Sparkles,
  agent: Bot,
  build: Hammer,
} as const;

/**
 * Auto · Fråga · Bygg — vem som tar emot nästa utskick från komposern.
 * Auto är standard; de två andra tvingar mottagaren (`composer-route.ts`).
 */
export function ComposerModeToggle({
  value,
  onChange,
  disabledModes = [],
  disabled = false,
}: {
  value: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  disabledModes?: readonly ComposerMode[];
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Mottagare för nästa meddelande"
      className="border-border/70 bg-muted/60 inline-flex max-w-full items-center gap-0.5 rounded-xl border p-1"
    >
      {COMPOSER_MODES.map((mode) => {
        const Icon = MODE_ICON[mode];
        const selected = value === mode;
        const isDisabled = disabled || disabledModes.includes(mode);
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isDisabled}
            title={COMPOSER_MODE_META[mode].title}
            onClick={() => onChange(mode)}
            className={cn(
              "focus-visible:ring-ring inline-flex h-7 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
              selected
                ? "bg-background text-foreground ring-border/60 shadow-sm ring-1"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-3.5", selected && "text-brand-blue")} aria-hidden="true" />
            {COMPOSER_MODE_META[mode].label}
          </button>
        );
      })}
    </div>
  );
}
