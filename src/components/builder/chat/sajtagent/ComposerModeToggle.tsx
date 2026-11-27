"use client";

import { Bot, Hammer, Sparkles } from "lucide-react";
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { COMPOSER_MODES, COMPOSER_MODE_META, isComposerMode, type ComposerMode } from "@/lib/builder/composer-route";

const MODE_ICON = { auto: Sparkles, agent: Bot, build: Hammer } as const;

export function ComposerModeToggle({
  value,
  onChange,
  agentConfigured,
  buildLocked,
}: {
  value: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  agentConfigured: boolean;
  buildLocked: boolean;
}) {
  return (
    <DropdownMenuRadioGroup
      aria-label="Mottagare för nästa meddelande"
      value={value}
      onValueChange={(mode) => { if (isComposerMode(mode)) onChange(mode); }}
    >
      {COMPOSER_MODES.map((mode) => {
        const Icon = MODE_ICON[mode];
        return (
          <DropdownMenuRadioItem
            key={mode}
            value={mode}
            title={COMPOSER_MODE_META[mode].title}
            disabled={(mode === "agent" && !agentConfigured) || (mode === "build" && buildLocked)}
          >
            <Icon aria-hidden="true" />
            {COMPOSER_MODE_META[mode].label}
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}
