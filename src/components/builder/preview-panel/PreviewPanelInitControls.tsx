"use client";

import { useRef, useState } from "react";

import {
  DEFAULT_INIT_BUILD_CHOICES,
  INIT_BUILD_CHOICES_PREFILL_KEY,
  MAX_PAGE_COUNT_CHOICE,
  composeInitBuildChoicesText,
  dispatchInitBuildChoices,
  type ColorModeChoice,
  type ComplexityChoice,
  type InitBuildChoices,
  type SiteTypeChoice,
  type StyleChoice,
} from "@/lib/builder/init-build-choices";
import { dispatchPromptPrefill } from "@/lib/builder/prompt-prefill-event";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const SITE_TYPE_OPTIONS: Array<{ value: SiteTypeChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "landing", label: "Landningssida" },
  { value: "portfolio", label: "Portfolio" },
  { value: "blog", label: "Blogg" },
  { value: "shop", label: "Webbutik" },
  { value: "dashboard", label: "Dashboard" },
];

const COMPLEXITY_OPTIONS: Array<{ value: ComplexityChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "simple", label: "Enkel" },
  { value: "medium", label: "Lagom" },
  { value: "complex", label: "Komplex" },
];

const STYLE_OPTIONS: Array<{ value: StyleChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "warm", label: "Varm & lokal" },
  { value: "corporate", label: "Corporate" },
  { value: "bold", label: "Bold startup" },
  { value: "editorial", label: "Editorial" },
  { value: "minimal", label: "Minimal" },
];

const COLOR_MODE_OPTIONS: Array<{ value: ColorModeChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Ljust" },
  { value: "dark", label: "Mörkt" },
];

interface ChoiceChipRowProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

function ChoiceChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChoiceChipRowProps<T>) {
  return (
    <div>
      <p className="text-muted-foreground/80 mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                selected
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border/60 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Byggval — the init controls shown in the welcome state. Every change
 * upserts one Swedish prompt block into the chat input (keyed prefill), so
 * the user's own text is never overwritten and the block never duplicates.
 * Level 1 wiring: prompt text only — see `init-build-choices.ts`.
 */
export function PreviewPanelInitControls() {
  const [choices, setChoices] = useState<InitBuildChoices>(DEFAULT_INIT_BUILD_CHOICES);
  // Senaste valen i en ref: updatern hålls ren (Strict Mode kan köra
  // updaters dubbelt) OCH två snabba ändringar i samma render-batch kan
  // inte skriva över varandra via en stale render-scoped `choices`.
  const latestChoicesRef = useRef<InitBuildChoices>(DEFAULT_INIT_BUILD_CHOICES);

  const applyChoices = (partial: Partial<InitBuildChoices>) => {
    const next = { ...latestChoicesRef.current, ...partial };
    latestChoicesRef.current = next;
    setChoices(next);
    dispatchPromptPrefill(composeInitBuildChoicesText(next), {
      replaceKey: INIT_BUILD_CHOICES_PREFILL_KEY,
      skipFocus: true,
    });
    // Nivå 2: samma val skickas strukturerat till create-chat (scaffold,
    // sidantal, stil-keywords) — prompt-stycket ovan är den synliga ytan.
    dispatchInitBuildChoices(next);
  };

  const pageCountLabel =
    choices.pageCount === 0
      ? "Auto"
      : choices.pageCount === 1
        ? "1 sida"
        : `${choices.pageCount} sidor`;

  return (
    <div className="grid gap-4 text-left">
      <ChoiceChipRow
        label="Typ av sajt"
        options={SITE_TYPE_OPTIONS}
        value={choices.siteType}
        onChange={(siteType) => applyChoices({ siteType })}
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-muted-foreground/80 text-xs font-medium tracking-wide uppercase">
            Antal sidor
          </p>
          <span className="text-foreground text-xs font-medium">{pageCountLabel}</span>
        </div>
        <Slider
          aria-label="Antal sidor"
          min={0}
          max={MAX_PAGE_COUNT_CHOICE}
          step={1}
          value={[choices.pageCount]}
          onValueChange={([pageCount]) => applyChoices({ pageCount: pageCount ?? 0 })}
        />
        <div className="text-muted-foreground/60 mt-1 flex justify-between text-[10px]">
          <span>Auto</span>
          <span>{MAX_PAGE_COUNT_CHOICE}</span>
        </div>
      </div>

      <ChoiceChipRow
        label="Komplexitet"
        options={COMPLEXITY_OPTIONS}
        value={choices.complexity}
        onChange={(complexity) => applyChoices({ complexity })}
      />

      <ChoiceChipRow
        label="Stil"
        options={STYLE_OPTIONS}
        value={choices.style}
        onChange={(style) => applyChoices({ style })}
      />

      <ChoiceChipRow
        label="Färgläge"
        options={COLOR_MODE_OPTIONS}
        value={choices.colorMode}
        onChange={(colorMode) => applyChoices({ colorMode })}
      />
    </div>
  );
}
