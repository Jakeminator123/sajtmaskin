"use client";

import { useState, useCallback, useId } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Target,
  Palette,
  Check,
  AlertCircle,
  ChevronDown,
  Film,
} from "lucide-react";
import {
  ColorPalettePicker,
  type ColorPalette,
  PREDEFINED_PALETTES,
} from "@/components/forms/color-palette-picker";
import { LocationPicker } from "@/components/modals/location-picker";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import { IntroVideo } from "./intro-video";

/**
 * MiniWizard — 3-step wizard for the kostnadsfri flow.
 *
 * Step 1: About the company (some pre-filled, some user fills in)
 * Step 2: Goals (purpose, audience, USP)
 * Step 3: Design (style, color palette)
 *
 * Uses the same visual style as PromptWizardModalV2.
 */

// ── Constants ────────────────────────────────────────────────────

const INDUSTRY_OPTIONS = [
  { id: "cafe", label: "Café/Konditori", icon: "☕" },
  { id: "restaurant", label: "Restaurang/Bar", icon: "🍽️" },
  { id: "retail", label: "Butik/Detaljhandel", icon: "🛍️" },
  { id: "tech", label: "Tech/IT-företag", icon: "💻" },
  { id: "consulting", label: "Konsult/Tjänster", icon: "💼" },
  { id: "health", label: "Hälsa/Wellness", icon: "🏥" },
  { id: "creative", label: "Kreativ byrå", icon: "🎨" },
  { id: "education", label: "Utbildning", icon: "📚" },
  { id: "ecommerce", label: "E-handel", icon: "🛒" },
  { id: "realestate", label: "Fastigheter", icon: "🏠" },
  { id: "other", label: "Annat", icon: "✨" },
];

