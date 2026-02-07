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
  getIndustryPalettes,
} from "@/components/forms/color-palette-picker";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";

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
  { id: "cafe", label: "Cafe/Konditori", icon: "☕" },
  { id: "restaurant", label: "Restaurang/Bar", icon: "🍽️" },
  { id: "retail", label: "Butik/Detaljhandel", icon: "🛍️" },
  { id: "tech", label: "Tech/IT-foretag", icon: "💻" },
  { id: "consulting", label: "Konsult/Tjanster", icon: "💼" },
  { id: "health", label: "Halsa/Wellness", icon: "🏥" },
  { id: "creative", label: "Kreativ byra", icon: "🎨" },
  { id: "education", label: "Utbildning", icon: "📚" },
  { id: "ecommerce", label: "E-handel", icon: "🛒" },
  { id: "realestate", label: "Fastigheter", icon: "🏠" },
  { id: "other", label: "Annat", icon: "✨" },
];

const PURPOSE_OPTIONS = [
  { id: "sell", label: "Salja", icon: "🛒", desc: "Produkter/tjanster" },
  { id: "leads", label: "Leads", icon: "📧", desc: "Fanga kontakter" },
  { id: "portfolio", label: "Portfolio", icon: "🎨", desc: "Visa arbeten" },
  { id: "inform", label: "Informera", icon: "📚", desc: "Dela kunskap" },
  { id: "brand", label: "Varumarke", icon: "⭐", desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", icon: "📅", desc: "Ta emot bokningar" },
  { id: "conversion", label: "Konvertering", icon: "📈", desc: "Oka konvertering" },
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
    { icon: Target, label: "Era mal" },
    { icon: Palette, label: "Design" },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 px-4 py-8 backdrop-blur-sm">
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
                  Bekrafta och komplettera er foretagsinformation
                </p>
              </div>

              {/* Company name (pre-filled, read-only) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Foretagsnamn
                </label>
                <input
                  type="text"
                  value={companyName}
                  readOnly
                  className={INPUT_CLASS + " cursor-default opacity-70"}
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

              {/* Website (pre-filled if available) */}
              {website && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-300">
                    Befintlig webbplats
                  </label>
                  <input
                    type="text"
                    value={website}
                    readOnly
                    className={INPUT_CLASS + " cursor-default opacity-70"}
                  />
                </div>
              )}

              {/* Location */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Ort / Plats
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="t.ex. Stockholm, Malmo, Goteborg..."
                  className={INPUT_CLASS}
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
                  placeholder="Beskriv vad ni gor och vad som gor er unika..."
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
                <h2 className="mb-1 text-xl font-bold text-white">Era mal</h2>
                <p className="text-sm text-gray-400">
                  Vad vill ni uppna med er nya webbplats?
                </p>
              </div>

              {/* Purposes */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Huvudsakligt syfte (valj en eller flera)
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
                  Malgrupp
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Vilka vill ni na? t.ex. Foretag i Norden, unga vuxna..."
                  className={INPUT_CLASS}
                />
              </div>

              {/* USP */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Vad gor er unika? (USP)
                </label>
                <textarea
                  value={usp}
                  onChange={(e) => setUsp(e.target.value)}
                  placeholder="Vad skiljer er fran konkurrenterna?"
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
                  Valj stil och farger for er webbplats
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
                  Fargpalett
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
              Nasta
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
