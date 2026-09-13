"use client";

import {
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  createContext,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import {
  Brush,
  Check,
  Files,
  Gauge,
  LayoutTemplate,
  MessageCircle,
  MonitorSmartphone,
  Palette,
  SunMoon,
} from "lucide-react";

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
import { DESIGN_THEME_OPTIONS, THEME_PRESETS, type DesignTheme } from "@/lib/builder/theme-presets";
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

type SectionIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

interface ChoiceSectionProps {
  icon: SectionIcon;
  label: string;
  /** Right-aligned slot in the section header (e.g. the current page count). */
  trailing?: ReactNode;
  children: ReactNode;
}

// Radix ger `type="single"` rollen `radiogroup`, och en radiogroup utan
// tillgängligt namn är ett axe-fel (`aria-input-field-name`). Sektionsrubriken
// ÄR namnet, så den delas ned till kontrollen i stället för att varje rad
// upprepar sin etikett i en egen `aria-label`.
const ChoiceSectionLabelContext = createContext<string | undefined>(undefined);

/**
 * One row of the control panel: a quiet icon + uppercase label header, then
 * the control itself. Sections stack inside the card with hairline dividers so
 * the panel reads as one designed surface rather than a flat list of rows.
 */
function ChoiceSection({ icon: Icon, label, trailing, children }: ChoiceSectionProps) {
  const labelId = useId();
  return (
    <section className="py-3.5 first:pt-3 last:pb-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="text-primary/80 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p
            id={labelId}
            className="text-foreground/85 text-[11px] font-semibold tracking-[0.08em] uppercase"
          >
            {label}
          </p>
        </div>
        {trailing}
      </div>
      <ChoiceSectionLabelContext.Provider value={labelId}>
        {children}
      </ChoiceSectionLabelContext.Provider>
    </section>
  );
}

// Gemensam pillbas. Vald = fylld brand-blå med mörk text (samma kontrakt som
// primärknappen, låst av globals-token-contrast) plus en mjuk glow så det
// aktiva valet syns på en armlängds avstånd. Ovald = tyst, mörk pill som
// lyfter mot foreground vid hover. Alla vikter är lika så chippen inte byter
// bredd när valet flyttar sig.
const CHIP_BASE_CLASS = cn(
  "group h-8 gap-1.5 rounded-full border border-border/70 bg-background/50 px-3 text-xs font-medium text-muted-foreground shadow-none",
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
  "hover:border-border hover:bg-secondary hover:text-foreground",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
  "active:scale-[0.98]",
);

const CHIP_ON_CLASS = cn(
  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
  "data-[state=on]:shadow-[0_0_0_3px_hsl(var(--primary)/0.22),0_8px_20px_-8px_hsl(var(--primary)/0.85)]",
  "data-[state=on]:hover:border-primary data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground",
);

// Färgchip: den valda färgen målar sin egen nyans (kant, tonad fyllning och
// glow) via `--swatch` så raden känns som en riktig färgväljare i stället för
// att alla val blir samma blå.
const SWATCH_CHIP_ON_CLASS = cn(
  "data-[state=on]:border-[color:var(--swatch)] data-[state=on]:text-foreground",
  "data-[state=on]:bg-[color:color-mix(in_oklab,var(--swatch)_22%,transparent)]",
  "data-[state=on]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--swatch)_30%,transparent),0_8px_20px_-8px_color-mix(in_oklab,var(--swatch)_85%,transparent)]",
  "data-[state=on]:hover:border-[color:var(--swatch)] data-[state=on]:hover:bg-[color:color-mix(in_oklab,var(--swatch)_30%,transparent)] data-[state=on]:hover:text-foreground",
);

interface ChoiceChipRowProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Optional swatch color per option (theme chips). */
  swatchFor?: (value: T) => string | null;
}

