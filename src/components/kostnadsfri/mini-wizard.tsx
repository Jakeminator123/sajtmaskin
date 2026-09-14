"use client";

import { useState, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Target,
  Palette,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  ColorPalettePicker,
  type ColorPalette,
  PREDEFINED_PALETTES,
} from "@/components/forms/color-palette-picker";
import { LocationPicker } from "@/components/modals/location-picker";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import { prefillMiniWizardFromCompanyData } from "@/lib/kostnadsfri/wizard-prefill";
import {
  WIZARD_INDUSTRIES,
  WIZARD_PURPOSES,
  WIZARD_VIBES,
  type WizardIndustryId,
  type WizardPurposeId,
  type WizardVibeId,
} from "@/lib/builder/wizard-taxonomy";

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
// Id/label/desc ägs av `src/lib/builder/wizard-taxonomy.ts`. Emoji är UI-lager.

const INDUSTRY_EMOJIS: Record<WizardIndustryId, string> = {
  cafe: "☕",
  restaurant: "🍽️",
  retail: "🛍️",
  tech: "💻",
  consulting: "💼",
  health: "🏥",
  creative: "🎨",
  education: "📚",
  ecommerce: "🛒",
  realestate: "🏠",
  other: "✨",
};

const PURPOSE_EMOJIS: Record<WizardPurposeId, string> = {
  sell: "🛒",
  leads: "📧",
  portfolio: "🎨",
  inform: "📚",
  brand: "⭐",
  booking: "📅",
  conversion: "📈",
  rebrand: "🔄",
};

const VIBE_EMOJIS: Record<WizardVibeId, string> = {
  modern: "✨",
  playful: "🎨",
  brutalist: "🏗️",
  luxury: "💎",
  tech: "🚀",
  minimal: "◻️",
};

const INDUSTRY_OPTIONS = WIZARD_INDUSTRIES.map((industry) => ({
  id: industry.id,
  label: industry.label,
  icon: INDUSTRY_EMOJIS[industry.id],
}));

const PURPOSE_OPTIONS = WIZARD_PURPOSES.map((purpose) => ({
  id: purpose.id,
  label: purpose.label,
  desc: purpose.desc,
  icon: PURPOSE_EMOJIS[purpose.id],
}));

const VIBE_OPTIONS = WIZARD_VIBES.map((vibe) => ({
  id: vibe.id,
  label: vibe.label,
  icon: VIBE_EMOJIS[vibe.id],
}));

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/50 focus:outline-none";

const TOTAL_STEPS = 3;

// ── Component ────────────────────────────────────────────────────

interface MiniWizardProps {
  companyData: KostnadsfriCompanyData;
  onComplete: (data: MiniWizardData) => void;
  error?: string | null;
}

export function MiniWizard({ companyData, onComplete, error }: MiniWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1: About — förifyllt från kampanjrad + profil, allt går att rätta
  const prefill = prefillMiniWizardFromCompanyData(companyData);
  const [companyName, setCompanyName] = useState(prefill.companyName);
  const [industry, setIndustry] = useState(prefill.industry);
  const [website, setWebsite] = useState(prefill.website);
  const [location, setLocation] = useState(prefill.location);
  const [description, setDescription] = useState(prefill.description);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/90 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-gray-800/60 bg-gray-950 shadow-2xl">
        {/* Progress bar */}
        <div className="flex items-center justify-between border-b border-gray-800/60 px-6 py-4">
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
                        ? "text-brand-teal/50"
                        : "text-gray-600"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                      isActive
                        ? "border-brand-teal bg-brand-teal/10"
                        : isDone
                          ? "border-brand-teal/30 bg-brand-teal/5"
                          : "border-gray-700"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              );
            })}
          </div>
          <span className="text-xs text-gray-500">
            {step} / {TOTAL_STEPS}
          </span>
        </div>

        {/* Content area */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
          {/* Error display */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── STEP 1: About ────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-xl font-bold text-white">Om er</h2>
                <p className="text-sm text-gray-400">
                  Bekräfta och komplettera er företagsinformation
                </p>
              </div>

              {/* Company name (pre-filled, editable) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Företagsnamn
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Industry */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Bransch
                </label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setIndustry(opt.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                        industry === opt.id
                          ? "border-brand-teal bg-brand-teal/20 text-brand-teal"
                          : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Website (pre-filled if available, editable) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Befintlig webbplats
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Location */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Ort / Plats
                </label>
                <LocationPicker
                  value={location}
                  onLocationChange={(name) => setLocation(name)}
                  inputClassName={INPUT_CLASS}
                />
              </div>

              {/* Business description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Kort beskrivning av verksamheten
                </label>
                <textarea
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
                <h2 className="mb-1 text-xl font-bold text-white">Era mål</h2>
                <p className="text-sm text-gray-400">
                  Vad vill ni uppnå med er nya webbplats?
                </p>
              </div>

              {/* Purposes */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Huvudsakligt syfte (välj en eller flera)
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PURPOSE_OPTIONS.map((opt) => {
                    const isSelected = purposes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => togglePurpose(opt.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all ${
                          isSelected
                            ? "border-brand-teal bg-brand-teal/10 text-white"
                            : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white"
                        }`}
                      >
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-xs font-medium">{opt.label}</span>
                        <span className="text-[10px] text-gray-500">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target audience */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Målgrupp
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Vilka vill ni nå? t.ex. Företag i Norden, unga vuxna..."
                  className={INPUT_CLASS}
                />
              </div>

              {/* USP */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Vad gör er unika? (USP)
                </label>
                <textarea
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
                <h2 className="mb-1 text-xl font-bold text-white">Design</h2>
                <p className="text-sm text-gray-400">
                  Välj stil och färger för er webbplats
                </p>
              </div>

              {/* Design vibe */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Designstil
                </label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {VIBE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedVibe(opt.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                        selectedVibe === opt.id
                          ? "border-brand-teal bg-brand-teal/10 text-white"
                          : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white"
                      }`}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-[10px] font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color palette */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Färgpalett
                </label>
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
        <div className="flex items-center justify-between border-t border-gray-800/60 px-6 py-4">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nästa
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-brand-teal/90"
            >
              Skapa webbplats
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
