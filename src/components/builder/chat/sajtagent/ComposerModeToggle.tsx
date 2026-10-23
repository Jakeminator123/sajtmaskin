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
      className="inline-flex h-7 items-center rounded-md border border-zinc-700/60 bg-zinc-800/50 p-0.5"
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
              "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors disabled:pointer-events-none disabled:opacity-40",
              selected
                ? "bg-zinc-200 text-zinc-900"
                : "text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100",
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {COMPOSER_MODE_META[mode].label}
          </button>
        );
      })}
    </div>
  );
}
