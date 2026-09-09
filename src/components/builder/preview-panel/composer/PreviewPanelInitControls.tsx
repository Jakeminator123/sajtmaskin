"use client";

import { useRef, useState } from "react";

import {
  MAX_PAGE_COUNT_CHOICE,
  getCurrentInitBuildChoices,
  isSiteTypeAllowedForTarget,
  setCurrentInitBuildChoices,
  type BuildTargetChoice,
  type ColorModeChoice,
  type ComplexityChoice,
  type InitBuildChoices,
  type SiteTypeChoice,
  type StyleChoice,
  type ToneChoice,
} from "@/lib/builder/init-build-choices";
import {
  DESIGN_THEME_OPTIONS,
  THEME_PRESETS,
  type DesignTheme,
} from "@/lib/builder/theme-presets";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const BUILD_TARGET_OPTIONS: Array<{ value: BuildTargetChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "website", label: "Hemsida" },
  { value: "app", label: "App" },
];

const SITE_TYPE_OPTIONS: Array<{ value: SiteTypeChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "landing", label: "Landningssida" },
  { value: "saas", label: "SaaS" },
  { value: "portfolio", label: "Portfolio" },
  { value: "blog", label: "Blogg" },
  { value: "shop", label: "Webbutik" },
  { value: "starter", label: "Enkel start" },
  { value: "dashboard", label: "Dashboard" },
  { value: "appshell", label: "App-skal" },
  { value: "auth", label: "Inloggning" },
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

const TONE_OPTIONS: Array<{ value: ToneChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "professional", label: "Professionell" },
  { value: "warm", label: "Varm" },
  { value: "playful", label: "Lekfull" },
];

const COLOR_MODE_OPTIONS: Array<{ value: ColorModeChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Ljust" },
  { value: "dark", label: "Mörkt" },
];

// "Auto" (value `off`) först så temaraden följer exakt samma
// vänster-är-neutralt-mönster som övriga rader — inget "Av" som stack ut och
// fick färgraden att kännas som ett på/av-reglage i stället för ett val.
const THEME_CHIP_OPTIONS: Array<{ value: DesignTheme; label: string }> = [
  { value: "off", label: "Auto" },
  ...DESIGN_THEME_OPTIONS.filter((option) => option.value !== "off"),
];

function themeSwatchColor(theme: DesignTheme): string | null {
  if (theme === "off" || theme === "custom") return null;
  return THEME_PRESETS[theme]?.primary ?? null;
}

interface ChoiceChipRowProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Optional swatch color per option (theme chips). */
  swatchFor?: (value: T) => string | null;
}

function ChoiceChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  swatchFor,
}: ChoiceChipRowProps<T>) {
  return (
    <div>
      <p className="text-muted-foreground/80 mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      {/* shadcn ToggleGroup (single-select) i stället för handrullade <button>:
          konsekvent fokus-/hover-/vald-tillstånd, tangentbordsnavigering och
          a11y utan egen styling. `spacing` > 0 håller chippen som separata
          piller så raden radbryts snyggt även med många val (t.ex. färgerna).
          Radix avmarkerar vid klick på ett redan aktivt val (tomt `next`) — vi
          ignorerar det så exakt ett val alltid är aktivt, precis som förr. */}
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        disabled={disabled}
        variant="outline"
        size="sm"
        spacing={1.5}
        className="w-full flex-wrap justify-start"
      >
        {options.map((option) => {
          const swatch = swatchFor?.(option.value) ?? null;
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className={cn(
                "h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs font-normal text-muted-foreground",
                "hover:border-primary/40 hover:bg-secondary/70 hover:text-foreground",
                "data-[state=on]:border-primary/60 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground",
              )}
            >
              {swatch ? (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
                  style={{ backgroundColor: swatch }}
                />
              ) : null}
              {option.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

interface PreviewPanelInitControlsProps {
  /** Färgtema-preset (flyttad hit från Avancerat) — delar shell-state med genereringen. */
  designTheme?: DesignTheme;
  onDesignThemeChange?: (theme: DesignTheme) => void;
  /** Låser temavalet under streaming (samma villkor som gamla Avancerat-väljaren). */
  themeLocked?: boolean;
}

/**
 * Byggval — the init controls shown in the welcome state. Every choice is
 * wired structurally (request-meta + custom-instructions channel) via
 * `dispatchInitBuildChoices` → `useCreateChat`; nothing is written into the
 * visible chat input. The theme row edits the shared `designTheme` shell
 * state directly (same signal the old Avancerat picker used).
 */
export function PreviewPanelInitControls({
  designTheme,
  onDesignThemeChange,
  themeLocked = false,
}: PreviewPanelInitControlsProps) {
  // State initieras från den delade storen: panelen av-/ommonteras när
  // välkomstläget döljs under en skapning, och vid en MISSLYCKAD skapning
  // ska den ommonterade panelen visa användarens tidigare val (storen
  // nollställs bara av useCreateChat vid lyckad skapning). Store + UI kan
  // därmed aldrig desynka. (Mobil-tabbarna CSS-gömmer panelerna utan
  // avmontering. Temat bor i shell-state och överlever medvetet.)
  const [choices, setChoices] = useState<InitBuildChoices>(() => getCurrentInitBuildChoices());
  // Senaste valen i en ref: updatern hålls ren (Strict Mode kan köra
  // updaters dubbelt) OCH två snabba ändringar i samma render-batch kan
  // inte skriva över varandra via en stale render-scoped `choices`.
  const latestChoicesRef = useRef<InitBuildChoices>(choices);

  const applyChoices = (partial: Partial<InitBuildChoices>) => {
    const next = { ...latestChoicesRef.current, ...partial };
    latestChoicesRef.current = next;
    setChoices(next);
    setCurrentInitBuildChoices(next);
  };

  const pageCountLabel =
    choices.pageCount === 0
      ? "Auto"
      : choices.pageCount === 1
        ? "1 sida"
        : `${choices.pageCount} sidor`;

  // Hemsida and App do not share scaffolds: the matcher's app branch only ever
  // reaches Dashboard/App-skal, so offering Landningssida under App would be a
  // chip the engine refuses to honor.
  const siteTypeOptions = SITE_TYPE_OPTIONS.filter((option) =>
    isSiteTypeAllowedForTarget(option.value, choices.buildTarget),
  );

  // Switching target can strand the current site type on a hidden chip. Reset it
  // in the same update so the store never holds a combination the UI stopped
  // showing (`buildInitBuildChoicesMeta` drops it too, as a second line of
  // defence for a store rehydrated from an older session).
  const applyBuildTarget = (buildTarget: BuildTargetChoice) => {
    const siteType = isSiteTypeAllowedForTarget(choices.siteType, buildTarget)
      ? choices.siteType
      : ("auto" as SiteTypeChoice);
    applyChoices({ buildTarget, siteType });
  };

  return (
    <div className="grid gap-4 text-left">
      <ChoiceChipRow
        label="Hemsida eller app"
        options={BUILD_TARGET_OPTIONS}
        value={choices.buildTarget}
        onChange={applyBuildTarget}
      />

      <ChoiceChipRow
        label="Typ av sajt"
        options={siteTypeOptions}
        value={choices.siteType}
        onChange={(siteType) => applyChoices({ siteType })}
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-muted-foreground/80 text-xs font-medium tracking-wide uppercase">
            Antal sidor
          </p>
          <span className="border-border/60 bg-secondary/40 text-foreground rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums">
            {pageCountLabel}
          </span>
        </div>
        <Slider
          aria-label="Antal sidor"
          min={0}
          max={MAX_PAGE_COUNT_CHOICE}
          step={1}
          value={[choices.pageCount]}
          onValueChange={([pageCount]) => applyChoices({ pageCount: pageCount ?? 0 })}
        />
        {/* Full opacitet: /60 gav ~3.2:1 mot builder-bakgrunden och föll på
            WCAG 2 AA (4.5:1) i Vercel-toolbarens a11y-kontroll. */}
        <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
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
        label="Ton"
        options={TONE_OPTIONS}
        value={choices.tone}
        onChange={(tone) => applyChoices({ tone })}
      />

      {onDesignThemeChange ? (
        <ChoiceChipRow
          label="Färg"
          options={THEME_CHIP_OPTIONS}
          value={designTheme ?? "off"}
          onChange={(theme) => onDesignThemeChange(theme)}
          disabled={themeLocked}
          swatchFor={themeSwatchColor}
        />
      ) : null}

      <ChoiceChipRow
        label="Färgläge"
        options={COLOR_MODE_OPTIONS}
        value={choices.colorMode}
        onChange={(colorMode) => applyChoices({ colorMode })}
      />
    </div>
  );
}
