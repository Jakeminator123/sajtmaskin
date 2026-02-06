"use client";

import { useState, useCallback } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Wand2,
  Palette,
  Loader2,
  Check,
  Globe,
  Lightbulb,
  RotateCcw,
  Rocket,
  Mic,
  Building2,
  Target,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ColorPalettePicker,
  type ColorPalette,
  PREDEFINED_PALETTES,
  getIndustryPalettes,
} from "@/components/forms/color-palette-picker";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { buildIntentNoun } from "@/lib/builder/build-intent";
import type { BuildIntent } from "@/lib/builder/build-intent";

/**
 * PromptWizardModal V2 - Streamlined Business Analysis Wizard
 *
 * OPTIMIZED: Reduced from 11 to 5 focused steps:
 * 1. About You (Company + Industry + Location combined)
 * 2. Your Goals (Purpose + Target Audience combined)
 * 3. Existing Site & Inspiration (combined)
 * 4. Design Preferences (Component styles + Color palette combined)
 * 5. Review & Generate (Special wishes + Voice + Final edit)
 *
 * Each step is more comprehensive but less overwhelming.
 */

// Industry options with suggested audience and features
const INDUSTRY_OPTIONS = [
  {
    id: "cafe",
    label: "Café/Konditori",
    icon: "☕",
    suggestedAudience: "Kaffeälskare och fika-entusiaster i närområdet",
    suggestedFeatures: ["Meny", "Öppettider", "Bildgalleri", "Bordbokning"],
  },
  {
    id: "restaurant",
    label: "Restaurang/Bar",
    icon: "🍽️",
    suggestedAudience: "Matälskare, par och grupper som söker upplevelser",
    suggestedFeatures: ["Meny", "Bordbokning", "Events", "Chef's specials"],
  },
  {
    id: "retail",
    label: "Butik/Detaljhandel",
    icon: "🛍️",
    suggestedAudience: "Shoppingintresserade som söker kvalitet",
    suggestedFeatures: ["Produktkatalog", "Erbjudanden", "Hitta butik"],
  },
  {
    id: "tech",
    label: "Tech/IT-företag",
    icon: "💻",
    suggestedAudience: "Företag och startups som behöver digitala lösningar",
    suggestedFeatures: ["Tjänster", "Case studies", "Prissättning"],
  },
  {
    id: "consulting",
    label: "Konsult/Tjänster",
    icon: "💼",
    suggestedAudience: "Företag som behöver experthjälp",
    suggestedFeatures: ["Tjänster", "Team", "Kontakt", "Testimonials"],
  },
  {
    id: "health",
    label: "Hälsa/Wellness",
    icon: "🏥",
    suggestedAudience: "Hälsomedvetna individer som söker välmående",
    suggestedFeatures: ["Behandlingar", "Onlinebokning", "Prislista"],
  },
  {
    id: "creative",
    label: "Kreativ byrå",
    icon: "🎨",
    suggestedAudience: "Företag som behöver kreativa lösningar",
    suggestedFeatures: ["Portfolio", "Tjänster", "Process", "Kontakt"],
  },
  {
    id: "education",
    label: "Utbildning",
    icon: "📚",
    suggestedAudience: "Studenter och yrkesverksamma som vill lära sig",
    suggestedFeatures: ["Kurser", "Schema", "Anmälan", "Lärare"],
  },
  {
    id: "ecommerce",
    label: "E-handel",
    icon: "🛒",
    suggestedAudience: "Onlineshoppare som söker bekvämlighet",
    suggestedFeatures: ["Produkter", "Varukorg", "Checkout", "Recensioner"],
  },
  {
    id: "realestate",
    label: "Fastigheter",
    icon: "🏠",
    suggestedAudience: "Bostadssökare och säljare",
    suggestedFeatures: ["Objekt", "Sök/Filter", "Kontakt", "Värdering"],
  },
  {
    id: "other",
    label: "Annat",
    icon: "✨",
    suggestedAudience: "",
    suggestedFeatures: [],
  },
];

