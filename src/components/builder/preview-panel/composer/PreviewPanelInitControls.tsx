"use client";

import {
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Brush,
  Check,
  ChevronDown,
  Files,
  Gauge,
  LayoutTemplate,
  MessageCircle,
  MonitorSmartphone,
  Moon,
  Palette,
  Sparkles,
  Sun,
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
import {
  inferBuildTargetFromDescription,
  suggestSiteLook,
} from "@/lib/builder/site-look-suggestion";
import {
  DESIGN_THEME_MOODS,
  DESIGN_THEME_OPTIONS,
  THEME_CLUSTERS,
  type DesignTheme,
  type ThemeClusterId,
  type ThemePalette,
} from "@/lib/builder/theme-presets";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  { value: "saas", label: "Mjukvarutjänst" },
  { value: "portfolio", label: "Portfolio" },
  { value: "blog", label: "Blogg" },
  { value: "shop", label: "Webbutik" },
  { value: "starter", label: "Enkel start" },
  { value: "dashboard", label: "Instrumentpanel" },
  { value: "appshell", label: "App-skal" },
  { value: "auth", label: "Inloggning" },
];

const COMPLEXITY_OPTIONS: Array<{ value: ComplexityChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "simple", label: "Enkel" },
  { value: "medium", label: "Lagom" },
  { value: "complex", label: "Komplex" },
];

// Svenska etiketter (UX-06). Värdena på tråden är oförändrade: `styleChoiceHint`
// och nyckelorden i `init-build-choices.ts` utgår från value, aldrig label.
const STYLE_OPTIONS: Array<{ value: StyleChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "warm", label: "Varm & lokal" },
  { value: "corporate", label: "Affärsmässig" },
  { value: "bold", label: "Uttrycksfull" },
  { value: "editorial", label: "Redaktionell" },
  { value: "minimal", label: "Minimalistisk" },
];

const TONE_OPTIONS: Array<{ value: ToneChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "professional", label: "Professionell" },
  { value: "warm", label: "Varm" },
  { value: "playful", label: "Lekfull" },
];

const COLOR_MODE_OPTIONS: Array<{
  value: ColorModeChoice;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}> = [
  { value: "auto", label: "Auto", icon: SunMoon },
  { value: "light", label: "Ljust", icon: Sun },
  { value: "dark", label: "Mörkt", icon: Moon },
];

/** Hela utbudet i spektrumordning (13 teman), utan "Auto". */
const ALL_THEME_IDS: ThemeClusterId[] = DESIGN_THEME_OPTIONS.filter(
  (option) => option.value !== "off" && option.value !== "custom",
).map((option) => option.value as ThemeClusterId);

function isThemeClusterId(theme: DesignTheme): theme is ThemeClusterId {
  return theme !== "off" && theme !== "custom";
}

function labelFor<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
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

/** One row of the control panel: a quiet icon + uppercase label header, then the control. */
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

// Fokus är en ljus ring med luft, aldrig blå: valt tillstånd är redan
// brand-blått, och en blå fokusring gick inte att skilja från valt-ramen
// (riggens bild F6, 2026-11-11). Samma markering på alla reglage i panelen.
const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card";

// Gemensam pillbas. Vald = fylld brand-blå med mörk text (samma kontrakt som
// primärknappen, låst av globals-token-contrast). Ovald = tyst, mörk pill.
// Alla vikter är lika så chippen inte byter bredd när valet flyttar sig.
const CHIP_BASE_CLASS = cn(
  "group h-8 gap-1.5 rounded-full border border-border/70 bg-background/50 px-3 text-xs font-medium text-muted-foreground shadow-none",
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
  "hover:border-border hover:bg-secondary hover:text-foreground",
  "focus-visible:border-border/70 data-[state=on]:focus-visible:border-primary",
  FOCUS_RING_CLASS,
  "active:scale-[0.98]",
);

const CHIP_ON_CLASS = cn(
  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
  "data-[state=on]:shadow-[0_0_0_3px_hsl(var(--primary)/0.22),0_8px_20px_-8px_hsl(var(--primary)/0.85)]",
  "data-[state=on]:hover:border-primary data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground",
);

