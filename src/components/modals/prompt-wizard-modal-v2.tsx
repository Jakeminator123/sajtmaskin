"use client";

import { useState, useCallback } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
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
}

export function PromptWizardModalV2({
  isOpen,
  onClose,
  onComplete,
  initialPrompt = "",
  categoryType = "website",
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
    PREDEFINED_PALETTES[0]
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
      prev.includes(purposeId)
        ? prev.filter((p) => p !== purposeId)
        : [...prev, purposeId]
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

    const promptParts = [
      `Create a ${categoryType} website for ${companyName || "a business"}.`,
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
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-linear-to-b from-gray-950 to-black border border-gray-800 shadow-2xl mx-4 rounded-2xl">
        {/* Decorative background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-brand-teal/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-brand-blue/10 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors z-10 hover:rotate-90 duration-200"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══════════════════════════════════════════════════════════
            HEADER with step indicator
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative p-6 border-b border-gray-800/50">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition-all duration-300 ${s < step
                    ? "bg-brand-teal"
                    : s === step
                      ? "bg-brand-teal/80 animate-pulse"
                      : "bg-gray-800"
                  }`}
              />
            ))}
          </div>

          {/* Step title */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
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
        <div className="p-6 min-h-[350px]">
          {/* ═══════════════════════════════════════════════════════════
              STEP 1: About You
              ═══════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Building2 className="h-4 w-4 text-brand-teal" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ditt företag eller projekt..."
                  className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 transition-all"
                  autoFocus
                />
              </div>

              {/* Industry Grid */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Bransch *
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {INDUSTRY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleIndustryChange(option.id)}
                      className={`flex flex-col items-center gap-1 p-3 border rounded-lg transition-all ${industry === option.id
                          ? "border-brand-teal bg-brand-teal/20 text-brand-teal/80"
                          : "border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white"
                        }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="text-xs text-center">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location (optional) */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Globe className="h-4 w-4 text-brand-teal" />
                  Plats{" "}
                  <span className="text-gray-500 font-normal">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Stockholm, Göteborg, eller annat..."
                  className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 transition-all"
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
                  <Target className="h-4 w-4 text-brand-teal" />
                  Vad vill du uppnå? * (välj ett eller flera)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PURPOSE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => togglePurpose(option.id)}
                      className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${purposes.includes(option.id)
                          ? "border-brand-teal bg-brand-teal/20"
                          : "border-gray-800 hover:border-gray-700"
                        }`}
                    >
                      <span className="text-xl">{option.icon}</span>
                      <div className="text-left">
                        <span
                          className={`text-sm font-medium block ${purposes.includes(option.id)
                              ? "text-brand-teal/80"
                              : "text-white"
                            }`}
                        >
                          {option.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {option.desc}
                        </span>
                      </div>
                      {purposes.includes(option.id) && (
                        <Check className="h-4 w-4 text-brand-teal ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Målgrupp
                </label>
                {currentIndustry?.suggestedAudience && (
                  <div className="p-2 bg-brand-teal/10 border border-brand-teal/30 rounded-lg text-xs text-brand-teal/80 mb-2">
                    💡 Förslag: {currentIndustry.suggestedAudience}
                  </div>
                )}
                <textarea
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Beskriv din idealiska kund..."
                  rows={3}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 resize-none transition-all"
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
                  <Globe className="h-4 w-4 text-brand-teal" />
                  Befintlig webbplats{" "}
                  <span className="text-gray-500 font-normal">(valfritt)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={existingWebsite}
                    onChange={(e) => setExistingWebsite(e.target.value)}
                    placeholder="https://din-nuvarande-sajt.se"
                    className="flex-1 px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 transition-all"
                  />
                  {existingWebsite && (
                    <Button
                      onClick={analyzeWebsite}
                      disabled={isAnalyzing}
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Analysera"
                      )}
                    </Button>
                  )}
                </div>
                {websiteAnalysis && (
                  <div className="p-3 bg-brand-teal/10 border border-brand-teal/30 rounded-lg text-sm text-gray-200">
                    <p className="text-xs text-brand-teal font-medium mb-1">
                      AI-analys:
                    </p>
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
                    className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 resize-none transition-all"
                  />
                </div>
              )}

              {/* Inspiration Sites */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Lightbulb className="h-4 w-4 text-brand-amber" />
                  Inspirationssajter{" "}
                  <span className="text-gray-500 font-normal">(valfritt)</span>
                </label>
                <div className="space-y-2">
                  {inspirationSites.map((site, index) => (
                    <input
                      key={index}
                      type="url"
                      value={site}
                      onChange={(e) =>
                        updateInspirationSite(index, e.target.value)
                      }
                      placeholder={`https://inspiration-${index + 1}.se`}
                      className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 transition-all"
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
                  <Sparkles className="h-4 w-4 text-brand-teal" />
                  Vilken stil passar dig?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VIBE_OPTIONS.map((vibe) => (
                    <button
                      key={vibe.id}
                      onClick={() => setSelectedVibe(vibe.id)}
                      className={`flex flex-col items-center gap-2 p-4 border rounded-lg transition-all ${selectedVibe === vibe.id
                          ? "border-brand-teal bg-brand-teal/20"
                          : "border-gray-800 hover:border-gray-700"
                        }`}
                    >
                      <span className="text-2xl">{vibe.icon}</span>
                      <span
                        className={`text-xs font-medium ${selectedVibe === vibe.id
                            ? "text-brand-teal/80"
                            : "text-gray-400"
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
                  <Palette className="h-4 w-4 text-brand-teal" />
                  Färgpalett
                </label>
                <ColorPalettePicker
                  selectedPalette={selectedPalette}
                  onSelect={setSelectedPalette}
                  customColors={customColors || undefined}
                  onCustomColorChange={(type, color) => {
                    setCustomColors((prev) => ({
                      primary:
                        prev?.primary || selectedPalette?.primary || "#1E40AF",
                      secondary:
                        prev?.secondary ||
                        selectedPalette?.secondary ||
                        "#3B82F6",
                      accent:
                        prev?.accent || selectedPalette?.accent || "#60A5FA",
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
                                  prev
                                    ? `${prev}, ${feature}`
                                    : `Jag vill ha: ${feature}`
                                );
                              }
                            }}
                            disabled={isIncluded}
                            className={`px-3 py-1.5 text-sm rounded-full transition-all ${isIncluded
                                ? "bg-brand-teal/30 text-brand-teal/80 border border-brand-teal/50"
                                : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-brand-teal/50"
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
                  <Wand2 className="h-4 w-4 text-brand-teal" />
                  Egna önskemål{" "}
                  <span className="text-gray-500 font-normal">(valfritt)</span>
                </label>
                <textarea
                  value={specialWishes}
                  onChange={(e) => setSpecialWishes(e.target.value)}
                  placeholder="Beskriv fritt vad du vill ha på din webbplats..."
                  rows={4}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 resize-none transition-all"
                />
              </div>

              {/* Voice Input */}
              <div className="space-y-2 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Mic className="h-4 w-4 text-brand-teal" />
                  Eller prata in dina önskemål
                </label>
                <VoiceRecorder
                  onTranscript={(transcript) => {
                    setVoiceTranscript(transcript);
                    setSpecialWishes((prev) =>
                      prev
                        ? `${prev}\n\n[Röstinmatning]: ${transcript}`
                        : `[Röstinmatning]: ${transcript}`
                    );
                  }}
                  onRecordingChange={() => { }}
                  placeholder="Börja prata..."
                />
              </div>

              {/* Summary */}
              <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 space-y-2">
                <p className="text-sm font-medium text-gray-300">
                  📋 Sammanfattning
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {companyName && (
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">
                      {companyName}
                    </span>
                  )}
                  {industry && (
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">
                      {currentIndustry?.icon} {currentIndustry?.label}
                    </span>
                  )}
                  {purposes.length > 0 && (
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">
                      {purposes.length} mål
                    </span>
                  )}
                  {selectedPalette && (
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300 flex items-center gap-1">
                      <span
                        className="w-3 h-3 rounded-full"
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
                  <Sparkles className="h-5 w-5 text-brand-teal" />
                  <h3 className="text-xl font-bold text-white">
                    Din genererade prompt
                  </h3>
                </div>
                <p className="text-sm text-gray-400">
                  Redigera om du vill, eller fortsätt direkt.
                </p>
              </div>

              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={12}
                className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/50 font-mono text-sm resize-none transition-all"
              />

              <div className="flex gap-2">
                <Button
                  onClick={() => setEditedPrompt(generatedPrompt || "")}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Återställ
                </Button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FOOTER - Navigation buttons
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative p-6 border-t border-gray-800/50 flex justify-between items-center gap-3">
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
              className="gap-2 bg-linear-to-r from-brand-teal to-brand-teal/80 hover:from-brand-teal/90 hover:to-brand-teal/70 px-6"
            >
              <Rocket className="h-4 w-4" />
              Skapa webbplats
            </Button>
          ) : step < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="gap-2 bg-brand-teal hover:bg-brand-teal/90 disabled:opacity-50"
            >
              Nästa
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isExpanding}
              className="gap-2 bg-linear-to-r from-brand-teal to-brand-blue hover:from-brand-teal/90 hover:to-brand-blue/90 px-6"
            >
              {isExpanding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Skapar prompt...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
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