// Purpose options with descriptions
const PURPOSE_OPTIONS = [
  { id: "sell", label: "Sälja", icon: "🛒", desc: "Produkter/tjänster" },
  { id: "leads", label: "Leads", icon: "📧", desc: "Fånga kontakter" },
  { id: "portfolio", label: "Portfolio", icon: "🎨", desc: "Visa arbeten" },
  { id: "inform", label: "Informera", icon: "📚", desc: "Dela kunskap" },
  { id: "brand", label: "Varumärke", icon: "⭐", desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", icon: "📅", desc: "Ta emot bokningar" },
];

// Design vibe options
const VIBE_OPTIONS = [
  { id: "modern", label: "Modern & Clean", icon: "✨" },
  { id: "playful", label: "Playful & Fun", icon: "🎨" },
  { id: "brutalist", label: "Brutalist", icon: "🏗️" },
  { id: "luxury", label: "Luxury", icon: "💎" },
  { id: "tech", label: "Futuristic", icon: "🚀" },
  { id: "minimal", label: "Minimal", icon: "◻️" },
];

export interface ComponentChoices {
  hero: string;
  navigation: string;
  layout: string;
  effects: string;
  vibe: string;
}

export interface WizardData {
  companyName: string;
  industry: string;
  location: string;
  existingWebsite: string;
  siteLikes: string[];
  siteDislikes: string[];
  siteOtherFeedback: string;
  inspirationSites: string[];
  purposes: string[];
  targetAudience: string;
  specialWishes: string;
  palette: ColorPalette | null;
  customColors: { primary: string; secondary: string; accent: string } | null;
  voiceTranscript?: string;
  componentChoices?: ComponentChoices;
  industryTrends?: string;
  websiteAnalysis?: string;
}

interface PromptWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: WizardData, expandedPrompt: string) => void;
  initialPrompt?: string;
  categoryType?: string;
  buildIntent?: BuildIntent;
}

