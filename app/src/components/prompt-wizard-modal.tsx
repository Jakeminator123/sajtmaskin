"use client";

import { useState } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Building2,
  Target,
  Users,
  Sparkles,
  Palette,
  Loader2,
  Check,
  MapPin,
  Globe,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Briefcase,
  RotateCcw,
  Rocket,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ColorPalettePicker,
  type ColorPalette,
  PREDEFINED_PALETTES,
  getIndustryPalettes,
} from "@/components/color-palette-picker";
import { VoiceRecorder } from "@/components/voice-recorder";
import { LocationPicker } from "@/components/location-picker";

/**
 * PromptWizardModal - Extended Business Analysis Wizard
 *
 * 10 steps to build a comprehensive prompt:
 * 1. Company name
 * 2. Industry/type
 * 3. Location/address (optional)
 * 4. Existing website URL (optional)
 * 5. What do you like/dislike about existing site? (if step 4)
 * 6. Inspiration websites (optional, 1-3)
 * 7. Purpose (what do you want to achieve?)
 * 8. Target audience
 * 9. Special wishes (optional)
 * 10. Color selection
 */

// Industry options with suggested audience and features
const INDUSTRY_OPTIONS = [
  {
    id: "cafe",
    label: "Café/Konditori",
    icon: "☕",
    suggestedAudience:
      "Kaffeälskare och fika-entusiaster i närområdet, studenter och distansarbetare som söker en trivsam miljö",
    suggestedFeatures: [
      "Meny med priser",
      "Öppettider",
      "Bildgalleri",
      "Bordbokning",
    ],
  },
  {
    id: "restaurant",
    label: "Restaurang/Bar",
    icon: "🍽️",
    suggestedAudience:
      "Matälskare, par på dejt, och grupper som söker middagsupplevelser",
    suggestedFeatures: [
      "Meny med priser",
      "Bordbokning",
      "Eventkalender",
      "Chef's specials",
    ],
  },
  {
    id: "retail",
    label: "Butik/Detaljhandel",
    icon: "🛍️",
    suggestedAudience:
      "Shoppingintresserade kunder som letar efter kvalitetsprodukter och bra deals",
    suggestedFeatures: [
      "Produktkatalog",
      "Erbjudanden",
      "Butikslokalisering",
      "Öppettider",
    ],
  },
  {
    id: "tech",
    label: "Tech/IT-företag",
    icon: "💻",
    suggestedAudience:
      "Företagskunder, startups, och teknikintresserade som behöver digitala lösningar",
    suggestedFeatures: [
      "Tjänster",
      "Case studies",
      "Prissättning",
      "Dokumentation",
    ],
  },
  {
    id: "consulting",
    label: "Konsult/Tjänster",
    icon: "💼",
    suggestedAudience:
      "Företag och organisationer som behöver experthjälp inom ert specialområde",
    suggestedFeatures: [
      "Tjänstebeskrivningar",
      "Teamet",
      "Kontaktformulär",
      "Testimonials",
    ],
  },
  {
    id: "health",
    label: "Hälsa/Wellness",
    icon: "🏥",
    suggestedAudience:
      "Hälsomedvetna individer som söker välmående och professionell vård",
    suggestedFeatures: ["Behandlingar", "Onlinebokning", "Teamet", "Prislista"],
  },
  {
    id: "creative",
    label: "Kreativ byrå/Design",
    icon: "🎨",
    suggestedAudience:
      "Företag som behöver kreativa lösningar, varumärkesbyggnad och design",
    suggestedFeatures: [
      "Portfolio",
      "Tjänster",
      "Processbeskrivning",
      "Kontakt",
    ],
  },
  {
    id: "education",
    label: "Utbildning/Kurser",
    icon: "📚",
    suggestedAudience:
      "Studenter, yrkesverksamma och företag som vill lära sig nya färdigheter",
    suggestedFeatures: ["Kurskatalog", "Schema", "Anmälan", "Lärare"],
  },
  {
    id: "ecommerce",
    label: "E-handel",
    icon: "🛒",
    suggestedAudience:
      "Onlineshoppare som söker bekvämlighet och bra produkter",
    suggestedFeatures: [
      "Produktvisning",
      "Kundvagn",
      "Checkout",
      "Kundrecensioner",
    ],
  },
  {
    id: "nonprofit",
    label: "Ideell organisation",
    icon: "❤️",
    suggestedAudience:
      "Engagerade individer som vill stödja er sak och göra skillnad",
    suggestedFeatures: ["Om oss", "Projekt", "Donera", "Bli volontär"],
  },
  {
    id: "realestate",
    label: "Fastigheter/Mäklare",
    icon: "🏠",
    suggestedAudience: "Bostadssökare och säljare i ert verksamhetsområde",
    suggestedFeatures: [
      "Objektslisting",
      "Sök/Filter",
      "Kontakt mäklare",
      "Värdering",
    ],
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
  {
    id: "sell",
    label: "Sälja produkter/tjänster",
    icon: "🛒",
    desc: "E-handel och försäljning",
  },
  {
    id: "leads",
    label: "Generera leads/kontakter",
    icon: "📧",
    desc: "Fånga intresserade besökare",
  },
  {
    id: "portfolio",
    label: "Visa upp portfolio/arbeten",
    icon: "🎨",
    desc: "Imponera med ditt arbete",
  },
  {
    id: "inform",
    label: "Informera/utbilda besökare",
    icon: "📚",
    desc: "Dela kunskap och nyheter",
  },
  {
    id: "brand",
    label: "Bygga varumärke",
    icon: "⭐",
    desc: "Stärk din identitet",
  },
  {
    id: "booking",
    label: "Ta emot bokningar",
    icon: "📅",
    desc: "Låt kunder boka tid",
  },
];

// Site feedback options
const SITE_LIKES = [
  { id: "design", label: "Design/utseende" },
  { id: "navigation", label: "Navigation/struktur" },
  { id: "content", label: "Innehållet" },
  { id: "speed", label: "Hastighet/prestanda" },
  { id: "mobile", label: "Mobilanpassning" },
];

const SITE_DISLIKES = [
  { id: "outdated", label: "Ser föråldrad ut" },
  { id: "confusing", label: "Förvirrande navigation" },
  { id: "slow", label: "Långsam/seg" },
  { id: "not_mobile", label: "Fungerar dåligt på mobil" },
  { id: "boring", label: "Tråkig/oinspirerad" },
  { id: "hard_to_update", label: "Svår att uppdatera" },
];

// v0 Component styles and effects - inspired by v0.app/templates/components
const COMPONENT_STYLES = {
  hero: [
    {
      id: "geometric",
      label: "Geometric Background",
      desc: "Animerade geometriska former",
      icon: "◆",
    },
    {
      id: "gradient",
      label: "Gradient Flow",
      desc: "Mjuka färgövergångar",
      icon: "🌈",
    },
    {
      id: "particles",
      label: "Particle Effect",
      desc: "Interaktiva partiklar",
      icon: "✨",
    },
    {
      id: "minimal",
      label: "Clean Minimal",
      desc: "Enkel och stilren",
      icon: "◻️",
    },
    {
      id: "video",
      label: "Video Background",
      desc: "Bakgrundsvideo/loop",
      icon: "🎬",
    },
  ],
  navigation: [
    {
      id: "sticky",
      label: "Sticky Header",
      desc: "Fast navigation som följer med",
      icon: "📌",
    },
    {
      id: "glass",
      label: "Glassmorphism",
      desc: "Frostat glas-effekt",
      icon: "🪟",
    },
    {
      id: "glow",
      label: "Glow Menu",
      desc: "Lysande hover-effekt",
      icon: "💫",
    },
    { id: "minimal", label: "Minimal", desc: "Enkel utan effekter", icon: "—" },
    {
      id: "sidebar",
      label: "Sidebar Nav",
      desc: "Navigation på sidan",
      icon: "☰",
    },
  ],
  layout: [
    {
      id: "bento",
      label: "Bento Grid",
      desc: "Asymmetriskt rutnät",
      icon: "⊞",
    },
    { id: "cards", label: "Card Layout", desc: "Klassiska kort", icon: "🃏" },
    {
      id: "sections",
      label: "Full Sections",
      desc: "Stora sektioner",
      icon: "▭",
    },
    { id: "masonry", label: "Masonry", desc: "Pinterest-stil", icon: "🧱" },
    {
      id: "split",
      label: "Split Screen",
      desc: "Delad skärm 50/50",
      icon: "⬜⬛",
    },
  ],
  effects: [
    { id: "none", label: "Inga effekter", desc: "Snabb och enkel", icon: "⚡" },
    {
      id: "scroll",
      label: "Scroll Animations",
      desc: "Element animeras in",
      icon: "↓",
    },
    {
      id: "parallax",
      label: "Parallax",
      desc: "Djupkänsla vid scroll",
      icon: "🎭",
    },
    {
      id: "hover",
      label: "Hover Effects",
      desc: "Interaktiva hover",
      icon: "👆",
    },
    {
      id: "beam",
      label: "Animated Beams",
      desc: "Ljusstrålar och linjer",
      icon: "⚡",
    },
  ],
  vibe: [
    {
      id: "modern",
      label: "Modern & Clean",
      desc: "Stilrent och professionellt",
      icon: "✨",
    },
    {
      id: "playful",
      label: "Playful & Fun",
      desc: "Lekfull med personlighet",
      icon: "🎨",
    },
    {
      id: "brutalist",
      label: "Brutalist",
      desc: "Rå och djärv design",
      icon: "🏗️",
    },
    {
      id: "luxury",
      label: "Luxury & Premium",
      desc: "Exklusiv känsla",
      icon: "💎",
    },
    {
      id: "retro",
      label: "Retro / Vintage",
      desc: "Nostalgisk stil",
      icon: "📻",
    },
    {
      id: "tech",
      label: "Tech / Futuristic",
      desc: "Framtid och innovation",
      icon: "🚀",
    },
  ],
};

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
  voiceTranscript?: string; // Voice input transcript
  componentChoices?: ComponentChoices; // v0 component style choices
  // Data from AI analysis (for saving to database)
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

export function PromptWizardModal({
  isOpen,
  onClose,
  onComplete,
  initialPrompt = "",
  categoryType = "website",
}: PromptWizardModalProps) {
  const [step, setStep] = useState(1);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [showEditMode, setShowEditMode] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [existingWebsite, setExistingWebsite] = useState("");
  const [siteLikes, setSiteLikes] = useState<string[]>([]);
  const [siteDislikes, setSiteDislikes] = useState<string[]>([]);
  const [siteOtherFeedback, setSiteOtherFeedback] = useState("");
  const [inspirationSites, setInspirationSites] = useState<string[]>([""]);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");
  const [specialWishes, setSpecialWishes] = useState(initialPrompt);
  const [selectedPalette, setSelectedPalette] = useState<ColorPalette | null>(
    PREDEFINED_PALETTES[0]
  );
  const [customColors, setCustomColors] = useState<{
    primary: string;
    secondary: string;
    accent: string;
  } | null>(null);

  // Component style choices (v0 templates)
  const [componentChoices, setComponentChoices] = useState<ComponentChoices>({
    hero: "geometric",
    navigation: "sticky",
    layout: "sections",
    effects: "scroll",
    vibe: "modern",
  });

  // Voice input transcript
  const [voiceTranscript, setVoiceTranscript] = useState<string>("");

  // Website analysis result (from GPT-4o Vision)
  const [websiteAnalysis, setWebsiteAnalysis] = useState<string | null>(null);

  // Store industry trends for passing to parent
  const [industryTrends, setIndustryTrends] = useState<string | null>(null);

  // Dynamic step calculation (skip step 5 if no existing website)
  const getSteps = () => {
    const steps = [
      { id: 1, name: "Företag" },
      { id: 2, name: "Bransch" },
      { id: 3, name: "Plats" },
      { id: 4, name: "Befintlig sajt" },
      { id: 5, name: "Feedback", skip: !existingWebsite },
      { id: 6, name: "Inspiration" },
      { id: 7, name: "Syfte" },
      { id: 8, name: "Målgrupp" },
      { id: 9, name: "Önskemål" },
      { id: 10, name: "Design & Stil" },
      { id: 11, name: "Färger" },
    ];
    return steps.filter((s) => !s.skip);
  };

  const steps = getSteps();
  const totalSteps = steps.length;
  const currentStepIndex = steps.findIndex((s) => s.id === step);
  const displayStep = currentStepIndex + 1;

  const togglePurpose = (purposeId: string) => {
    setPurposes((prev) =>
      prev.includes(purposeId)
        ? prev.filter((p) => p !== purposeId)
        : [...prev, purposeId]
    );
  };

  const toggleSiteLike = (id: string) => {
    setSiteLikes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleSiteDislike = (id: string) => {
    setSiteDislikes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCustomColorChange = (
    type: "primary" | "secondary" | "accent",
    color: string
  ) => {
    setCustomColors((prev) => ({
      primary: prev?.primary || selectedPalette?.primary || "#1E40AF",
      secondary: prev?.secondary || selectedPalette?.secondary || "#3B82F6",
      accent: prev?.accent || selectedPalette?.accent || "#60A5FA",
      [type]: color,
    }));
  };

  const addInspirationSite = () => {
    if (inspirationSites.length < 3) {
      setInspirationSites([...inspirationSites, ""]);
    }
  };

  const updateInspirationSite = (index: number, value: string) => {
    const newSites = [...inspirationSites];
    newSites[index] = value;
    setInspirationSites(newSites);
  };

  const removeInspirationSite = (index: number) => {
    if (inspirationSites.length > 1) {
      setInspirationSites(inspirationSites.filter((_, i) => i !== index));
    }
  };

  // Normalize URL - add https:// if missing
  const normalizeUrl = (url: string): string => {
    if (!url) return url;
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  // Analyze existing website with AI
  const analyzeWebsite = async () => {
    if (!existingWebsite) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const normalizedUrl = normalizeUrl(existingWebsite);
      const response = await fetch("/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to analyze website");
      }

      setWebsiteAnalysis(data.analysis);
    } catch (err) {
      console.error("Failed to analyze website:", err);
      // Don't show error - analysis is optional
    } finally {
      setIsAnalyzing(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return companyName.trim().length > 0;
      case 2:
        return industry.length > 0;
      case 3:
        return true; // Optional
      case 4:
        return true; // Optional
      case 5:
        return true; // Optional feedback
      case 6:
        return true; // Optional
      case 7:
        return purposes.length > 0;
      case 8:
        return targetAudience.trim().length > 0;
      case 9:
        return true; // Optional
      case 10:
        return selectedPalette !== null || customColors !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    // Find next valid step
    const currentIdx = steps.findIndex((s) => s.id === step);
    if (currentIdx < steps.length - 1) {
      setStep(steps[currentIdx + 1].id);

      // Trigger website analysis when moving past step 4
      if (step === 4 && existingWebsite) {
        analyzeWebsite();
      }
    }
  };

  const handleBack = () => {
    const currentIdx = steps.findIndex((s) => s.id === step);
    if (currentIdx > 0) {
      setStep(steps[currentIdx - 1].id);
    }
  };

  const handleComplete = async () => {
    setIsExpanding(true);
    setError(null);

    const wizardData: WizardData = {
      companyName,
      industry,
      location,
      existingWebsite,
      siteLikes,
      siteDislikes,
      siteOtherFeedback,
      inspirationSites: inspirationSites.filter((s) => s.trim()),
      purposes,
      targetAudience,
      specialWishes,
      palette: selectedPalette,
      customColors,
      voiceTranscript: voiceTranscript || undefined,
      componentChoices,
    };

    try {
      // Call the expand-prompt API with all data
      const response = await fetch("/api/expand-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...wizardData,
          categoryType,
          initialPrompt,
          websiteAnalysis,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to expand prompt");
      }

      // Store industry trends for later (will be saved with project)
      if (data.industryTrends) {
        setIndustryTrends(data.industryTrends);
      }

      // Show edit mode instead of closing immediately
      setIsExpanding(false);
      setGeneratedPrompt(data.expandedPrompt);
      setEditedPrompt(data.expandedPrompt);
      setShowEditMode(true);
    } catch (err) {
      console.error("Failed to expand prompt:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte bygga ut prompten. Försök igen."
      );
      setIsExpanding(false);
    }
  };

  // Update palette and suggest audience when industry changes
  const handleIndustryChange = (newIndustry: string) => {
    setIndustry(newIndustry);

    // Suggest industry-specific colors
    const industryPalettes = getIndustryPalettes(newIndustry);
    if (industryPalettes.length > 0) {
      setSelectedPalette(industryPalettes[0]);
    }

    // Auto-suggest target audience if empty
    const selectedIndustry = INDUSTRY_OPTIONS.find((i) => i.id === newIndustry);
    if (selectedIndustry?.suggestedAudience && !targetAudience) {
      setTargetAudience(selectedIndustry.suggestedAudience);
    }

    // Auto-suggest features based on industry
    if (
      selectedIndustry?.suggestedFeatures &&
      selectedIndustry.suggestedFeatures.length > 0 &&
      !specialWishes
    ) {
      setSpecialWishes(
        `Jag vill ha: ${selectedIndustry.suggestedFeatures.join(", ")}`
      );
    }
  };

  // Get current industry data
  const currentIndustry = INDUSTRY_OPTIONS.find((i) => i.id === industry);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden overscroll-contain bg-black border border-gray-800 shadow-2xl mx-4">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/5 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-teal-500/5 to-gray-500/5 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors z-10 hover:rotate-90 duration-200"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header with unique design */}
        <div className="relative p-6 border-b border-gray-800/50">
          {/* Step indicator circles */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {steps.map((s, idx) => (
              <div
                key={s.id}
                className={`transition-all duration-300 ${
                  idx + 1 < displayStep
                    ? "w-2 h-2 bg-teal-500"
                    : idx + 1 === displayStep
                    ? "w-8 h-2 bg-teal-400 animate-pulse"
                    : "w-2 h-2 bg-gray-700"
                }`}
              />
            ))}
          </div>

          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight transition-all duration-300">
              {step === 1 && "Berätta om dig"}
              {step === 2 && "Vilken värld tillhör du?"}
              {step === 3 && "Var finns magin?"}
              {step === 4 && "Din nuvarande närvaro"}
              {step === 5 && "Vad fungerar?"}
              {step === 6 && "Vad inspirerar dig?"}
              {step === 7 && "Dina mål"}
              {step === 8 && "Dina drömkunder"}
              {step === 9 && "Drömfunktioner"}
              {step === 10 && "Design & Komponenter"}
              {step === 11 && "Välj din palett"}
            </h2>
            <p className="text-base sm:text-lg text-gray-400 font-medium">
              Steg {displayStep} av {totalSteps}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] overflow-x-hidden">
          {/* Step 1: Company name */}
          {step === 1 && (
            <div className="space-y-6 relative">
              {/* Decorative element */}
              <div className="absolute -top-4 -right-4 text-8xl opacity-10 select-none animate-pulse">
                🏢
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  Vad heter ditt företag eller projekt?
                </h3>
                <p className="text-base sm:text-lg text-zinc-300 leading-relaxed">
                  Vi använder detta för att skapa personlig text och tonalitet
                </p>
              </div>

              <div className="relative">
                <input
                  id="wizard-company-name"
                  name="company-name"
                  type="text"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Skriv ditt företagsnamn..."
                  className="w-full px-6 py-5 bg-black/50 border-2 border-gray-800 text-xl text-white placeholder-gray-500 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all duration-200 hover:border-gray-700"
                  autoFocus
                />
                {companyName && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-400">
                    ✓
                  </div>
                )}
              </div>

              {/* Dynamic hint */}
              {companyName.length > 0 && companyName.length < 3 && (
                <p className="text-xs text-amber-400">Ange minst 3 tecken</p>
              )}
            </div>
          )}

          {/* Step 2: Industry */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  Vilken bransch passar bäst?
                </h3>
                <p className="text-base sm:text-lg text-zinc-300 leading-relaxed">
                  Vi anpassar design, färger och funktionsförslag
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {INDUSTRY_OPTIONS.map((option, idx) => (
                  <button
                    key={option.id}
                    onClick={() => handleIndustryChange(option.id)}
                    style={{ animationDelay: `${idx * 30}ms` }}
                    className={`group relative flex flex-col items-center gap-2 p-4 border-2 transition-all duration-200 text-center animate-fadeIn ${
                      industry === option.id
                        ? "border-teal-400/50 bg-teal-500/10"
                        : "border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
                    }`}
                  >
                    <span
                      className={`text-3xl transition-transform duration-200 ${
                        industry === option.id
                          ? "scale-110"
                          : "group-hover:scale-110"
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        industry === option.id
                          ? "text-teal-300"
                          : "text-gray-400 group-hover:text-gray-300"
                      }`}
                    >
                      {option.label}
                    </span>

                    {/* Selected indicator */}
                    {industry === option.id && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-teal-400 flex items-center justify-center text-xs text-black font-bold">
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Show what we'll customize */}
              {industry && (
                <div className="p-4 bg-teal-500/10 border border-teal-500/30 text-base text-gray-200 font-medium animate-fadeIn">
                  <span className="text-teal-400 text-lg">→</span> Vi föreslår
                  nu{" "}
                  <span className="text-teal-300 font-semibold">
                    {currentIndustry?.label}
                  </span>
                  -anpassade färger och funktioner
                </div>
              )}
            </div>
          )}

          {/* Step 3: Location with Google Maps */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <MapPin className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Var finns ni?{" "}
                  <span className="text-base font-normal text-gray-500">
                    (valfritt)
                  </span>
                </h3>
              </div>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
                Sök eller välj på kartan för att få lokalt anpassade förslag och
                hitta konkurrenter i närheten
              </p>

              <LocationPicker
                value={location}
                onChange={(newLocation, coords) => {
                  setLocation(newLocation);
                  // Optionally store coordinates for competitor search
                  if (coords) {
                    console.log("[Wizard] Location coords:", coords);
                  }
                }}
                placeholder="Sök efter adress, stad eller område..."
              />

              <div className="flex items-start gap-2 p-3 bg-teal-500/10 border border-teal-500/30">
                <span className="text-lg">💡</span>
                <p className="text-sm text-teal-300">
                  Med din plats kan vi hitta konkurrenter i området och ge dig
                  branschspecifika tips för din region!
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Existing website */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Globe className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Har du en befintlig webbplats?{" "}
                  <span className="text-base font-normal text-gray-500">
                    (valfritt)
                  </span>
                </h3>
              </div>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
                Vi kan analysera din nuvarande sajt och ge förbättringsförslag
              </p>
              <input
                id="wizard-existing-website"
                name="existing-website"
                type="url"
                autoComplete="url"
                value={existingWebsite}
                onChange={(e) => setExistingWebsite(e.target.value)}
                placeholder="https://din-nuvarande-sajt.se"
                className="w-full px-5 py-4 bg-black border-2 border-gray-800 text-lg text-white placeholder-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all hover:border-gray-700"
              />
              {existingWebsite && (
                <p className="text-sm text-teal-400 font-medium">
                  ✓ Vi analyserar din sajt i nästa steg
                </p>
              )}
            </div>
          )}

          {/* Step 5: Site feedback (only if existing website) */}
          {step === 5 && existingWebsite && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-gray-300">
                <ThumbsUp className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Vad tycker du om din nuvarande sajt?
                </h3>
              </div>

              {/* Analyzing indicator */}
              {isAnalyzing && (
                <div className="flex items-center gap-2 p-3 bg-teal-500/10 border border-teal-500/30">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
                  <span className="text-sm text-teal-400">
                    Analyserar din webbplats med AI...
                  </span>
                </div>
              )}

              {/* Analysis result */}
              {websiteAnalysis && (
                <div className="p-3 bg-teal-500/10 border border-teal-500/30">
                  <p className="text-xs text-teal-400 font-medium mb-1">
                    AI-analys av din sajt:
                  </p>
                  <p className="text-base text-gray-200 leading-relaxed">
                    {websiteAnalysis}
                  </p>
                </div>
              )}

              {/* Likes */}
              <div className="space-y-3">
                <p className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                  <ThumbsUp className="h-5 w-5 text-teal-400" />
                  Vad gillar du?
                </p>
                <div className="flex flex-wrap gap-2">
                  {SITE_LIKES.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleSiteLike(item.id)}
                      className={`px-3 py-1.5 text-sm transition-all ${
                        siteLikes.includes(item.id)
                          ? "bg-teal-500/20 text-teal-400 border border-teal-500/50"
                          : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dislikes */}
              <div className="space-y-3">
                <p className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                  <ThumbsDown className="h-5 w-5 text-red-400" />
                  Vad vill du ändra/förbättra?
                </p>
                <div className="flex flex-wrap gap-2">
                  {SITE_DISLIKES.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleSiteDislike(item.id)}
                      className={`px-3 py-1.5 text-sm transition-all ${
                        siteDislikes.includes(item.id)
                          ? "bg-red-500/20 text-red-400 border border-red-500/50"
                          : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Other feedback */}
              <div className="space-y-3">
                <p className="text-lg font-semibold text-gray-200">
                  Övrig feedback{" "}
                  <span className="text-gray-500 font-normal">(valfritt)</span>
                </p>
                <textarea
                  id="wizard-site-feedback"
                  name="site-feedback"
                  autoComplete="off"
                  value={siteOtherFeedback}
                  onChange={(e) => setSiteOtherFeedback(e.target.value)}
                  placeholder="Beskriv mer i detalj vad du vill ändra..."
                  rows={3}
                  className="w-full px-5 py-4 bg-black border-2 border-gray-800 text-base text-white placeholder-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none leading-relaxed transition-all hover:border-gray-700"
                />
              </div>
            </div>
          )}

          {/* Step 6: Inspiration sites */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Lightbulb className="h-6 w-6 text-amber-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Inspirationssajter{" "}
                  <span className="text-base font-normal text-gray-500">
                    (valfritt)
                  </span>
                </h3>
              </div>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
                Finns det webbplatser du gillar designen på? Lägg till upp till
                3 st.
              </p>

              <div className="space-y-3">
                {inspirationSites.map((site, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      id={`wizard-inspiration-${index}`}
                      name={`inspiration-site-${index}`}
                      type="url"
                      autoComplete="url"
                      value={site}
                      onChange={(e) =>
                        updateInspirationSite(index, e.target.value)
                      }
                      placeholder={`https://inspiration-${index + 1}.se`}
                      className="flex-1 px-5 py-4 bg-black border-2 border-gray-800 text-lg text-white placeholder-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all hover:border-gray-700"
                    />
                    {inspirationSites.length > 1 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => removeInspirationSite(index)}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {inspirationSites.length < 3 && (
                  <Button
                    variant="outline"
                    onClick={addInspirationSite}
                    className="w-full"
                  >
                    + Lägg till fler
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 7: Purpose */}
          {step === 7 && (
            <div className="space-y-5">
              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  Vad vill du uppnå?
                </h3>
                <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
                  Välj ett eller flera mål — vi anpassar designen efter detta
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PURPOSE_OPTIONS.map((option, idx) => (
                  <button
                    key={option.id}
                    onClick={() => togglePurpose(option.id)}
                    style={{ animationDelay: `${idx * 50}ms` }}
                    className={`group relative flex items-center gap-4 p-4 border-2 transition-all duration-200 text-left ${
                      purposes.includes(option.id)
                        ? "border-teal-400/50 bg-teal-500/10"
                        : "border-gray-800 hover:border-gray-700 hover:bg-gray-800/30"
                    }`}
                  >
                    <span
                      className={`text-3xl transition-transform duration-200 ${
                        purposes.includes(option.id)
                          ? "scale-110"
                          : "group-hover:scale-105"
                      }`}
                    >
                      {option.icon}
                    </span>
                    <div className="flex-1">
                      <span
                        className={`font-medium block ${
                          purposes.includes(option.id)
                            ? "text-teal-300"
                            : "text-gray-300"
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {option.desc}
                      </span>
                    </div>

                    {/* Checkbox style indicator */}
                    <div
                      className={`w-6 h-6 border-2 flex items-center justify-center transition-all ${
                        purposes.includes(option.id)
                          ? "bg-teal-500 border-teal-400"
                          : "border-gray-600 group-hover:border-gray-500"
                      }`}
                    >
                      {purposes.includes(option.id) && (
                        <Check className="h-4 w-4 text-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Summary */}
              {purposes.length > 0 && (
                <div className="p-3 bg-teal-500/10 border border-teal-500/30 text-sm">
                  <span className="text-teal-400">
                    {purposes.length} mål valda —
                    {purposes.length === 1 && " fokuserad strategi"}
                    {purposes.length === 2 && " balanserad strategi"}
                    {purposes.length >= 3 && " mångsidig strategi"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 8: Target audience */}
          {step === 8 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Users className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Vilka är dina kunder?
                </h3>
              </div>

              {/* Smart suggestion based on industry and location */}
              {currentIndustry?.suggestedAudience && (
                <div className="p-3 bg-teal-500/10 border border-teal-500/30">
                  <p className="text-xs text-teal-400 font-medium mb-1 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-teal-400 animate-pulse"></span>
                    AI-förslag baserat på {currentIndustry.label}
                    {location && ` i ${location}`}:
                  </p>
                  <p className="text-base text-gray-200 italic leading-relaxed">
                    &quot;{currentIndustry.suggestedAudience}&quot;
                  </p>
                  {targetAudience !== currentIndustry.suggestedAudience && (
                    <button
                      onClick={() =>
                        setTargetAudience(currentIndustry.suggestedAudience)
                      }
                      className="mt-2 text-xs text-teal-400 hover:text-teal-300 underline"
                    >
                      Använd detta förslag →
                    </button>
                  )}
                </div>
              )}

              <p className="text-base text-gray-300 leading-relaxed">
                Beskriv din målgrupp - anpassa gärna förslaget ovan eller skriv
                helt eget
              </p>
              <textarea
                id="wizard-target-audience"
                name="target-audience"
                autoComplete="off"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="T.ex. Lokala kaffeälskare i Vasastan, unga yrkesarbetande 25-40 år som söker en mysig miljö..."
                rows={4}
                className="w-full px-4 py-3 bg-black border border-gray-800 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />

              {/* Character count */}
              <div className="flex justify-between text-sm text-gray-400">
                <span>{targetAudience.length} tecken</span>
                {targetAudience.length > 0 && targetAudience.length < 30 && (
                  <span className="text-amber-400 font-medium">
                    Försök ge mer detaljer för bästa resultat
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 9: Special wishes */}
          {step === 9 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Sparkles className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Funktioner &amp; önskemål{" "}
                  <span className="text-base font-normal text-gray-500">
                    (valfritt)
                  </span>
                </h3>
              </div>

              {/* Quick-pick suggested features based on industry */}
              {currentIndustry?.suggestedFeatures &&
                currentIndustry.suggestedFeatures.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-teal-400 font-medium">
                      Populära funktioner för {currentIndustry.label}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentIndustry.suggestedFeatures.map((feature) => {
                        const isIncluded = specialWishes
                          .toLowerCase()
                          .includes(feature.toLowerCase());
                        return (
                          <button
                            key={feature}
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
                            className={`px-3 py-1.5 text-sm transition-all ${
                              isIncluded
                                ? "bg-teal-500/30 text-teal-300 border border-teal-500/50"
                                : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-teal-500/50 hover:text-teal-400"
                            }`}
                          >
                            {isIncluded ? "✓ " : "+ "}
                            {feature}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              <p className="text-base text-gray-300 leading-relaxed">
                Klicka på förslagen ovan eller skriv fritt nedan:
              </p>
              <textarea
                id="wizard-special-wishes"
                name="special-wishes"
                autoComplete="off"
                value={specialWishes}
                onChange={(e) => setSpecialWishes(e.target.value)}
                placeholder="T.ex. Jag vill ha meny med priser, öppettider, bildgalleri på lokalen, onlinebokning för bord..."
                rows={5}
                className="w-full px-5 py-4 bg-black border-2 border-gray-800 text-base text-white placeholder-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none leading-relaxed transition-all hover:border-gray-700"
              />

              {/* Voice input option */}
              <div className="pt-4 border-t border-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="h-5 w-5 text-teal-400" />
                  <h4 className="text-base font-semibold text-gray-300">
                    Eller beskriv med rösten
                  </h4>
                </div>
                <VoiceRecorder
                  onTranscript={(transcript) => {
                    // Append voice transcript to special wishes
                    setVoiceTranscript(transcript);
                    setSpecialWishes((prev) =>
                      prev
                        ? `${prev}\n\n[Röstinmatning]: ${transcript}`
                        : `[Röstinmatning]: ${transcript}`
                    );
                  }}
                  onRecordingChange={() => {}} // Optional: add visual feedback if needed
                  placeholder="Börja prata..."
                />
                {voiceTranscript && (
                  <p className="text-xs text-gray-500 mt-2">
                    Senaste röstinmatning: &quot;
                    {voiceTranscript.substring(0, 50)}
                    {voiceTranscript.length > 50 ? "..." : ""}&quot;
                  </p>
                )}
              </div>

              {/* Clear button if there's content */}
              {specialWishes && (
                <button
                  onClick={() => {
                    setSpecialWishes("");
                    setVoiceTranscript("");
                  }}
                  className="text-sm text-gray-500 hover:text-gray-300 font-medium transition-colors"
                >
                  Rensa allt
                </button>
              )}
            </div>
          )}

          {/* Step 10: Design & Component styles */}
          {step === 10 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-gray-300">
                <Sparkles className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Välj design och stil
                </h3>
              </div>
              <p className="text-base text-gray-300 leading-relaxed">
                Inspirerat av{" "}
                <a
                  href="https://v0.app/templates/components"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline"
                >
                  v0 templates
                </a>
                . Välj en stil för varje kategori.
              </p>

              {/* Hero Style */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Hero-sektion
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {COMPONENT_STYLES.hero.map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setComponentChoices((prev) => ({
                          ...prev,
                          hero: style.id,
                        }))
                      }
                      className={`p-3 border-2 transition-all text-left ${
                        componentChoices.hero === style.id
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-gray-800 hover:border-gray-700 bg-gray-900/50"
                      }`}
                    >
                      <span className="text-xl mb-1 block">{style.icon}</span>
                      <span className="text-xs font-medium text-white block truncate">
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation Style */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Navigation
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {COMPONENT_STYLES.navigation.map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setComponentChoices((prev) => ({
                          ...prev,
                          navigation: style.id,
                        }))
                      }
                      className={`p-3 border-2 transition-all text-left ${
                        componentChoices.navigation === style.id
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-gray-800 hover:border-gray-700 bg-gray-900/50"
                      }`}
                    >
                      <span className="text-xl mb-1 block">{style.icon}</span>
                      <span className="text-xs font-medium text-white block truncate">
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Style */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Layout
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {COMPONENT_STYLES.layout.map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setComponentChoices((prev) => ({
                          ...prev,
                          layout: style.id,
                        }))
                      }
                      className={`p-3 border-2 transition-all text-left ${
                        componentChoices.layout === style.id
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-gray-800 hover:border-gray-700 bg-gray-900/50"
                      }`}
                    >
                      <span className="text-xl mb-1 block">{style.icon}</span>
                      <span className="text-xs font-medium text-white block truncate">
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Effects */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Animeringar & Effekter
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {COMPONENT_STYLES.effects.map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setComponentChoices((prev) => ({
                          ...prev,
                          effects: style.id,
                        }))
                      }
                      className={`p-3 border-2 transition-all text-left ${
                        componentChoices.effects === style.id
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-gray-800 hover:border-gray-700 bg-gray-900/50"
                      }`}
                    >
                      <span className="text-xl mb-1 block">{style.icon}</span>
                      <span className="text-xs font-medium text-white block truncate">
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Overall Vibe */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Övergripande Stil / Vibe
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COMPONENT_STYLES.vibe.map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setComponentChoices((prev) => ({
                          ...prev,
                          vibe: style.id,
                        }))
                      }
                      className={`p-4 border-2 transition-all text-left ${
                        componentChoices.vibe === style.id
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-gray-800 hover:border-gray-700 bg-gray-900/50"
                      }`}
                    >
                      <span className="text-2xl mb-2 block">{style.icon}</span>
                      <span className="text-sm font-medium text-white block">
                        {style.label}
                      </span>
                      <span className="text-xs text-gray-500 block">
                        {style.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 11: Color palette */}
          {step === 11 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Palette className="h-6 w-6 text-teal-400" />
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Välj färgpalett för din webbplats
                </h3>
              </div>
              <p className="text-base text-gray-300 leading-relaxed">
                {industry
                  ? `Rekommenderade färger för ${
                      INDUSTRY_OPTIONS.find((i) => i.id === industry)?.label ||
                      "din bransch"
                    }`
                  : "Välj en färgkoordinerad palett eller skapa din egen"}
              </p>
              <ColorPalettePicker
                selectedPalette={selectedPalette}
                onSelect={setSelectedPalette}
                customColors={customColors || undefined}
                onCustomColorChange={handleCustomColorChange}
                industry={industry}
              />
            </div>
          )}

          {/* Edit Mode - Show after prompt generation */}
          {showEditMode && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-teal-400" />
                  <h3 className="text-2xl sm:text-3xl font-bold text-white">
                    Din genererade prompt
                  </h3>
                </div>
                <p className="text-base text-gray-300 leading-relaxed">
                  Redigera prompten om du vill, eller fortsätt med den som den
                  är. Du kan också låta AI:n förbättra den.
                </p>
              </div>

              <div className="relative">
                <textarea
                  id="wizard-edit-prompt"
                  name="edit-prompt"
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  rows={12}
                  className="w-full px-6 py-5 bg-black/50 border-2 border-gray-800 text-base text-white placeholder-gray-500 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all font-mono resize-none leading-relaxed"
                  placeholder="Din prompt kommer att visas här..."
                />
                <div className="absolute bottom-4 right-4 text-xs text-gray-500">
                  {editedPrompt.length} tecken
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={async () => {
                    // Improve prompt with AI
                    setIsExpanding(true);
                    try {
                      const response = await fetch("/api/expand-prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          companyName,
                          industry,
                          location,
                          existingWebsite,
                          siteLikes,
                          siteDislikes,
                          siteOtherFeedback,
                          inspirationSites: inspirationSites.filter((s) =>
                            s.trim()
                          ),
                          purposes,
                          targetAudience,
                          specialWishes: editedPrompt, // Use edited prompt as special wishes
                          palette: selectedPalette,
                          customColors,
                          componentChoices,
                          categoryType,
                          initialPrompt: editedPrompt, // Pass edited prompt as initial
                          websiteAnalysis,
                        }),
                      });

                      const data = await response.json();
                      if (response.ok && data.success) {
                        setEditedPrompt(data.expandedPrompt);
                        setGeneratedPrompt(data.expandedPrompt);
                      }
                    } catch (err) {
                      console.error("Failed to improve prompt:", err);
                    } finally {
                      setIsExpanding(false);
                    }
                  }}
                  disabled={isExpanding}
                  variant="outline"
                  className="gap-2 border-teal-500/50 text-teal-400 hover:bg-teal-500/10"
                >
                  <Sparkles className="h-4 w-4" />
                  {isExpanding ? "Förbättrar..." : "Förbättra med AI"}
                </Button>
                <Button
                  onClick={() => {
                    // Reset to original
                    setEditedPrompt(generatedPrompt || "");
                  }}
                  variant="ghost"
                  className="gap-2 text-gray-400 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  Återställ
                </Button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-base">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative p-6 border-t border-gray-800/50 flex flex-wrap justify-between items-center gap-3">
          {/* Back/Cancel button - hide when in edit mode */}
          {!showEditMode && (
            <Button
              variant="ghost"
              onClick={step === 1 ? onClose : handleBack}
              disabled={isExpanding}
              className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
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
          )}

          {/* Step indicator in footer - only show on large screens and not in edit mode */}
          {!showEditMode && (
            <div className="hidden lg:flex items-center gap-1 text-xs text-gray-600 max-w-xs truncate">
              {steps.map((s, idx) => (
                <span
                  key={s.id}
                  className={idx + 1 <= displayStep ? "text-gray-400" : ""}
                >
                  {s.name}
                  {idx < steps.length - 1 && <span className="mx-1">→</span>}
                </span>
              ))}
            </div>
          )}

          {showEditMode ? (
            <>
              <Button
                onClick={() => {
                  setShowEditMode(false);
                  setGeneratedPrompt(null);
                  setEditedPrompt("");
                }}
                variant="ghost"
                className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Tillbaka till wizard
              </Button>
              <Button
                onClick={() => {
                  const wizardData: WizardData = {
                    companyName,
                    industry,
                    location,
                    existingWebsite,
                    siteLikes,
                    siteDislikes,
                    siteOtherFeedback,
                    inspirationSites: inspirationSites.filter((s) => s.trim()),
                    purposes,
                    targetAudience,
                    // Use editedPrompt if user modified it, otherwise original
                    specialWishes:
                      editedPrompt !== generatedPrompt
                        ? `${specialWishes}\n\n[Redigerad prompt]: ${editedPrompt}`
                        : specialWishes,
                    palette: selectedPalette,
                    customColors,
                    voiceTranscript: voiceTranscript || undefined,
                    industryTrends: industryTrends || undefined,
                    websiteAnalysis: websiteAnalysis || undefined,
                  };
                  onComplete(wizardData, editedPrompt);
                }}
                className="gap-2 bg-teal-600 hover:bg-teal-500 px-6 text-lg"
              >
                <Rocket className="h-5 w-5" />
                Skapa webbplats
              </Button>
            </>
          ) : displayStep < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-all"
            >
              Nästa
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={!canProceed() || isExpanding}
              className="gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-all px-6"
            >
              {isExpanding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Skapar din prompt...
                </>
              ) : (
                <>
                  <span className="text-lg">✨</span>
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