const PURPOSE_OPTIONS = [
  { id: "sell", label: "Sälja", icon: "🛒", desc: "Produkter/tjänster" },
  { id: "leads", label: "Leads", icon: "📧", desc: "Fånga kontakter" },
  { id: "portfolio", label: "Portfolio", icon: "🎨", desc: "Visa arbeten" },
  { id: "inform", label: "Informera", icon: "📚", desc: "Dela kunskap" },
  { id: "brand", label: "Varumärke", icon: "⭐", desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", icon: "📅", desc: "Ta emot bokningar" },
  { id: "conversion", label: "Konvertering", icon: "📈", desc: "Öka konvertering" },
  { id: "rebrand", label: "Rebrand", icon: "🔄", desc: "Ny identitet" },
];

const VIBE_OPTIONS = [
  { id: "modern", label: "Modern & Clean", icon: "✨" },
  { id: "playful", label: "Playful & Fun", icon: "🎨" },
  { id: "brutalist", label: "Brutalist", icon: "🏗️" },
  { id: "luxury", label: "Luxury", icon: "💎" },
  { id: "tech", label: "Futuristic", icon: "🚀" },
  { id: "minimal", label: "Minimal", icon: "◻️" },
];

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground transition-colors focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 focus:outline-none";

const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-card-foreground";

const CHIP_CLASS =
  "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none";

const TILE_CLASS =
  "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none";

const TOTAL_STEPS = 3;

// ── Component ────────────────────────────────────────────────────

interface MiniWizardProps {
  companyData: KostnadsfriCompanyData;
  onComplete: (data: MiniWizardData) => void;
  error?: string | null;
}

export function MiniWizard({ companyData, onComplete, error }: MiniWizardProps) {
  const [step, setStep] = useState(1);
  const [showIntro, setShowIntro] = useState(false);
  const introPanelId = useId();
  const descriptionId = useId();
  const audienceId = useId();
  const uspId = useId();

  // Step 1: About
  const [companyName] = useState(companyData.companyName);
  const [industry, setIndustry] = useState(companyData.industry || "");
  const [website] = useState(companyData.website || "");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Goals
  const [purposes, setPurposes] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");
  const [usp, setUsp] = useState("");

  // Step 3: Design
  const [selectedVibe, setSelectedVibe] = useState("modern");
  const [selectedPalette, setSelectedPalette] = useState<ColorPalette | null>(
    PREDEFINED_PALETTES[0],
  );
  const [customColors, setCustomColors] = useState<{
    primary: string;
    secondary: string;
    accent: string;
  } | null>(null);

  // ── Step validation ──────────────────────────────────────────

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return companyName.trim().length > 0;
      case 2:
        return purposes.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, companyName, purposes]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep(step - 1);
    }
  }, [step]);

  const handleComplete = useCallback(() => {
    const data: MiniWizardData = {
      companyName,
      industry,
      website,
      location,
      description,
      purposes,
      targetAudience,
      usp,
      designVibe: selectedVibe,
      paletteName: selectedPalette?.name || null,
      colorPrimary: customColors?.primary || selectedPalette?.primary || null,
      colorSecondary: customColors?.secondary || selectedPalette?.secondary || null,
      colorAccent: customColors?.accent || selectedPalette?.accent || null,
    };
    onComplete(data);
  }, [
    companyName, industry, website, location, description,
    purposes, targetAudience, usp, selectedVibe,
    selectedPalette, customColors, onComplete,
  ]);

  const handleCustomColorChange = useCallback(
    (type: "primary" | "secondary" | "accent", color: string) => {
      setCustomColors((prev) => ({
        primary: prev?.primary || "#000000",
        secondary: prev?.secondary || "#333333",
        accent: prev?.accent || "#2dd4bf",
        [type]: color,
      }));
    },
    [],
  );

  const togglePurpose = useCallback((id: string) => {
    setPurposes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  // ── Step icons for progress ──────────────────────────────────

  const stepConfig = [
    { icon: Building2, label: "Om er" },
    { icon: Target, label: "Era mål" },
    { icon: Palette, label: "Design" },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    // z-[60]: the Sajtagenten teaser/bubble (OpenClawChat) is fixed at z-50 and
    // used to sit on top of the wizard footer, stealing the click on "Nästa".
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background/92 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
        {/* Progress bar */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-6">
            {stepConfig.map((s, i) => {
              const StepIcon = s.icon;
              const isActive = step === i + 1;
              const isDone = step > i + 1;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    isActive
                      ? "text-brand-teal"
                      : isDone
                        ? "text-brand-teal/60"
                        : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                      isActive
                        ? "border-brand-teal bg-brand-teal/10"
                        : isDone
                          ? "border-brand-teal/30 bg-brand-teal/5"
                          : "border-border"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <StepIcon className="h-4 w-4" aria-hidden />
                    )}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">
            {step} / {TOTAL_STEPS}
          </span>
        </div>

        {/* Content area */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
          {/* Error display */}
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {/* Low-key way back to the intro film — collapsed so it never
              competes with the questions. */}
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setShowIntro((prev) => !prev)}
              aria-expanded={showIntro}
              aria-controls={introPanelId}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
            >
              <Film className="h-3.5 w-3.5" aria-hidden />
              Se filmen igen
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showIntro ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <div id={introPanelId} hidden={!showIntro}>
              {showIntro && <IntroVideo className="mt-3" compact />}
            </div>
          </div>

          {/* ── STEP 1: About ────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-xl font-(--font-heading) tracking-tight text-card-foreground">
                  Om er
                </h2>
                <p className="text-sm text-muted-foreground">
                  Bekräfta och komplettera er företagsinformation
                </p>
              </div>

              {/* Company name (pre-filled, read-only) */}
              <div>
                <label htmlFor="kostnadsfri-company-name" className={LABEL_CLASS}>
                  Företagsnamn
                </label>
                <input
                  id="kostnadsfri-company-name"
                  type="text"
                  value={companyName}
                  readOnly
                  className={INPUT_CLASS + " cursor-default opacity-70"}
                />
              </div>

              {/* Industry */}
              <fieldset>
                <legend className={LABEL_CLASS}>Bransch</legend>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={industry === opt.id}
                      onClick={() => setIndustry(opt.id)}
                      className={`${CHIP_CLASS} ${
                        industry === opt.id
                          ? "border-brand-teal bg-brand-teal/15 text-brand-teal"
                          : "border-border text-muted-foreground hover:border-brand-teal/40 hover:text-foreground"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Website (pre-filled if available) */}
              {website && (
                <div>
                  <label htmlFor="kostnadsfri-website" className={LABEL_CLASS}>
                    Befintlig webbplats
                  </label>
                  <input
                    id="kostnadsfri-website"
                    type="text"
                    value={website}
                    readOnly
                    className={INPUT_CLASS + " cursor-default opacity-70"}
                  />
                </div>
              )}

              {/* Location. LocationPicker owns its own input element and takes
                  no id, so this stays a standalone caption rather than a label
                  pointing at nothing. */}
              <div>
                <p className={LABEL_CLASS}>Ort / Plats</p>
                <LocationPicker
                  value={location}
                  onLocationChange={(name) => setLocation(name)}
                  inputClassName={INPUT_CLASS}
                />
              </div>

              {/* Business description */}
              <div>
                <label htmlFor={descriptionId} className={LABEL_CLASS}>
                  Kort beskrivning av verksamheten
                </label>
                <textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beskriv vad ni gör och vad som gör er unika..."
                  rows={3}
                  className={INPUT_CLASS + " resize-none"}
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Goals ────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-xl font-(--font-heading) tracking-tight text-card-foreground">
                  Era mål
                </h2>
                <p className="text-sm text-muted-foreground">
                  Vad vill ni uppnå med er nya webbplats?
                </p>
              </div>

              {/* Purposes */}
              <fieldset>
                <legend className={LABEL_CLASS}>Huvudsakligt syfte (välj en eller flera)</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PURPOSE_OPTIONS.map((opt) => {
                    const isSelected = purposes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => togglePurpose(opt.id)}
                        className={`${TILE_CLASS} ${
                          isSelected
                            ? "border-brand-teal bg-brand-teal/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-brand-teal/40 hover:text-foreground"
                        }`}
                      >
                        <span className="text-lg" aria-hidden>
                          {opt.icon}
                        </span>
                        <span className="text-xs font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Target audience */}
              <div>
                <label htmlFor={audienceId} className={LABEL_CLASS}>
                  Målgrupp
                </label>
                <input
                  id={audienceId}
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Vilka vill ni nå? t.ex. Företag i Norden, unga vuxna..."
                  className={INPUT_CLASS}
                />
              </div>

              {/* USP */}
              <div>
                <label htmlFor={uspId} className={LABEL_CLASS}>
                  Vad gör er unika? (USP)
                </label>
                <textarea
                  id={uspId}
                  value={usp}
                  onChange={(e) => setUsp(e.target.value)}
                  placeholder="Vad skiljer er från konkurrenterna?"
                  rows={2}
                  className={INPUT_CLASS + " resize-none"}
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: Design ───────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-xl font-(--font-heading) tracking-tight text-card-foreground">
                  Design
                </h2>
                <p className="text-sm text-muted-foreground">
                  Välj stil och färger för er webbplats
                </p>
              </div>

              {/* Design vibe */}
              <fieldset>
                <legend className={LABEL_CLASS}>Designstil</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {VIBE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selectedVibe === opt.id}
                      onClick={() => setSelectedVibe(opt.id)}
                      className={`${TILE_CLASS} gap-1.5 ${
                        selectedVibe === opt.id
                          ? "border-brand-teal bg-brand-teal/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-brand-teal/40 hover:text-foreground"
                      }`}
                    >
                      <span className="text-xl" aria-hidden>
                        {opt.icon}
                      </span>
                      <span className="text-[10px] font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Color palette */}
              <div>
                <p className={LABEL_CLASS}>Färgpalett</p>
                <ColorPalettePicker
                  selectedPalette={selectedPalette}
                  onSelect={setSelectedPalette}
                  customColors={customColors ?? undefined}
                  onCustomColorChange={handleCustomColorChange}
                  industry={industry}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Tillbaka
          </button>

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-brand-teal/90 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nästa
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-brand-teal/90 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
            >
              Skapa webbplats
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