interface ChoiceChipRowProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function ChoiceChipRow<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: ChoiceChipRowProps<T>) {
  const sectionLabelId = useContext(ChoiceSectionLabelContext);
  return (
    // Radix avmarkerar vid klick på ett redan aktivt val (tomt `next`) — vi
    // ignorerar det så exakt ett val alltid är aktivt.
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
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={cn(CHIP_BASE_CLASS, CHIP_ON_CLASS)}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
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

// ─────────────────────────────────────────────────────────────────────────
// Sidans utseende — palettkort
// ─────────────────────────────────────────────────────────────────────────

// Ett kort = en riktig miniatyr av sajten. Valt kort får brand-blå kant och en
// bock; fokus får en ljus ring med luft utanför kortet och ändrar inte kanten,
// så "fokus" och "valt" aldrig ser likadana ut.
const PALETTE_CARD_CLASS = cn(
  "group relative flex h-auto w-full min-w-0 flex-col items-stretch justify-start gap-1.5 rounded-xl border border-border/70 bg-background/40 p-1.5 text-left whitespace-normal shadow-none",
  "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
  "hover:border-border hover:bg-secondary/70 hover:text-foreground",
  "focus-visible:border-border/70 data-[state=on]:focus-visible:border-primary",
  FOCUS_RING_CLASS,
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground",
  "data-[state=on]:shadow-[0_0_0_1px_hsl(var(--primary)),0_10px_24px_-14px_hsl(var(--primary)/0.9)]",
  "data-[state=on]:hover:bg-primary/15",
);

const MINIATURE_CLASS = "flex min-h-[76px] w-full flex-col gap-1 rounded-lg border p-2";

function PaletteMiniature({ palette }: { palette: ThemePalette }) {
  // Verklig bakgrund, rubrik, brödtext och knapp ur temats palett — samma
  // strängar som `renderLockedColorPaletteBlock` låser i sajtens globals.css.
  // Värdena går in som CSS-variabler på roten och läses av klasserna nedan.
  const vars = {
    "--mini-bg": palette.background,
    "--mini-fg": palette.foreground,
    "--mini-muted": palette.muted,
    "--mini-muted-fg": palette.mutedForeground,
    "--mini-primary": palette.primary,
    "--mini-on-primary": palette.primaryForeground,
    "--mini-accent": palette.accent,
    "--mini-border": palette.border,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      data-palette-miniature=""
      className={cn(MINIATURE_CLASS, "border-[color:var(--mini-border)] bg-[color:var(--mini-bg)]")}
      style={vars}
    >
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-[color:var(--mini-accent)]" />
        <span className="h-1 w-6 rounded-full bg-[color:var(--mini-muted)]" />
      </span>
      <span className="text-[11px] leading-tight font-semibold text-[color:var(--mini-fg)]">
        Välkommen
      </span>
      <span className="text-[9px] leading-snug text-[color:var(--mini-muted-fg)]">
        Lugn och läsbar.
      </span>
      <span className="mt-0.5 w-fit rounded bg-[color:var(--mini-primary)] px-1.5 py-0.5 text-[9px] leading-none font-semibold text-[color:var(--mini-on-primary)]">
        Kontakt
      </span>
    </span>
  );
}

function CardCaption({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5" aria-hidden="true">
      <span className="text-foreground text-xs leading-tight font-medium">{title}</span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-[11px] leading-tight">
        {subtitle}
        {badge ? (
          <span className="bg-primary/15 text-primary rounded-full px-1.5 py-px text-[10px] font-semibold">
            {badge}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function SelectedMark() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-primary text-primary-foreground absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full",
        "opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-opacity duration-150 group-data-[state=on]:opacity-100",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

function PaletteCard({
  id,
  mode,
  suggested,
}: {
  id: ThemeClusterId;
  mode: "light" | "dark";
  suggested: boolean;
}) {
  const mood = DESIGN_THEME_MOODS[id];
  const hue = THEME_CLUSTERS[id].label;
  return (
    <ToggleGroupItem
      value={id}
      aria-label={`${mood}, ${hue}${suggested ? ", förslag" : ""}`}
      className={PALETTE_CARD_CLASS}
    >
      <PaletteMiniature palette={THEME_CLUSTERS[id][mode]} />
      <CardCaption title={mood} subtitle={hue} badge={suggested ? "Förslag" : null} />
      <SelectedMark />
    </ToggleGroupItem>
  );
}

function AiChoiceCard() {
  return (
    <ToggleGroupItem value="off" aria-label="Låt AI välja färger" className={PALETTE_CARD_CLASS}>
      <span
        aria-hidden="true"
        className={cn(
          MINIATURE_CLASS,
          "border-border items-center justify-center border-dashed bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),transparent_60%)] text-center",
        )}
      >
        <Sparkles className="text-primary size-4" />
        <span className="text-muted-foreground text-[10px] leading-tight">
          Färger ur beskrivningen
        </span>
      </span>
      <CardCaption title="Låt AI välja" subtitle="Standard" />
      <SelectedMark />
    </ToggleGroupItem>
  );
}

// Segmenterat reglage (Auto/Ljust/Mörkt) som sitter ihop som en pill.
const SEGMENT_CLASS = cn(
  "h-8 gap-1 border-border/70 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-none",
  // Samma variantprefix som ToggleGroupItems egna hörn, så twMerge ersätter dem.
  "data-[spacing=0]:first:rounded-l-full data-[spacing=0]:last:rounded-r-full",
  "hover:bg-secondary hover:text-foreground",
  "focus-visible:z-10 focus-visible:border-border/70 data-[state=on]:focus-visible:border-primary",
  FOCUS_RING_CLASS,
  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
  "data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground",
);

function summarizeMoreChoices(choices: InitBuildChoices, includeTarget: boolean): string {
  const parts: string[] = [];
  if (includeTarget && choices.buildTarget !== "auto") {
    parts.push(labelFor(BUILD_TARGET_OPTIONS, choices.buildTarget));
  }
  if (choices.siteType !== "auto") parts.push(labelFor(SITE_TYPE_OPTIONS, choices.siteType));
  if (choices.pageCount > 0) {
    parts.push(choices.pageCount === 1 ? "1 sida" : `${choices.pageCount} sidor`);
  }
  if (choices.complexity !== "auto") {
    parts.push(`Komplexitet: ${labelFor(COMPLEXITY_OPTIONS, choices.complexity)}`);
  }
  if (choices.style !== "auto") parts.push(`Stil: ${labelFor(STYLE_OPTIONS, choices.style)}`);
  if (choices.tone !== "auto") parts.push(`Ton: ${labelFor(TONE_OPTIONS, choices.tone)}`);
  return parts.length > 0 ? parts.join(" · ") : "Sajttyp, antal sidor, stil och ton – AI väljer";
}

export interface PreviewPanelInitControlsProps {
  /** Färgtema-preset — delar shell-state med genereringen (`designTheme`). */
  designTheme?: DesignTheme;
  onDesignThemeChange?: (theme: DesignTheme) => void;
  /** Låser palettvalet under streaming. */
  themeLocked?: boolean;
  /**
   * Användarens egen beskrivning (chattens utkast). Driver bara det lokala
   * förslaget och var Hemsida/App-valet visas — skickas aldrig vidare härifrån.
   */
  description?: string;
  /**
   * Startar första bygget som chattens skicka-knapp. Utelämnad → ingen knapp;
   * då startar man med pilen i chatten som förut.
   */
  onStart?: (() => void) | null;
}

/**
 * Byggval i välkomstläget, med "Sidans utseende" som första nivå.
 *
 * Varje val är strukturerat kopplat (request-meta + custom-instructions-kanalen)
 * via den delade storen → `useCreateChat`; inget skrivs in i chattens synliga
 * input. Palettkorten redigerar den delade `designTheme`-shell-staten direkt.
 * Förslaget räknas lokalt ur beskrivningen och skickas aldrig — bygget får
 * exakt det som är markerat här.
 */
export function PreviewPanelInitControls({
  designTheme,
  onDesignThemeChange,
  themeLocked = false,
  description = "",
  onStart = null,
}: PreviewPanelInitControlsProps) {
  // State initieras från den delade storen: panelen av-/ommonteras när
  // välkomstläget döljs under en skapning, och vid en MISSLYCKAD skapning
  // ska den ommonterade panelen visa användarens tidigare val.
  const [choices, setChoices] = useState<InitBuildChoices>(() => getCurrentInitBuildChoices());
  // Senaste valen i en ref: två snabba ändringar i samma render-batch kan inte
  // skriva över varandra via en stale render-scoped `choices`.
  const latestChoicesRef = useRef<InitBuildChoices>(choices);
  const [showAllColors, setShowAllColors] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const lookTitleId = useId();
  const modeLabelId = useId();
  const allColorsId = useId();

  const applyChoices = (partial: Partial<InitBuildChoices>) => {
    const next = { ...latestChoicesRef.current, ...partial };
    latestChoicesRef.current = next;
    setChoices(next);
    setCurrentInitBuildChoices(next);
  };

  const suggestion = useMemo(() => suggestSiteLook(description), [description]);
  const inferredTarget = useMemo(() => inferBuildTargetFromDescription(description), [description]);
  // Oklar beskrivning → Hemsida/App stannar på första nivån (inte gömd).
  const targetOnFirstLevel = inferredTarget === null;

  const selectedTheme: DesignTheme = designTheme ?? "off";
  // Det valda temat syns alltid på första nivån: valt ur "Fler färger" och
  // utanför förslagstrion → tar trions sista plats när listan fälls ihop.
  const featuredThemes = useMemo(() => {
    const trio: ThemeClusterId[] = [...suggestion.themes];
    if (!showAllColors && isThemeClusterId(selectedTheme) && !trio.includes(selectedTheme)) {
      trio[2] = selectedTheme;
    }
    return trio;
  }, [suggestion.themes, showAllColors, selectedTheme]);
  const extraThemes = ALL_THEME_IDS.filter((id) => !featuredThemes.includes(id));
  // Korten ritas i det läge bygget faktiskt får: Mörkt → mörk palett, annars
  // ljus (Auto blir ljust om inte varianten är mörk, se resolveThemePalette).
  const previewMode: "light" | "dark" = choices.colorMode === "dark" ? "dark" : "light";
  const suggestedTheme = suggestion.matched ? suggestion.themes[0] : null;
  const suggestedMode =
    suggestion.colorMode && choices.colorMode === "auto" ? suggestion.colorMode : null;

  const pageCountLabel =
    choices.pageCount === 0
      ? "Auto"
      : choices.pageCount === 1
        ? "1 sida"
        : `${choices.pageCount} sidor`;

  // Hemsida och App delar inte scaffolds: erbjud bara sajttyper som målet stöder.
  const siteTypeOptions = SITE_TYPE_OPTIONS.filter((option) =>
    isSiteTypeAllowedForTarget(option.value, choices.buildTarget),
  );

  // Byte av mål kan strandsätta sajttypen på ett dolt chip. Nollställ i samma
  // uppdatering så storen aldrig håller en kombination UI:t slutat visa.
  const applyBuildTarget = (buildTarget: BuildTargetChoice) => {
    const siteType = isSiteTypeAllowedForTarget(choices.siteType, buildTarget)
      ? choices.siteType
      : ("auto" as SiteTypeChoice);
    applyChoices({ buildTarget, siteType });
  };

  const pageTicks = Array.from({ length: MAX_PAGE_COUNT_CHOICE + 1 }, (_, index) => index);
  const moreSummary = summarizeMoreChoices(choices, !targetOnFirstLevel);

  const buildTargetSection = (
    <ChoiceSection icon={MonitorSmartphone} label="Hemsida eller app">
      <ChoiceChipRow
        options={BUILD_TARGET_OPTIONS}
        value={choices.buildTarget}
        onChange={applyBuildTarget}
      />
    </ChoiceSection>
  );

  return (
    <div
      className={cn(
        "border-border/60 bg-card/70 @container rounded-2xl border text-left backdrop-blur-sm",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_30px_60px_-30px_rgba(0,0,0,0.85)]",
      )}
    >
      <div className="divide-border/50 divide-y px-4">
        {/* ── Sidans utseende ─────────────────────────────────────────── */}
        <section aria-labelledby={lookTitleId} className="pt-4 pb-4">
          <div className="flex items-center gap-2">
            <Palette className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
            <h3 id={lookTitleId} className="text-foreground text-sm font-semibold tracking-tight">
              Sidans utseende
            </h3>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Färgerna gäller hemsidan du bygger, inte arbetsytan här.
          </p>
          {suggestedTheme && onDesignThemeChange ? (
            <p className="text-foreground/90 mt-2 flex items-start gap-1.5 text-xs leading-relaxed">
              <Sparkles className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Förslag utifrån din beskrivning
                {suggestion.basis ? ` (${suggestion.basis})` : ""}:{" "}
                <span className="font-semibold">{DESIGN_THEME_MOODS[suggestedTheme]}</span>
                {suggestion.colorMode
                  ? `, ${suggestion.colorMode === "dark" ? "mörkt" : "ljust"}`
                  : ""}
                .
              </span>
            </p>
          ) : null}

          {onDesignThemeChange ? (
            <ToggleGroup
              type="single"
              aria-label="Färgpalett"
              value={selectedTheme}
              onValueChange={(next) => {
                if (next) onDesignThemeChange(next as DesignTheme);
              }}
              disabled={themeLocked}
              spacing={2}
              className="mt-3 w-full flex-col items-stretch gap-2"
            >
              <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
                <AiChoiceCard />
                {featuredThemes.map((id) => (
                  <PaletteCard
                    key={id}
                    id={id}
                    mode={previewMode}
                    suggested={id === suggestedTheme}
                  />
                ))}
              </div>
              {showAllColors ? (
                <div id={allColorsId} className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
                  {extraThemes.map((id) => (
                    <PaletteCard
                      key={id}
                      id={id}
                      mode={previewMode}
                      suggested={id === suggestedTheme}
                    />
                  ))}
                </div>
              ) : null}
            </ToggleGroup>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {onDesignThemeChange ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showAllColors}
                aria-controls={showAllColors ? allColorsId : undefined}
                onClick={() => setShowAllColors((open) => !open)}
                className={cn(
                  "text-muted-foreground hover:bg-secondary hover:text-foreground -ml-2 h-8 px-2 text-xs",
                  FOCUS_RING_CLASS,
                )}
              >
                {/* Siffran = antalet som fälls ut, inte totalen (tre syns redan). */}
                {showAllColors ? "Färre färger" : `Fler färger (${extraThemes.length})`}
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showAllColors && "rotate-180")}
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <span id={modeLabelId} className="text-muted-foreground text-xs">
                Färgläge
              </span>
              <ToggleGroup
                type="single"
                aria-labelledby={modeLabelId}
                value={choices.colorMode}
                onValueChange={(next) => {
                  if (next) applyChoices({ colorMode: next as ColorModeChoice });
                }}
                variant="outline"
                size="sm"
                spacing={0}
              >
                {COLOR_MODE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSuggested = suggestedMode === option.value;
                  return (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      aria-label={isSuggested ? `${option.label}, förslag` : option.label}
                      className={SEGMENT_CLASS}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {option.label}
                      {isSuggested ? (
                        <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
                      ) : null}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          </div>
          {choices.colorMode === "auto" ? (
            <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
              Auto blir ljust, om inte AI väljer en mörk stil.
            </p>
          ) : null}
        </section>

        {targetOnFirstLevel ? buildTargetSection : null}

        {/* ── Fler byggval ────────────────────────────────────────────── */}
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left",
                "hover:bg-secondary/50 transition-colors",
                FOCUS_RING_CLASS,
              )}
            >
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-medium">Fler byggval</span>
                <span className="text-muted-foreground line-clamp-2 block text-xs leading-snug">
                  {moreSummary}
                </span>
              </span>
              <ChevronDown
                className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="divide-border/50 border-border/50 divide-y border-t">
            {targetOnFirstLevel ? null : buildTargetSection}

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
                {/* Full opacitet på texten: /60 föll på WCAG 2 AA (4.5:1). */}
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
          </CollapsibleContent>
        </Collapsible>

        {/* ── Start ───────────────────────────────────────────────────── */}
        {onStart ? (
          <div className="py-4">
            <Button
              type="button"
              size="lg"
              className={cn("w-full", FOCUS_RING_CLASS)}
              onClick={onStart}
            >
              Skapa första utkastet
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <p className="text-muted-foreground mt-2 text-center text-xs leading-snug">
              Bygget använder din beskrivning i chatten och valen ovan.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