function ChoiceChipRow<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  swatchFor,
}: ChoiceChipRowProps<T>) {
  const sectionLabelId = useContext(ChoiceSectionLabelContext);
  return (
    // shadcn ToggleGroup (single-select) i stället för handrullade <button>:
    // konsekvent fokus-/hover-/vald-tillstånd, tangentbordsnavigering och
    // a11y utan egen styling. `spacing` > 0 håller chippen som separata
    // piller så raden radbryts snyggt även med många val (t.ex. färgerna).
    // Radix avmarkerar vid klick på ett redan aktivt val (tomt `next`) — vi
    // ignorerar det så exakt ett val alltid är aktivt, precis som förr.
    <ToggleGroup
      type="single"
      aria-labelledby={sectionLabelId}
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
            className={cn(CHIP_BASE_CLASS, swatch ? SWATCH_CHIP_ON_CLASS : CHIP_ON_CLASS)}
            style={swatch ? ({ "--swatch": swatch } as CSSProperties) : undefined}
          >
            {swatch ? (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                  "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.5)]",
                  "transition-transform duration-150 group-hover:scale-110 group-data-[state=on]:scale-110",
                )}
                style={{ backgroundColor: swatch }}
              >
                <Check
                  // `size-2.5` och inte `h-2.5 w-2.5`: toggle-varianten sätter
                  // `[&_svg:not([class*='size-'])]:size-4`, så utan en
                  // size-klass tvingas checken till 16px i en 16px-swatch.
                  // Skuggan ligger runtom, inte bara under, så den vita
                  // markören håller kant även på ljusa nyanser (Äng/Senap).
                  className="size-2.5 text-white opacity-0 drop-shadow-[0_0_1px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-data-[state=on]:opacity-100"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              </span>
            ) : null}
            {option.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

// Radix centrerar tummen på `i/max * (spårbredd − tumbredd) + tumbredd/2`, så
// tick-etiketterna måste räknas på samma sätt för att hamna rakt under tummen.
const SLIDER_THUMB_PX = 18;

function tickLeft(index: number, max: number): string {
  const ratio = max === 0 ? 0 : index / max;
  return `calc(${ratio * 100}% + ${(0.5 - ratio) * SLIDER_THUMB_PX}px)`;
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

  const pageTicks = Array.from({ length: MAX_PAGE_COUNT_CHOICE + 1 }, (_, index) => index);

  return (
    <div
      className={cn(
        "border-border/60 bg-card/70 rounded-2xl border text-left backdrop-blur-sm",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_30px_60px_-30px_rgba(0,0,0,0.85)]",
      )}
    >
      <div className="divide-border/50 divide-y px-4">
        <ChoiceSection icon={MonitorSmartphone} label="Hemsida eller app">
          <ChoiceChipRow
            options={BUILD_TARGET_OPTIONS}
            value={choices.buildTarget}
            onChange={applyBuildTarget}
          />
        </ChoiceSection>

        <ChoiceSection icon={LayoutTemplate} label="Typ av sajt">
          <ChoiceChipRow
            options={siteTypeOptions}
            value={choices.siteType}
            onChange={(siteType) => applyChoices({ siteType })}
          />
        </ChoiceSection>

        <ChoiceSection
          icon={Files}
          label="Antal sidor"
          trailing={
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                choices.pageCount === 0
                  ? "border-border/70 bg-secondary text-muted-foreground"
                  : "border-primary/40 bg-primary/15 text-primary",
              )}
            >
              {pageCountLabel}
            </span>
          }
        >
          <div className="px-1 pt-1">
            <Slider
              aria-label="Antal sidor"
              min={0}
              max={MAX_PAGE_COUNT_CHOICE}
              step={1}
              value={[choices.pageCount]}
              onValueChange={([pageCount]) => applyChoices({ pageCount: pageCount ?? 0 })}
              className={cn(
                "[&_[data-slot=slider-track]]:bg-secondary [&_[data-slot=slider-track]]:h-2",
                "[&_[data-slot=slider-track]]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]",
                "[&_[data-slot=slider-range]]:from-primary/70 [&_[data-slot=slider-range]]:to-primary [&_[data-slot=slider-range]]:bg-gradient-to-r",
                "[&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:size-[18px] [&_[data-slot=slider-thumb]]:border-2",
                "[&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_hsl(var(--primary)/0.2),0_2px_6px_rgba(0,0,0,0.5)]",
              )}
            />
            {/* Tickar + etiketter rakt under varje tumläge. Full opacitet på
                texten: /60 gav ~3.2:1 mot builder-bakgrunden och föll på
                WCAG 2 AA (4.5:1) i Vercel-toolbarens a11y-kontroll. */}
            <div className="relative mt-2 h-6" aria-hidden="true">
              {pageTicks.map((tick) => {
                const reached = tick <= choices.pageCount;
                const active = tick === choices.pageCount;
                return (
                  <span
                    key={tick}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                    style={{ left: tickLeft(tick, MAX_PAGE_COUNT_CHOICE) }}
                  >
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full transition-colors",
                        reached ? "bg-primary" : "bg-border",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px] leading-none tabular-nums transition-colors",
                        active ? "text-foreground font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {tick === 0 ? "Auto" : tick}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </ChoiceSection>

        <ChoiceSection icon={Gauge} label="Komplexitet">
          <ChoiceChipRow
            options={COMPLEXITY_OPTIONS}
            value={choices.complexity}
            onChange={(complexity) => applyChoices({ complexity })}
          />
        </ChoiceSection>

        <ChoiceSection icon={Brush} label="Stil">
          <ChoiceChipRow
            options={STYLE_OPTIONS}
            value={choices.style}
            onChange={(style) => applyChoices({ style })}
          />
        </ChoiceSection>

        <ChoiceSection icon={MessageCircle} label="Ton">
          <ChoiceChipRow
            options={TONE_OPTIONS}
            value={choices.tone}
            onChange={(tone) => applyChoices({ tone })}
          />
        </ChoiceSection>

        {onDesignThemeChange ? (
          <ChoiceSection icon={Palette} label="Färg">
            <ChoiceChipRow
              options={THEME_CHIP_OPTIONS}
              value={designTheme ?? "off"}
              onChange={(theme) => onDesignThemeChange(theme)}
              disabled={themeLocked}
              swatchFor={themeSwatchColor}
            />
          </ChoiceSection>
        ) : null}

        <ChoiceSection icon={SunMoon} label="Färgläge">
          <ChoiceChipRow
            options={COLOR_MODE_OPTIONS}
            value={choices.colorMode}
            onChange={(colorMode) => applyChoices({ colorMode })}
          />
        </ChoiceSection>
      </div>
    </div>
  );
}