export function PromptWizardModalV2({
  isOpen,
  onClose,
  onComplete,
  initialPrompt = "",
  categoryType = "website",
  buildIntent = "website",
}: PromptWizardModalProps) {
  // Current step (1-5)
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Loading states
  const [isExpanding, setIsExpanding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated prompt state
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [showEditMode, setShowEditMode] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: About You
  // ═══════════════════════════════════════════════════════════════
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Your Goals
  // ═══════════════════════════════════════════════════════════════
  const [purposes, setPurposes] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Existing Site & Inspiration
  // ═══════════════════════════════════════════════════════════════
  const [existingWebsite, setExistingWebsite] = useState("");
  const [siteFeedback, setSiteFeedback] = useState("");
  const [inspirationSites, setInspirationSites] = useState<string[]>([""]);
  const [websiteAnalysis, setWebsiteAnalysis] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Design Preferences
  // ═══════════════════════════════════════════════════════════════
  const [selectedVibe, setSelectedVibe] = useState("modern");
  const [selectedPalette, setSelectedPalette] = useState<ColorPalette | null>(
    PREDEFINED_PALETTES[0],
  );
  const [customColors, setCustomColors] = useState<{
    primary: string;
    secondary: string;
    accent: string;
  } | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Special Wishes & Generate
  // ═══════════════════════════════════════════════════════════════
  const [specialWishes, setSpecialWishes] = useState(initialPrompt);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // Get current industry data
  const currentIndustry = INDUSTRY_OPTIONS.find((i) => i.id === industry);

  // Toggle purpose selection
  const togglePurpose = useCallback((purposeId: string) => {
    setPurposes((prev) =>
      prev.includes(purposeId) ? prev.filter((p) => p !== purposeId) : [...prev, purposeId],
    );
  }, []);

  // Handle industry change - auto-suggest audience
  const handleIndustryChange = useCallback((newIndustry: string) => {
    setIndustry(newIndustry);
    const industryData = INDUSTRY_OPTIONS.find((i) => i.id === newIndustry);
    if (industryData?.suggestedAudience) {
      setTargetAudience(industryData.suggestedAudience);
    }
    // Update palette based on industry
    const industryPalettes = getIndustryPalettes(newIndustry);
    if (industryPalettes.length > 0) {
      setSelectedPalette(industryPalettes[0]);
    }
  }, []);

  // Add inspiration site
  const addInspirationSite = useCallback(() => {
    if (inspirationSites.length < 3) {
      setInspirationSites((prev) => [...prev, ""]);
    }
  }, [inspirationSites.length]);

  // Update inspiration site
  const updateInspirationSite = useCallback((index: number, value: string) => {
    setInspirationSites((prev) => {
      const newSites = [...prev];
      newSites[index] = value;
      return newSites;
    });
  }, []);

  // Analyze existing website
  const analyzeWebsite = useCallback(async () => {
    if (!existingWebsite) return;

    setIsAnalyzing(true);
    try {
      const url = existingWebsite.startsWith("http")
        ? existingWebsite
        : `https://${existingWebsite}`;
      const response = await fetch("/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setWebsiteAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("Failed to analyze website:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [existingWebsite]);

  // Check if we can proceed to next step
  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return companyName.trim().length >= 2 && industry.length > 0;
      case 2:
        return purposes.length > 0;
      case 3:
        return true; // Optional step
      case 4:
        return selectedPalette !== null || customColors !== null;
      case 5:
        return true; // Can always proceed
      default:
        return true;
    }
  }, [step, companyName, industry, purposes, selectedPalette, customColors]);

  // Handle step navigation
  const handleNext = useCallback(() => {
    if (step < totalSteps) {
      setStep((prev) => prev + 1);
      // Trigger analysis when moving from step 3
      if (step === 3 && existingWebsite && !websiteAnalysis) {
        analyzeWebsite();
      }
    }
  }, [step, existingWebsite, websiteAnalysis, analyzeWebsite]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  }, [step]);

  // Generate a deterministic prompt (no preprompting/orchestrator)
  const handleGenerate = useCallback(() => {
    setIsExpanding(true);
    setError(null);

    const componentChoices: ComponentChoices = {
      hero: "geometric",
      navigation: "sticky",
      layout: "sections",
      effects: "scroll",
      vibe: selectedVibe,
    };

    const wizardData: WizardData = {
      companyName,
      industry,
      location,
      existingWebsite,
      siteLikes: [],
      siteDislikes: [],
      siteOtherFeedback: siteFeedback,
      inspirationSites: inspirationSites.filter((s) => s.trim()),
      purposes,
      targetAudience,
      specialWishes,
      palette: selectedPalette,
      customColors,
      voiceTranscript: voiceTranscript || undefined,
      componentChoices,
      websiteAnalysis: websiteAnalysis || undefined,
    };

    const palette = customColors || selectedPalette;
    const paletteText = palette
      ? `Primary ${palette.primary}, Secondary ${palette.secondary}, Accent ${palette.accent}`
      : null;
    const industryLabel = currentIndustry?.label || industry || "general";

    const intentLabel = buildIntentNoun(buildIntent);
    const intentHint =
      buildIntent === "template"
        ? "Scope: compact, reusable template (1–2 pages). Avoid heavy app logic."
        : buildIntent === "app"
          ? "Include app flows, stateful UI, and key data models where relevant."
          : "Focus on content structure, marketing flow, and clear sections.";

    const promptParts = [
      `Create a ${categoryType} ${intentLabel} for ${companyName || "a business"}.`,
      `Build intent: ${intentHint}`,
      `Industry: ${industryLabel}.`,
      location ? `Location: ${location}.` : null,
      purposes.length ? `Goals: ${purposes.join(", ")}.` : null,
      targetAudience ? `Target audience: ${targetAudience}.` : null,
      selectedVibe ? `Visual style: ${selectedVibe}.` : null,
      paletteText ? `Color palette: ${paletteText}.` : null,
      existingWebsite ? `Existing website: ${existingWebsite}.` : null,
      inspirationSites.filter((s) => s.trim()).length
        ? `Inspiration: ${inspirationSites.filter((s) => s.trim()).join(", ")}.`
        : null,
      siteFeedback ? `Feedback: ${siteFeedback}.` : null,
      specialWishes ? `Special wishes: ${specialWishes}.` : null,
      voiceTranscript ? `Voice notes: ${voiceTranscript}.` : null,
      initialPrompt ? `Initial context: ${initialPrompt}.` : null,
      websiteAnalysis ? `Website analysis: ${websiteAnalysis}.` : null,
    ].filter(Boolean);

    const expandedPrompt = promptParts.join("\n");
    setGeneratedPrompt(expandedPrompt);
    setEditedPrompt(expandedPrompt);
    setShowEditMode(true);
    setIsExpanding(false);

    return wizardData;
  }, [
    companyName,
    industry,
    location,
    existingWebsite,
    siteFeedback,
    inspirationSites,
    purposes,
    targetAudience,
    specialWishes,
    selectedPalette,
    customColors,
    voiceTranscript,
    selectedVibe,
    categoryType,
    buildIntent,
    initialPrompt,
    websiteAnalysis,
    currentIndustry,
  ]);

  // Final completion
  const handleComplete = useCallback(() => {
    const componentChoices: ComponentChoices = {
      hero: "geometric",
      navigation: "sticky",
      layout: "sections",
      effects: "scroll",
      vibe: selectedVibe,
    };

    const wizardData: WizardData = {
      companyName,
      industry,
      location,
      existingWebsite,
      siteLikes: [],
      siteDislikes: [],
      siteOtherFeedback: siteFeedback,
      inspirationSites: inspirationSites.filter((s) => s.trim()),
      purposes,
      targetAudience,
      specialWishes,
      palette: selectedPalette,
      customColors,
      voiceTranscript: voiceTranscript || undefined,
      componentChoices,
      websiteAnalysis: websiteAnalysis || undefined,
    };

    onComplete(wizardData, editedPrompt);
  }, [
    companyName,
    industry,
    location,
    existingWebsite,
    siteFeedback,
    inspirationSites,
    purposes,
    targetAudience,
    specialWishes,
    selectedPalette,
    customColors,
    voiceTranscript,
    selectedVibe,
    websiteAnalysis,
    editedPrompt,
    onComplete,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-linear-to-b from-gray-950 to-black shadow-2xl">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="bg-brand-teal/10 absolute -top-32 -right-32 h-64 w-64 blur-3xl" />
          <div className="bg-brand-blue/10 absolute -bottom-32 -left-32 h-64 w-64 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-500 transition-colors duration-200 hover:rotate-90 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══════════════════════════════════════════════════════════
            HEADER with step indicator
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative border-b border-gray-800/50 p-6">
          {/* Progress bar */}
          <div className="mb-6 flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  s < step
                    ? "bg-brand-teal"
                    : s === step
                      ? "bg-brand-teal/80 animate-pulse"
                      : "bg-gray-800"
                }`}
              />
            ))}
          </div>

          {/* Step title */}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              {step === 1 && "Berätta om dig"}
              {step === 2 && "Dina mål"}
              {step === 3 && "Nuvarande & Inspiration"}
              {step === 4 && "Design & Färger"}
              {step === 5 && "Sista detaljer"}
            </h2>
            <p className="text-sm text-gray-500">
              Steg {step} av {totalSteps}
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            CONTENT - Dynamic based on step
            ═══════════════════════════════════════════════════════════ */}
        <div className="min-h-[350px] p-6">
          {/* ═══════════════════════════════════════════════════════════
              STEP 1: About You
              ═══════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Building2 className="text-brand-teal h-4 w-4" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ditt företag eller projekt..."
                  className="focus:border-brand-teal focus:ring-brand-teal/50 w-full rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Industry Grid */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Bransch *</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {INDUSTRY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleIndustryChange(option.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all ${
                        industry === option.id
                          ? "border-brand-teal bg-brand-teal/20 text-brand-teal/80"
                          : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="text-center text-xs">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location (optional) */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Globe className="text-brand-teal h-4 w-4" />
                  Plats <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Stockholm, Göteborg, eller annat..."
                  className="focus:border-brand-teal focus:ring-brand-teal/50 w-full rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 2: Your Goals
              ═══════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Purpose Selection */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Target className="text-brand-teal h-4 w-4" />
                  Vad vill du uppnå? * (välj ett eller flera)
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PURPOSE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => togglePurpose(option.id)}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                        purposes.includes(option.id)
                          ? "border-brand-teal bg-brand-teal/20"
                          : "border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <span className="text-xl">{option.icon}</span>
                      <div className="text-left">
                        <span
                          className={`block text-sm font-medium ${
                            purposes.includes(option.id) ? "text-brand-teal/80" : "text-white"
                          }`}
                        >
                          {option.label}
                        </span>
                        <span className="text-xs text-gray-500">{option.desc}</span>
                      </div>
                      {purposes.includes(option.id) && (
                        <Check className="text-brand-teal ml-auto h-4 w-4" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Målgrupp</label>
                {currentIndustry?.suggestedAudience && (
                  <div className="bg-brand-teal/10 border-brand-teal/30 text-brand-teal/80 mb-2 rounded-lg border p-2 text-xs">
                    💡 Förslag: {currentIndustry.suggestedAudience}
                  </div>
                )}
                <textarea
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Beskriv din idealiska kund..."
                  rows={3}
                  className="focus:border-brand-teal focus:ring-brand-teal/50 w-full resize-none rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 3: Existing Site & Inspiration
              ═══════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Existing Website */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Globe className="text-brand-teal h-4 w-4" />
                  Befintlig webbplats <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={existingWebsite}
                    onChange={(e) => setExistingWebsite(e.target.value)}
                    placeholder="https://din-nuvarande-sajt.se"
                    className="focus:border-brand-teal focus:ring-brand-teal/50 flex-1 rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                  />
                  {existingWebsite && (
                    <Button
                      onClick={analyzeWebsite}
                      disabled={isAnalyzing}
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                    >
                      {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analysera"}
                    </Button>
                  )}
                </div>
                {websiteAnalysis && (
                  <div className="bg-brand-teal/10 border-brand-teal/30 rounded-lg border p-3 text-sm text-gray-200">
                    <p className="text-brand-teal mb-1 text-xs font-medium">AI-analys:</p>
                    {websiteAnalysis}
                  </div>
                )}
              </div>

              {/* Site Feedback */}
              {existingWebsite && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">
                    Vad vill du ändra/förbättra?
                  </label>
                  <textarea
                    value={siteFeedback}
                    onChange={(e) => setSiteFeedback(e.target.value)}
                    placeholder="T.ex. Ser föråldrad ut, svår navigation, dålig mobilversion..."
                    rows={2}
                    className="focus:border-brand-teal focus:ring-brand-teal/50 w-full resize-none rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                  />
                </div>
              )}

              {/* Inspiration Sites */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Lightbulb className="text-brand-amber h-4 w-4" />
                  Inspirationssajter <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <div className="space-y-2">
                  {inspirationSites.map((site, index) => (
                    <input
                      key={index}
                      type="url"
                      value={site}
                      onChange={(e) => updateInspirationSite(index, e.target.value)}
                      placeholder={`https://inspiration-${index + 1}.se`}
                      className="focus:border-brand-teal focus:ring-brand-teal/50 w-full rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                    />
                  ))}
                  {inspirationSites.length < 3 && (
                    <Button
                      onClick={addInspirationSite}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-white"
                    >
                      + Lägg till fler
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 4: Design Preferences
              ═══════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Design Vibe */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Wand2 className="text-brand-teal h-4 w-4" />
                  Vilken stil passar dig?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VIBE_OPTIONS.map((vibe) => (
                    <button
                      key={vibe.id}
                      onClick={() => setSelectedVibe(vibe.id)}
                      className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                        selectedVibe === vibe.id
                          ? "border-brand-teal bg-brand-teal/20"
                          : "border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <span className="text-2xl">{vibe.icon}</span>
                      <span
                        className={`text-xs font-medium ${
                          selectedVibe === vibe.id ? "text-brand-teal/80" : "text-gray-400"
                        }`}
                      >
                        {vibe.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Palette */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Palette className="text-brand-teal h-4 w-4" />
                  Färgpalett
                </label>
                <ColorPalettePicker
                  selectedPalette={selectedPalette}
                  onSelect={setSelectedPalette}
                  customColors={customColors || undefined}
                  onCustomColorChange={(type, color) => {
                    setCustomColors((prev) => ({
                      primary: prev?.primary || selectedPalette?.primary || "#1E40AF",
                      secondary: prev?.secondary || selectedPalette?.secondary || "#3B82F6",
                      accent: prev?.accent || selectedPalette?.accent || "#60A5FA",
                      [type]: color,
                    }));
                  }}
                  industry={industry}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 5: Special Wishes & Generate
              ═══════════════════════════════════════════════════════════ */}
          {step === 5 && !showEditMode && (
            <div className="space-y-6">
              {/* Quick Features */}
              {currentIndustry?.suggestedFeatures &&
                currentIndustry.suggestedFeatures.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Populära funktioner för {currentIndustry.label}:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {currentIndustry.suggestedFeatures.map((feature, idx) => {
                        const isIncluded = specialWishes
                          .toLowerCase()
                          .includes(feature.toLowerCase());
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              if (!isIncluded) {
                                setSpecialWishes((prev) =>
                                  prev ? `${prev}, ${feature}` : `Jag vill ha: ${feature}`,
                                );
                              }
                            }}
                            disabled={isIncluded}
                            className={`rounded-full px-3 py-1.5 text-sm transition-all ${
                              isIncluded
                                ? "bg-brand-teal/30 text-brand-teal/80 border-brand-teal/50 border"
                                : "hover:border-brand-teal/50 border border-gray-700 bg-gray-900 text-gray-400"
                            }`}
                          >
                            {isIncluded ? "✓" : "+"} {feature}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Special Wishes */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Wand2 className="text-brand-teal h-4 w-4" />
                  Egna önskemål <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <textarea
                  value={specialWishes}
                  onChange={(e) => setSpecialWishes(e.target.value)}
                  placeholder="Beskriv fritt vad du vill ha på din webbplats..."
                  rows={4}
                  className="focus:border-brand-teal focus:ring-brand-teal/50 w-full resize-none rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
                />
              </div>

              {/* Voice Input */}
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Mic className="text-brand-teal h-4 w-4" />
                  Eller prata in dina önskemål
                </label>
                <VoiceRecorder
                  onTranscript={(transcript) => {
                    setVoiceTranscript(transcript);
                    setSpecialWishes((prev) =>
                      prev
                        ? `${prev}\n\n[Röstinmatning]: ${transcript}`
                        : `[Röstinmatning]: ${transcript}`,
                    );
                  }}
                  onRecordingChange={() => {}}
                  placeholder="Börja prata..."
                />
              </div>

              {/* Summary */}
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                <p className="text-sm font-medium text-gray-300">📋 Sammanfattning</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {companyName && (
                    <span className="rounded bg-gray-800 px-2 py-1 text-gray-300">
                      {companyName}
                    </span>
                  )}
                  {industry && (
                    <span className="rounded bg-gray-800 px-2 py-1 text-gray-300">
                      {currentIndustry?.icon} {currentIndustry?.label}
                    </span>
                  )}
                  {purposes.length > 0 && (
                    <span className="rounded bg-gray-800 px-2 py-1 text-gray-300">
                      {purposes.length} mål
                    </span>
                  )}
                  {selectedPalette && (
                    <span className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-gray-300">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedPalette.primary }}
                      />
                      {selectedPalette.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              EDIT MODE - After generation
              ═══════════════════════════════════════════════════════════ */}
          {showEditMode && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wand2 className="text-brand-teal h-5 w-5" />
                  <h3 className="text-xl font-bold text-white">Din genererade prompt</h3>
                </div>
                <p className="text-sm text-gray-400">Redigera om du vill, eller fortsätt direkt.</p>
              </div>

              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={12}
                className="focus:border-brand-teal focus:ring-brand-teal/50 w-full resize-none rounded-lg border border-gray-800 bg-black/50 px-4 py-3 font-mono text-sm text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none"
              />

              <div className="flex gap-2">
                <Button
                  onClick={() => setEditedPrompt(generatedPrompt || "")}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white"
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Återställ
                </Button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FOOTER - Navigation buttons
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative flex items-center justify-between gap-3 border-t border-gray-800/50 p-6">
          {/* Back button */}
          {!showEditMode ? (
            <Button
              variant="ghost"
              onClick={step === 1 ? onClose : handleBack}
              disabled={isExpanding}
              className="gap-2 text-gray-400 hover:text-white"
            >
              {step === 1 ? (
                "Avbryt"
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  Tillbaka
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setShowEditMode(false);
                setGeneratedPrompt(null);
                setEditedPrompt("");
              }}
              className="gap-2 text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          )}

          {/* Next/Generate/Complete button */}
          {showEditMode ? (
            <Button
              onClick={handleComplete}
              className="from-brand-teal to-brand-teal/80 hover:from-brand-teal/90 hover:to-brand-teal/70 gap-2 bg-linear-to-r px-6"
            >
              <Rocket className="h-4 w-4" />
              Skapa webbplats
            </Button>
          ) : step < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="bg-brand-teal hover:bg-brand-teal/90 gap-2 disabled:opacity-50"
            >
              Nästa
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isExpanding}
              className="from-brand-teal to-brand-blue hover:from-brand-teal/90 hover:to-brand-blue/90 gap-2 bg-linear-to-r px-6"
            >
              {isExpanding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Skapar prompt...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Skapa magisk prompt
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
