"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  ExternalLink,
  Video,
  Coffee,
  UtensilsCrossed,
  ShoppingBag,
  Monitor,
  BriefcaseBusiness,
  HeartPulse,
  Brush,
  GraduationCap,
  Store,
  House,
  ShoppingCart,
  Mail,
  ImageIcon,
  BookOpenText,
  BadgeCheck,
  CalendarCheck,
  BarChart3,
  RefreshCcw,
  PartyPopper,
  Gem,
  Cpu,
  Square,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ColorPalettePicker,
  type ColorPalette,
  PREDEFINED_PALETTES,
  getIndustryPalettes,
} from "@/components/forms/color-palette-picker";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { VideoRecorder } from "@/components/forms/video-recorder";
import { buildIntentNoun } from "@/lib/builder/build-intent";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { useAuth } from "@/lib/auth/auth-store";
import { StepVisual } from "@/components/modals/step-visual";
import { CompetitorMap } from "@/components/modals/competitor-map";
import { LocationPicker } from "@/components/modals/location-picker";
import { formatPromptForV0 } from "@/lib/builder/promptAssist";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import type { Competitor } from "@/app/api/wizard/competitors/route";

/**
 * PromptWizardModal V2 - Adaptive Business Analysis Wizard
 *
 * 5 focused steps with AI-driven follow-up questions:
 * 1. About You (Company + Industry + Location + Website scraping)
 * 2. Your Goals (Purpose + Audience + USP + AI follow-ups)
 * 3. Existing Site & Inspiration (Analysis + Feedback + Trends)
 * 4. Design Preferences (Vibe + Color palette)
 * 5. Review & Generate (Brief preview + Voice + Final edit)
 *
 * Key improvements over V1:
 * - AI-driven follow-up questions adapt to business context
 * - Web scraper integration for existing websites
 * - USP and competitive differentiation questions
 * - Voice input throughout
 * - Brief-based output for better builder integration
 */

// ── Industry options with context ──────────────────────────────────

type IndustryOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  suggestedFeatures: string[];
};

const INDUSTRY_OPTIONS: IndustryOption[] = [
  {
    id: "cafe",
    label: "Café/Konditori",
    icon: Coffee,
    suggestedFeatures: ["Meny", "Öppettider", "Bildgalleri", "Bordbokning"],
  },
  {
    id: "restaurant",
    label: "Restaurang/Bar",
    icon: UtensilsCrossed,
    suggestedFeatures: ["Meny", "Bordbokning", "Events", "Chef's specials"],
  },
  {
    id: "retail",
    label: "Butik/Detaljhandel",
    icon: ShoppingBag,
    suggestedFeatures: ["Produktkatalog", "Erbjudanden", "Hitta butik"],
  },
  {
    id: "tech",
    label: "Tech/IT-företag",
    icon: Monitor,
    suggestedFeatures: ["Tjänster", "Case studies", "Prissättning"],
  },
  {
    id: "consulting",
    label: "Konsult/Tjänster",
    icon: BriefcaseBusiness,
    suggestedFeatures: ["Tjänster", "Team", "Kontakt", "Testimonials"],
  },
  {
    id: "health",
    label: "Hälsa/Wellness",
    icon: HeartPulse,
    suggestedFeatures: ["Behandlingar", "Onlinebokning", "Prislista"],
  },
  {
    id: "creative",
    label: "Kreativ byrå",
    icon: Brush,
    suggestedFeatures: ["Portfolio", "Tjänster", "Process", "Kontakt"],
  },
  {
    id: "education",
    label: "Utbildning",
    icon: GraduationCap,
    suggestedFeatures: ["Kurser", "Schema", "Anmälan", "Lärare"],
  },
  {
    id: "ecommerce",
    label: "E-handel",
    icon: Store,
    suggestedFeatures: ["Produkter", "Varukorg", "Checkout", "Recensioner"],
  },
  {
    id: "realestate",
    label: "Fastigheter",
    icon: House,
    suggestedFeatures: ["Objekt", "Sök/Filter", "Kontakt", "Värdering"],
  },
  {
    id: "other",
    label: "Annat",
    icon: Sparkles,
    suggestedFeatures: [],
  },
];

// Purpose options
type PurposeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
};

const PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "sell", label: "Sälja", icon: ShoppingCart, desc: "Produkter/tjänster" },
  { id: "leads", label: "Leads", icon: Mail, desc: "Fånga kontakter" },
  { id: "portfolio", label: "Portfolio", icon: ImageIcon, desc: "Visa arbeten" },
  { id: "inform", label: "Informera", icon: BookOpenText, desc: "Dela kunskap" },
  { id: "brand", label: "Varumärke", icon: BadgeCheck, desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", icon: CalendarCheck, desc: "Ta emot bokningar" },
  { id: "conversion", label: "Konvertering", icon: BarChart3, desc: "Öka konvertering" },
  { id: "rebrand", label: "Rebrand", icon: RefreshCcw, desc: "Ny identitet" },
];

// Design vibe options
type VibeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const VIBE_OPTIONS: VibeOption[] = [
  { id: "modern", label: "Modern & Clean", icon: Sparkles },
  { id: "playful", label: "Playful & Fun", icon: PartyPopper },
  { id: "brutalist", label: "Brutalist", icon: Building2 },
  { id: "luxury", label: "Luxury", icon: Gem },
  { id: "tech", label: "Futuristic", icon: Cpu },
  { id: "minimal", label: "Minimal", icon: Square },
];

// ── Types ─────────────────────────────────────────────────────────

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
  locationLat?: number;
  locationLng?: number;
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
  usp?: string;
  followUpAnswers?: Record<string, string>;
}

interface PromptWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: WizardData, expandedPrompt: string) => void;
  initialPrompt?: string;
  /** Pre-fill company name (e.g. from ?company=xxx entry param) */
  initialCompanyName?: string;
  categoryType?: string;
  buildIntent?: BuildIntent;
}

// ── Follow-up question types from API ─────────────────────────────

interface FollowUpQuestion {
  id: string;
  text: string;
  type: "text" | "select" | "chips";
  options?: string[];
  placeholder?: string;
  priority?: "low" | "medium" | "high";
  dependsOn?: {
    answerId: string;
    includes?: string[];
    excludes?: string[];
  };
}

interface EnrichSuggestion {
  type: "audience" | "feature" | "usp" | "palette" | "trend";
  text: string;
}

interface ScrapedData {
  title?: string;
  description?: string;
  headings?: string[];
  wordCount?: number;
  hasImages?: boolean;
  textSummary?: string;
}

interface EnrichMeta {
  confidence?: number;
  needsClarification?: boolean;
  unknowns?: string[];
  priority?: "low" | "medium" | "high";
}

interface EnrichResponsePayload {
  questions?: FollowUpQuestion[];
  suggestions?: EnrichSuggestion[];
  insightSummary?: string | null;
  scrapedData?: ScrapedData | null;
  meta?: EnrichMeta;
  contextHash?: string;
}

const CLARIFY_FALLBACK_ID = "clarify_fallback";

// ── Design feature chips ──────────────────────────────────────────
type DesignFeature = {
  id: string;
  label: string;
  promptText: string;
  relevantIndustries?: string[];
};

const DESIGN_FEATURES: DesignFeature[] = [
  { id: "want_animations", label: "Snygga animationer", promptText: "Include tasteful animations (scroll reveals, hover effects, micro-interactions)" },
  { id: "want_dark_mode", label: "Mörkt/ljust tema", promptText: "Dark mode support with theme toggle" },
  { id: "want_logo", label: "Skapa logotyp", promptText: "Generate a professional logo/wordmark for the brand" },
  { id: "want_contact_form", label: "Kontaktformulär", promptText: "Contact form with validation and success state" },
  { id: "want_newsletter", label: "Nyhetsbrev", promptText: "Newsletter signup section with email capture" },
  { id: "want_social", label: "Sociala medier", promptText: "Social media links and feed integration" },
  { id: "want_booking", label: "Bokningsfunktion", promptText: "Integrated booking/scheduling widget", relevantIndustries: ["cafe", "restaurant", "health", "creative", "consulting"] },
  { id: "want_i18n", label: "Flerspråkigt", promptText: "Multi-language support (Swedish + English)" },
  { id: "want_map", label: "Karta med plats", promptText: "Embedded map showing business location" },
  { id: "want_blog", label: "Blogg/Nyheter", promptText: "Blog section with article cards and pagination" },
];

function looksLikeDomain(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length < 4) return false;
  if (/^(ingen|nej|vet inte|saknar|har inte|n\/a)/i.test(trimmed)) return false;
  return /\.[a-z]{2,}$/i.test(trimmed.replace(/^https?:\/\//i, ""));
}

// ── Shared input class (landing-style) ─────────────────────────────

const INPUT_CLASS =
  "w-full rounded-xl border border-border/30 bg-secondary/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none";

// ── FollowUpRenderer ──────────────────────────────────────────────

function isFollowUpQuestionVisible(
  question: FollowUpQuestion,
  answers: Record<string, string>,
): boolean {
  if (!question.dependsOn) return true;
  const dep = question.dependsOn;
  const source = (answers[dep.answerId] || "").toLowerCase();
  if (dep.includes?.length) {
    const hasAny = dep.includes.some((token) => source.includes(token.toLowerCase()));
    if (!hasAny) return false;
  }
  if (dep.excludes?.length) {
    const hasExcluded = dep.excludes.some((token) => source.includes(token.toLowerCase()));
    if (hasExcluded) return false;
  }
  return true;
}

function getVisibleFollowUpQuestions(
  questions: FollowUpQuestion[],
  answers: Record<string, string>,
): FollowUpQuestion[] {
  return questions.filter((q) => isFollowUpQuestionVisible(q, answers));
}

function FollowUpRenderer({
  questions,
  answers,
  onAnswer,
}: {
  questions: FollowUpQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}) {
  const visibleQuestions = useMemo(() => {
    return getVisibleFollowUpQuestions(questions, answers);
  }, [questions, answers]);

  if (!visibleQuestions.length) return null;

  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Anpassade frågor för ert sajtbygge
      </div>
      {visibleQuestions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-sm text-foreground">
            {q.text}
            {q.priority === "high" ? (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">Viktig</span>
            ) : null}
          </label>
          {q.type === "text" && (
            <input
              type="text"
              value={answers[q.id] || ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={q.placeholder || ""}
              className={INPUT_CLASS + " text-sm"}
            />
          )}
          {q.type === "select" && q.options && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onAnswer(q.id, opt)}
                  className={`rounded-full border px-3 py-1 text-xs transition-all ${
                    answers[q.id] === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {q.type === "chips" && q.options && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const selected = (answers[q.id] || "").split(", ").filter(Boolean);
                const isActive = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      const next = isActive
                        ? selected.filter((s) => s !== opt)
                        : [...selected, opt];
                      onAnswer(q.id, next.join(", "));
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {isActive ? "✓" : "+"} {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export function PromptWizardModalV2({
  isOpen,
  onClose,
  onComplete,
  initialPrompt = "",
  initialCompanyName = "",
  categoryType: _categoryType = "website",
  buildIntent = "website",
}: PromptWizardModalProps) {
  const { isAuthenticated, isInitialized } = useAuth();
  const [step, setStep] = useState<number>(1);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Loading states
  const [isExpanding, setIsExpanding] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isClarifying, setIsClarifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated prompt state
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [showEditMode, setShowEditMode] = useState(false);

  // AI follow-up state
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<EnrichSuggestion[]>([]);
  const [insightSummary, setInsightSummary] = useState<string | null>(null);
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null);
  const [activeEnrichMeta, setActiveEnrichMeta] = useState<EnrichMeta | null>(null);
  const [clarifyQuestions, setClarifyQuestions] = useState<FollowUpQuestion[]>([]);
  const [showClarifyGate, setShowClarifyGate] = useState(false);
  const enrichCacheRef = useRef<Map<string, EnrichResponsePayload>>(new Map());
  const enrichByStepRef = useRef<Map<number, EnrichResponsePayload>>(new Map());

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: About You
  // ═══════════════════════════════════════════════════════════════
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [locationLat, setLocationLat] = useState<number | undefined>();
  const [locationLng, setLocationLng] = useState<number | undefined>();
  const [existingWebsite, setExistingWebsite] = useState("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Your Goals
  // ═══════════════════════════════════════════════════════════════
  const [purposes, setPurposes] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");
  const [usp, setUsp] = useState("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Existing Site & Inspiration
  // ═══════════════════════════════════════════════════════════════
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
  const [presentationAnalysis, setPresentationAnalysis] = useState<{
    overallScore?: number;
    toneFeedback?: string;
    pitchFeedback?: string;
    keyMessage?: string;
    strengthHighlight?: string;
  } | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // V3: Intelligence state
  // ═══════════════════════════════════════════════════════════════
  const [companyLookup, setCompanyLookup] = useState<CompanyLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [marketInsight, setMarketInsight] = useState<string | null>(null);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [audienceSuggestion, setAudienceSuggestion] = useState<string | null>(null);
  const autoAnalyzeRef = useRef<string | null>(null);
  const companyLookupRef = useRef<string | null>(null);
  const competitorsRef = useRef<string | null>(null);

  // Get current industry data
  const currentIndustry = INDUSTRY_OPTIONS.find((i) => i.id === industry);
  const shouldIncludeResearchStep = useMemo(() => {
    if (existingWebsite.trim()) return true;
    if (siteFeedback.trim()) return true;
    if (inspirationSites.some((site) => site.trim())) return true;
    if (purposes.includes("rebrand") || purposes.includes("conversion")) return true;
    if (competitors.length > 0) return true;
    if (websiteAnalysis) return true;
    return false;
  }, [existingWebsite, siteFeedback, inspirationSites, purposes, competitors.length, websiteAnalysis]);
  const stepFlow = useMemo<number[]>(
    () => (shouldIncludeResearchStep ? [1, 2, 3, 4, 5] : [1, 2, 4, 5]),
    [shouldIncludeResearchStep],
  );
  const totalSteps = stepFlow.length;
  const currentStepIndex = stepFlow.indexOf(step);

  useEffect(() => {
    if (currentStepIndex !== -1) return;
    if (step > 3 && stepFlow.includes(4)) {
      setStep(4);
      return;
    }
    setStep(stepFlow[0] ?? 1);
  }, [step, stepFlow, currentStepIndex]);

  // ── Persist wizard state in localStorage ──────────────────────
  const STORAGE_KEY = "sajtmaskin_wizard_draft";

  // Restore saved draft on first open
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!isOpen || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      // Only restore if draft is recent (< 7 days)
      if (draft._ts && Date.now() - draft._ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (draft.companyName) setCompanyName(draft.companyName);
      if (draft.industry) setIndustry(draft.industry);
      if (draft.location) setLocation(draft.location);
      if (typeof draft.locationLat === "number") setLocationLat(draft.locationLat);
      if (typeof draft.locationLng === "number") setLocationLng(draft.locationLng);
      if (draft.existingWebsite) setExistingWebsite(draft.existingWebsite);
      if (draft.purposes?.length) setPurposes(draft.purposes);
      if (draft.targetAudience) setTargetAudience(draft.targetAudience);
      if (draft.usp) setUsp(draft.usp);
      if (draft.siteFeedback) setSiteFeedback(draft.siteFeedback);
      if (Array.isArray(draft.inspirationSites) && draft.inspirationSites.length > 0) {
        setInspirationSites(draft.inspirationSites.slice(0, 3));
      }
      if (draft.selectedVibe) setSelectedVibe(draft.selectedVibe);
      if (draft.specialWishes) setSpecialWishes(draft.specialWishes);
      if (draft.customColors) setCustomColors(draft.customColors);
      if (draft.selectedPaletteName) {
        const savedPalette = PREDEFINED_PALETTES.find((p) => p.name === draft.selectedPaletteName);
        if (savedPalette) setSelectedPalette(savedPalette);
      }
      if (draft.followUpAnswers && typeof draft.followUpAnswers === "object") {
        setFollowUpAnswers(draft.followUpAnswers);
      }
      if (draft.step && draft.step > 1) setStep(draft.step);
    } catch {
      // ignore corrupt data
    }
  }, [isOpen]);

  // Auto-save draft whenever key fields change
  useEffect(() => {
    if (!isOpen) return;
    // Don't save empty state
    if (!companyName && !industry) return;
    const draft = {
      companyName, industry, location, locationLat, locationLng, existingWebsite,
      purposes, targetAudience, usp, siteFeedback,
      inspirationSites,
      selectedVibe, specialWishes, step,
      selectedPaletteName: selectedPalette?.name || null,
      customColors,
      followUpAnswers,
      _ts: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore (private browsing etc)
    }
  }, [
    isOpen, companyName, industry, location, locationLat, locationLng, existingWebsite,
    purposes, targetAudience, usp, siteFeedback,
    inspirationSites,
    selectedVibe, specialWishes, step,
    selectedPalette, customColors,
    followUpAnswers,
  ]);

  // Clear draft when wizard completes
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── Follow-up answer handler ──────────────────────────────────
  const handleFollowUpAnswer = useCallback((id: string, value: string) => {
    setFollowUpAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  // ── Stable ref for enrichment data (avoids dependency churn) ──
  const enrichDataRef = useRef({
    companyName, industry, location, existingWebsite,
    inspirationSites,
    purposes, targetAudience, usp, selectedVibe,
    specialWishes, followUpAnswers,
  });
  enrichDataRef.current = {
    companyName, industry, location, existingWebsite,
    inspirationSites,
    purposes, targetAudience, usp, selectedVibe,
    specialWishes, followUpAnswers,
  };

  const applyEnrichmentToActiveStep = useCallback((payload: EnrichResponsePayload | null) => {
    setFollowUpQuestions(payload?.questions ?? []);
    setSuggestions(payload?.suggestions ?? []);
    setInsightSummary(payload?.insightSummary ?? null);
    setScrapedData(payload?.scrapedData ?? null);
    setActiveEnrichMeta(payload?.meta ?? null);
    const aiAudience = payload?.suggestions?.find((s) => s.type === "audience");
    if (aiAudience?.text) {
      setAudienceSuggestion(aiAudience.text);
    }
  }, []);

  // AbortController to cancel in-flight requests
  const enrichAbortRef = useRef<AbortController | null>(null);
  const buildEnrichContextHash = useCallback(
    (currentStep: number, mode: "step" | "final_check", scrapeUrl?: string) => {
      const d = enrichDataRef.current;
      const followUps = Object.entries(d.followUpAnswers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v.trim()]);
      return JSON.stringify({
        mode,
        step: currentStep,
        scrapeUrl: scrapeUrl || "",
        companyName: d.companyName.trim(),
        industry: d.industry,
        location: d.location.trim(),
        existingWebsite: d.existingWebsite.trim(),
        inspirationSites: d.inspirationSites.map((site) => site.trim()).filter(Boolean),
        purposes: [...d.purposes].sort(),
        targetAudience: d.targetAudience.trim(),
        usp: d.usp.trim(),
        selectedVibe: d.selectedVibe,
        specialWishes: d.specialWishes.trim(),
        followUps,
      });
    },
    [],
  );

  // ── Fetch AI enrichment for current step ──────────────────────
  const fetchEnrichment = useCallback(
    async (
      currentStep: number,
      options: { scrapeUrl?: string; mode?: "step" | "final_check"; force?: boolean } = {},
    ): Promise<EnrichResponsePayload | null> => {
      const mode = options.mode ?? "step";
      const scrapeUrl = options.scrapeUrl;
      const contextHash = buildEnrichContextHash(currentStep, mode, scrapeUrl);
      // Wizard enrich requires auth (credits action). Skip calls for guests.
      if (!isInitialized || !isAuthenticated) return null;

      if (!options.force) {
        const cached = enrichCacheRef.current.get(contextHash);
        if (cached) {
          if (mode === "step") {
            enrichByStepRef.current.set(currentStep, cached);
            if (stepRef.current === currentStep) {
              applyEnrichmentToActiveStep(cached);
            }
          }
          return cached;
        }
      }

      // Cancel any in-flight request
      enrichAbortRef.current?.abort();
      const controller = new AbortController();
      enrichAbortRef.current = controller;

      setIsEnriching(true);
      try {
        const d = enrichDataRef.current;
        const response = await fetch("/api/wizard/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode,
            step: currentStep,
            data: {
              companyName: d.companyName,
              industry: d.industry,
              location: d.location,
              existingWebsite: d.existingWebsite,
              inspirationSites: d.inspirationSites,
              purposes: d.purposes,
              targetAudience: d.targetAudience,
              usp: d.usp,
              selectedVibe: d.selectedVibe,
              specialWishes: d.specialWishes,
              previousFollowUps: d.followUpAnswers,
              companyLookup: companyLookup?.found ? {
                found: true,
                employees: companyLookup.employees,
                revenueKsek: companyLookup.revenueKsek,
                industries: companyLookup.industries,
                purpose: companyLookup.purpose,
              } : undefined,
              competitors: competitors.length ? competitors.map((c) => ({
                name: c.name,
                website: c.website,
              })) : undefined,
            },
            scrapeUrl,
          }),
        });

        if (!response.ok) {
          // Expected when auth/session is stale. Keep this non-fatal and quiet.
          if (response.status === 401) return null;
          console.warn("[Wizard] Enrich request failed:", response.status);
          return null;
        }

        const data = (await response.json()) as EnrichResponsePayload;
        const payload: EnrichResponsePayload = {
          questions: Array.isArray(data.questions) ? data.questions : [],
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          insightSummary: data.insightSummary || null,
          scrapedData: data.scrapedData || null,
          meta: data.meta,
          contextHash,
        };

        enrichCacheRef.current.set(contextHash, payload);
        if (mode === "step") {
          enrichByStepRef.current.set(currentStep, payload);
          if (stepRef.current === currentStep) {
            applyEnrichmentToActiveStep(payload);
          }
        }
        return payload;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return null;
        console.warn("[Wizard] Enrich failed (non-fatal):", err);
        return null;
      } finally {
        setIsEnriching(false);
      }
    },
    [applyEnrichmentToActiveStep, buildEnrichContextHash, isAuthenticated, isInitialized, companyLookup, competitors],
  );

  // ── Scrape website: quick-scrape first, then AI analysis with real content ──
  const handleScrapeWebsite = useCallback(
    (url: string) => {
      if (!url) return;
      setIsScraping(true);
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;

      // Phase 1: Quick scrape, then feed result into AI analysis
      fetch("/api/wizard/quick-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      })
        .then((r) => r.json())
        .then((d) => {
          const quickData = d.success && d.data ? d.data : null;
          if (quickData) {
            setScrapedData(quickData);
          }

          // Phase 2: AI analysis -- pass scraped content so the model has real data
          fetch("/api/analyze-website", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: fullUrl,
              scrapedContent: quickData ?? undefined,
            }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.success && d.analysis) setWebsiteAnalysis(d.analysis);
            })
            .catch(() => {})
            .finally(() => setIsScraping(false));
        })
        .catch(() => {
          // Quick-scrape failed entirely -- still try AI analysis without content
          fetch("/api/analyze-website", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: fullUrl }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.success && d.analysis) setWebsiteAnalysis(d.analysis);
            })
            .catch(() => {})
            .finally(() => setIsScraping(false));
        });

      // Phase 3: Full enrich with scrape data -- runs alongside
      void fetchEnrichment(step, { scrapeUrl: fullUrl, force: true });
    },
    [fetchEnrichment, step],
  );

  // Restore step-specific enrichment result when navigating.
  useEffect(() => {
    if (!isOpen) return;
    const stepResult = enrichByStepRef.current.get(step) || null;
    applyEnrichmentToActiveStep(stepResult);
    setShowClarifyGate(false);
    setClarifyQuestions([]);
  }, [applyEnrichmentToActiveStep, isOpen, step]);

  // ── Auto-enrich on step change (debounced, single request) ────
  useEffect(() => {
    if (!isOpen) return;
    if (step >= 2 && companyName && industry) {
      const timer = setTimeout(() => {
        void fetchEnrichment(step, { mode: "step" });
      }, 500);
      const prefetchTimer = setTimeout(() => {
        const nextStep = stepFlow[currentStepIndex + 1];
        if (!nextStep || nextStep === 5) return;
        void fetchEnrichment(nextStep, { mode: "step" });
      }, 1200);
      return () => {
        clearTimeout(timer);
        clearTimeout(prefetchTimer);
      };
    }
  }, [step, isOpen, companyName, industry, fetchEnrichment, stepFlow, currentStepIndex]);

  // Abort in-flight enrich requests when modal closes
  useEffect(() => {
    if (!isOpen) {
      enrichAbortRef.current?.abort();
      enrichAbortRef.current = null;
    }
  }, [isOpen]);

  // ── V3: Auto-detect domain and start background analysis ─────
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    const value = existingWebsite.trim();
    if (!looksLikeDomain(value) || autoAnalyzeRef.current === value) return;
    const timer = setTimeout(() => {
      if (autoAnalyzeRef.current === value) return;
      autoAnalyzeRef.current = value;
      handleScrapeWebsite(value);
    }, 800);
    return () => clearTimeout(timer);
  }, [existingWebsite, isOpen, isAuthenticated, handleScrapeWebsite]);

  // ── V3: Auto company lookup from companyName ──────────────────
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !isInitialized) return;
    const name = companyName.trim();
    if (name.length < 3 || companyLookupRef.current === name) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (companyLookupRef.current === name) return;
      companyLookupRef.current = name;
      setIsLookingUp(true);
      fetch("/api/wizard/company-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ companyName: name }),
      })
        .then((r) => r.json())
        .then((data: CompanyLookupResult) => {
          if (data.found) setCompanyLookup(data);
        })
        .catch(() => {})
        .finally(() => setIsLookingUp(false));
    }, 1200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyName, isOpen, isAuthenticated, isInitialized]);

  // Auto-fill location from company lookup (only if user hasn't set one)
  useEffect(() => {
    if (!companyLookup?.city || location.trim()) return;
    setLocation(companyLookup.city);
  }, [companyLookup, location]);

  // ── V3: Auto competitor discovery ─────────────────────────────
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !isInitialized) return;
    if (!companyName.trim() || !industry) return;
    const key = `${companyName.trim()}|${industry}|${location.trim()}|${locationLat?.toFixed(5) ?? ""}|${locationLng?.toFixed(5) ?? ""}`;
    if (competitorsRef.current === key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (competitorsRef.current === key) return;
      competitorsRef.current = key;
      setIsLoadingCompetitors(true);
      fetch("/api/wizard/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          companyName: companyName.trim(),
          industry,
          location: location.trim(),
          lat: locationLat,
          lng: locationLng,
          existingWebsite: existingWebsite.trim(),
        }),
      })
        .then((r) => r.json())
        .then((data: { competitors?: Competitor[]; marketInsight?: string }) => {
          if (data.competitors?.length) setCompetitors(data.competitors);
          if (data.marketInsight) setMarketInsight(data.marketInsight);
        })
        .catch(() => {})
        .finally(() => setIsLoadingCompetitors(false));
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyName, industry, location, locationLat, locationLng, existingWebsite, isOpen, isAuthenticated, isInitialized]);

  // Toggle purpose selection
  const togglePurpose = useCallback((purposeId: string) => {
    setPurposes((prev) =>
      prev.includes(purposeId) ? prev.filter((p) => p !== purposeId) : [...prev, purposeId],
    );
  }, []);

  // Handle industry change -- audience suggestion comes from AI enrich, not static data
  const handleIndustryChange = useCallback((newIndustry: string) => {
    setIndustry(newIndustry);
    setAudienceSuggestion(null);
    const industryPalettes = getIndustryPalettes(newIndustry);
    if (industryPalettes.length > 0) {
      setSelectedPalette(industryPalettes[0]);
    }
  }, []);

  // Inspiration helpers
  const addInspirationSite = useCallback(() => {
    if (inspirationSites.length < 3) {
      setInspirationSites((prev) => [...prev, ""]);
    }
  }, [inspirationSites.length]);

  const updateInspirationSite = useCallback((index: number, value: string) => {
    setInspirationSites((prev) => {
      const newSites = [...prev];
      newSites[index] = value;
      return newSites;
    });
  }, []);

  // Step validation
  const visibleClarifyQuestions = useMemo(
    () => getVisibleFollowUpQuestions(clarifyQuestions, followUpAnswers),
    [clarifyQuestions, followUpAnswers],
  );
  const hasClarifyUnknowns = (activeEnrichMeta?.unknowns?.length ?? 0) > 0;
  const requiresClarifyFallback =
    showClarifyGate && hasClarifyUnknowns && visibleClarifyQuestions.length === 0;

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return companyName.trim().length >= 2 && industry.length > 0;
      case 2:
        return purposes.length > 0;
      case 3:
        return true;
      case 4:
        return selectedPalette !== null || customColors !== null;
      case 5:
        if (!showClarifyGate) return true;
        if (visibleClarifyQuestions.length > 0) {
          return visibleClarifyQuestions.every(
            (q) => (followUpAnswers[q.id] || "").trim().length > 0,
          );
        }
        if (requiresClarifyFallback) {
          return (followUpAnswers[CLARIFY_FALLBACK_ID] || "").trim().length > 0;
        }
        return true;
      default:
        return true;
    }
  }, [
    step,
    companyName,
    industry,
    purposes,
    selectedPalette,
    customColors,
    showClarifyGate,
    visibleClarifyQuestions,
    requiresClarifyFallback,
    followUpAnswers,
  ]);

  // Step navigation
  const handleNext = useCallback(() => {
    const index = stepFlow.indexOf(step);
    if (index === -1) return;
    const nextStep = stepFlow[index + 1];
    if (nextStep) setStep(nextStep);
  }, [step, stepFlow]);

  const handleBack = useCallback(() => {
    const index = stepFlow.indexOf(step);
    if (index <= 0) return;
    const previousStep = stepFlow[index - 1];
    if (previousStep) setStep(previousStep);
  }, [step, stepFlow]);

  const shouldAskForClarification = useCallback(() => {
    const confidence = activeEnrichMeta?.confidence ?? 1;
    const answeredFollowUpsCount = Object.values(followUpAnswers).filter((value) => value.trim()).length;
    const unansweredHighPriority = followUpQuestions.some(
      (q) => q.priority === "high" && !(followUpAnswers[q.id] || "").trim(),
    );
    const weakCoreContext = !targetAudience.trim() || !usp.trim();
    return (
      Boolean(activeEnrichMeta?.needsClarification) ||
      confidence < 0.58 ||
      unansweredHighPriority ||
      (weakCoreContext && answeredFollowUpsCount < 2)
    );
  }, [activeEnrichMeta, followUpQuestions, followUpAnswers, targetAudience, usp]);

  // ── Generate clean prompt for builder ─────────────────────────
  // The prompt is sent as the first chat message to v0. It should be a
  // clear, structured website specification -- NOT a raw data dump.
  // The builder's own "deep brief" system (if enabled) will further
  // refine this into pages/sections/visual direction.
  const handleGenerate = useCallback(async () => {
    setIsExpanding(true);
    setError(null);

    try {
      if (!showClarifyGate && shouldAskForClarification()) {
        setIsClarifying(true);
        const clarification = await fetchEnrichment(5, {
          mode: "final_check",
          force: true,
        });
        const finalQuestions = clarification?.questions || [];
        const finalMeta = clarification?.meta;
        const finalUnknowns = finalMeta?.unknowns || [];
        const needsClarification =
          finalQuestions.length > 0 || Boolean(finalMeta?.needsClarification) || finalUnknowns.length > 0;

        if (finalMeta) {
          setActiveEnrichMeta(finalMeta);
        }

        if (needsClarification) {
          setClarifyQuestions(finalQuestions);
          setShowClarifyGate(true);
          setError(
            finalQuestions.length > 0
              ? "Svara på AI:s klargörande frågor innan vi skapar briefen."
              : "AI behöver ett kort förtydligande. Svara i fältet nedan innan vi skapar briefen.",
          );
          return;
        }
      }

      if (showClarifyGate) {
        if (
          visibleClarifyQuestions.length > 0 &&
          visibleClarifyQuestions.some((q) => (followUpAnswers[q.id] || "").trim().length === 0)
        ) {
          setError("Några klargöranden saknar svar. Fyll i dem, eller gå tillbaka och justera input.");
          return;
        }
        if (requiresClarifyFallback && !(followUpAnswers[CLARIFY_FALLBACK_ID] || "").trim()) {
          setError("AI behöver ett förtydligande. Skriv ett kort svar i klargörandefältet.");
          return;
        }
      }

      const palette = customColors || selectedPalette;
      const industryLabel = currentIndustry?.label || industry || "general";
      const intentLabel = buildIntentNoun(buildIntent);
      const vibeLabel = VIBE_OPTIONS.find((v) => v.id === selectedVibe)?.label || selectedVibe;

      // Collect follow-up answers into readable context
      const followUpLines = Object.entries(followUpAnswers)
        .filter(([, v]) => v.trim())
        .map(([, v]) => v);

      // ── Build a structured, readable prompt ─────────────────────
      const sections: string[] = [];

      // 1. Core request (what to build)
      sections.push(
        `Create a ${intentLabel} for "${companyName || "a business"}" in the ${industryLabel} industry.` +
        (location ? ` Based in ${location}.` : ""),
      );

      // 2. Business context (who they are, what makes them unique)
      const businessContext: string[] = [];
      if (usp) businessContext.push(`USP: ${usp}`);
      if (targetAudience) businessContext.push(`Target audience: ${targetAudience}`);
      if (purposes.length) {
        const purposeLabels = purposes.map(
          (p) => PURPOSE_OPTIONS.find((o) => o.id === p)?.label || p,
        );
        businessContext.push(`Primary goals: ${purposeLabels.join(", ")}`);
      }
      if (companyLookup?.found) {
        if (companyLookup.purpose) businessContext.push(`Company description: ${companyLookup.purpose}`);
        if (companyLookup.employees) businessContext.push(`Employees: ~${companyLookup.employees}`);
        if (companyLookup.industries?.length) businessContext.push(`Registered industries: ${companyLookup.industries.join(", ")}`);
      }
      if (followUpLines.length) businessContext.push(...followUpLines);
      if (businessContext.length) {
        sections.push(`\nBusiness profile:\n${businessContext.map((l) => `- ${l}`).join("\n")}`);
      }

      // 3. Design direction (visual style, colors)
      const designParts: string[] = [];
      designParts.push(`Visual style: ${vibeLabel}`);
      if (palette) {
        designParts.push(`Color palette: primary ${palette.primary}, secondary ${palette.secondary}, accent ${palette.accent}`);
      }
      sections.push(`\nDesign direction:\n${designParts.map((l) => `- ${l}`).join("\n")}`);

      // 4. Existing site context (if any -- brief summary only)
      if (existingWebsite || websiteAnalysis || scrapedData) {
        const siteParts: string[] = [];
        if (existingWebsite) siteParts.push(`Current site: ${existingWebsite}`);
        if (scrapedData?.title) siteParts.push(`"${scrapedData.title}" (${scrapedData.wordCount || 0} words)`);
        if (siteFeedback) siteParts.push(`Wants to improve: ${siteFeedback}`);
        if (websiteAnalysis) siteParts.push(`AI analysis summary: ${websiteAnalysis.slice(0, 200)}`);
        sections.push(`\nExisting site context:\n${siteParts.map((l) => `- ${l}`).join("\n")}`);
      }

      // 5. Inspiration + competitors
      const inspirations = inspirationSites.filter((s) => s.trim());
      if (inspirations.length) {
        sections.push(`\nInspiration sites: ${inspirations.join(", ")}`);
      }
      if (competitors.length > 0) {
        const compNames = competitors.slice(0, 4).map((c) =>
          c.website ? `${c.name} (${c.website})` : c.name,
        );
        sections.push(`\nKey competitors in the area: ${compNames.join(", ")}`);
        if (marketInsight) sections.push(`Market insight: ${marketInsight}`);
      }

      // 6. Special requirements (features, wishes, voice/video input)
      const requirements: string[] = [];
      if (specialWishes) {
        // Clean up voice/video transcript markers for a cleaner prompt
        const cleaned = specialWishes
          .replace(/\[Röstinmatning\]:\s*/g, "")
          .replace(/\[Videopresentation\]:\s*/g, "")
          .trim();
        if (cleaned) requirements.push(cleaned);
      }
      if (specialWishes && currentIndustry?.suggestedFeatures?.length) {
        const included = currentIndustry.suggestedFeatures.filter((f) =>
          specialWishes.toLowerCase().includes(f.toLowerCase()),
        );
        if (included.length) requirements.push(`Include: ${included.join(", ")}`);
      }
      if (requirements.length) {
        sections.push(`\nSpecial requirements:\n${requirements.map((l) => `- ${l}`).join("\n")}`);
      }

      // 7. Presentation insights (brief summary, not dominant)
      if (presentationAnalysis?.keyMessage) {
        sections.push(
          `\nFounder's pitch summary: "${presentationAnalysis.keyMessage}"` +
          (presentationAnalysis.strengthHighlight ? ` (Strength: ${presentationAnalysis.strengthHighlight})` : ""),
        );
      }

      // 8. Design feature preferences
      const featureLines = DESIGN_FEATURES
        .filter((f) => selectedFeatures.has(f.id))
        .map((f) => f.promptText);
      if (featureLines.length) {
        sections.push(`\nTechnical preferences:\n${featureLines.map((l) => `- ${l}`).join("\n")}`);
      }

      // 9. Build intent hint
      const intentHint =
        buildIntent === "template"
          ? "Keep scope compact: 1-2 pages, no complex app logic."
          : buildIntent === "app"
            ? "Include interactive flows, stateful UI, and data models."
            : "Focus on clear structure, purposeful content, and flows that match the user's goal.";
      sections.push(`\nScope: ${intentHint}`);

      const expandedPrompt = sections.join("\n");
      const preflightPrompt = formatPromptForV0(expandedPrompt).trim();
      if (!preflightPrompt) {
        throw new Error("Prompten blev tom efter preflight. Lägg till mer information och försök igen.");
      }
      if (preflightPrompt.length > MAX_PROMPT_HANDOFF_CHARS) {
        throw new Error(
          `Prompten är för lång (${preflightPrompt.length} tecken). Max är ${MAX_PROMPT_HANDOFF_CHARS}.`,
        );
      }

      setGeneratedPrompt(preflightPrompt);
      setEditedPrompt(preflightPrompt);
      setShowEditMode(true);
      setShowClarifyGate(false);
      setClarifyQuestions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte generera prompt.");
    } finally {
      setIsClarifying(false);
      setIsExpanding(false);
    }
  }, [
    showClarifyGate,
    shouldAskForClarification,
    fetchEnrichment,
    visibleClarifyQuestions,
    requiresClarifyFallback,
    companyName,
    industry,
    location,
    existingWebsite,
    siteFeedback,
    inspirationSites,
    purposes,
    targetAudience,
    usp,
    specialWishes,
    selectedPalette,
    customColors,
    selectedVibe,
    buildIntent,
    websiteAnalysis,
    currentIndustry,
    followUpAnswers,
    scrapedData,
    presentationAnalysis,
    companyLookup,
    competitors,
    marketInsight,
    selectedFeatures,
    setIsClarifying,
  ]);

  // Final completion
  const handleComplete = useCallback(() => {
    const finalPrompt = formatPromptForV0((editedPrompt || generatedPrompt || "").trim()).trim();
    if (!finalPrompt) {
      setError("Briefen är tom. Generera eller skriv in en giltig prompt innan du fortsätter.");
      return;
    }
    if (finalPrompt.length > MAX_PROMPT_HANDOFF_CHARS) {
      setError(
        `Briefen är för lång (${finalPrompt.length} tecken). Korta ned den till max ${MAX_PROMPT_HANDOFF_CHARS}.`,
      );
      return;
    }

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
      locationLat,
      locationLng,
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
      usp: usp || undefined,
      followUpAnswers: Object.keys(followUpAnswers).length ? followUpAnswers : undefined,
    };

    clearDraft();
    onComplete(wizardData, finalPrompt);
  }, [
    clearDraft,
    companyName,
    industry,
    location,
    locationLat,
    locationLng,
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
    usp,
    followUpAnswers,
    editedPrompt,
    generatedPrompt,
    setError,
    onComplete,
  ]);

  if (!isOpen) return null;

  // ── Step titles and subtitles ─────────────────────────────────
  const STEP_META: Record<number, { title: string; subtitle: string; icon: React.ReactNode }> = {
    1: { title: "Berätta om ditt företag", subtitle: "Vi vill förstå ditt företag bättre", icon: <Building2 className="h-5 w-5" /> },
    2: { title: "Mål och målgrupp", subtitle: "Vad vill du uppnå med din webbplats?", icon: <Target className="h-5 w-5" /> },
    3: { title: "Nuvarande sida och inspiration", subtitle: "Vad finns idag och vad inspirerar dig?", icon: <Globe className="h-5 w-5" /> },
    4: { title: "Design och färger", subtitle: "Hur ska din webbplats se ut och kännas?", icon: <Palette className="h-5 w-5" /> },
    5: { title: "Slutför och skapa", subtitle: "Lägg till sista detaljerna", icon: <Rocket className="h-5 w-5" /> },
  };

  const currentMeta = STEP_META[step] ?? STEP_META[1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop -- clicking does NOT close (prevents accidental data loss) */}
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />

      {/* Modal - same visual language as landing */}
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border/40 bg-background/95 shadow-2xl backdrop-blur-xl">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -top-32 -right-32 h-64 w-64 bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-64 w-64 bg-primary/5 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-muted-foreground transition-colors duration-200 hover:rotate-90 hover:text-foreground"
          aria-label="Stäng"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══════════════════════════════════════════════════════════
            HEADER with progress indicator
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative border-b border-border/50 p-6">
          {/* Progress bar with step numbers */}
          <div className="mb-6 flex items-center gap-1.5">
            {stepFlow.map((s, idx) => (
              <div key={`wizard-step-${s}`} className="flex flex-1 items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    idx < currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : idx === currentStepIndex
                        ? "bg-primary/20 text-primary ring-2 ring-primary/50"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {idx < currentStepIndex ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                {idx < totalSteps - 1 && (
                  <div
                    className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                      idx < currentStepIndex ? "bg-primary" : "bg-secondary"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step title with icon */}
          <div className="flex items-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
              {currentMeta.icon}
            </div>
            <StepVisual
              step={step}
              industry={industry}
              selectedVibe={selectedVibe}
              isBusy={isEnriching || isScraping || isClarifying}
            />
            <div className="text-left">
              <h2 className="text-xl font-(--font-heading) text-foreground sm:text-2xl">{currentMeta.title}</h2>
              <p className="text-sm text-muted-foreground">{currentMeta.subtitle}</p>
            </div>
          </div>

          {/* AI insight banner */}
          {insightSummary && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground">{insightSummary}</p>
            </div>
          )}
          {activeEnrichMeta?.needsClarification && (activeEnrichMeta.unknowns?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-amber-300">AI behöver förtydliganden kring:</p>
              <p className="mt-1 text-xs text-amber-100">
                {activeEnrichMeta?.unknowns?.slice(0, 3).join(", ")}
              </p>
            </div>
          )}
          {/* Background analysis status bar */}
          {(isScraping || isLookingUp || isLoadingCompetitors) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              {isScraping && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Analyserar webbplats
                </span>
              )}
              {isLookingUp && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Hämtar bolagsinfo
                </span>
              )}
              {isLoadingCompetitors && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Kartlägger konkurrenter
                </span>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            CONTENT - Dynamic based on step
            ═══════════════════════════════════════════════════════════ */}
        <div className="min-h-[350px] p-6">
          {/* ═══ STEP 1: About You ═══ */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ditt företag eller projekt..."
                  className={INPUT_CLASS}
                  autoFocus
                />
              </div>

              {/* Industry Grid */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Bransch *</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {INDUSTRY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleIndustryChange(option.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                        industry === option.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/30 bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-card/80"
                      }`}
                    >
                      <option.icon className="h-5 w-5" />
                      <span className="text-center text-xs">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Globe className="h-4 w-4 text-primary" />
                  Plats <span className="font-normal text-muted-foreground">(valfritt)</span>
                </label>
                <LocationPicker
                  value={location}
                  lat={locationLat}
                  lng={locationLng}
                  onLocationChange={(name, lat, lng) => {
                    setLocation(name);
                    setLocationLat(lat || undefined);
                    setLocationLng(lng || undefined);
                  }}
                  inputClassName={INPUT_CLASS}
                />
              </div>

              {/* Existing Website with Scraper */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  Befintlig hemsida?{" "}
                  <span className="font-normal text-muted-foreground">(valfritt - vi analyserar den)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={existingWebsite}
                    onChange={(e) => setExistingWebsite(e.target.value)}
                    placeholder="https://dinhemsida.se"
                    className={INPUT_CLASS + " flex-1"}
                  />
                  {existingWebsite && (
                    <Button
                      onClick={() => handleScrapeWebsite(existingWebsite)}
                      disabled={isScraping}
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1"
                    >
                      {isScraping ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      Analysera
                    </Button>
                  )}
                </div>

                {/* Background analysis indicator */}
                {isScraping && !scrapedData && (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-primary">Analyserar i bakgrunden...</p>
                      <p className="text-[10px] text-muted-foreground">Du kan fortsätta till nästa steg medan vi jobbar</p>
                    </div>
                  </div>
                )}

                {/* Scraped data card */}
                {scrapedData && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2 duration-300">
                    <div className="flex items-center gap-2 text-xs font-medium text-primary">
                      <Check className="h-3.5 w-3.5" />
                      Vi hittade din sida
                    </div>
                    {scrapedData.title && (
                      <p className="text-sm text-foreground">{scrapedData.title}</p>
                    )}
                    {scrapedData.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{scrapedData.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {scrapedData.wordCount != null && <span>{scrapedData.wordCount} ord</span>}
                      {(scrapedData.headings?.length ?? 0) > 0 && (
                        <span>{scrapedData.headings!.length} sektioner</span>
                      )}
                      {scrapedData.hasImages && <span>Har bilder</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Voice input */}
              <div className="flex items-center gap-3">
                <VoiceRecorder
                  compact
                  onTranscript={(text) =>
                    setCompanyName((prev) => (prev ? `${prev} ${text}` : text))
                  }
                />
                <span className="text-xs text-muted-foreground">Eller berätta med rösten</span>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Your Goals ═══ */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Purpose Selection */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Target className="h-4 w-4 text-brand-teal" />
                  Vad vill du uppnå? * (välj ett eller flera)
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PURPOSE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => togglePurpose(option.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                        purposes.includes(option.id)
                          ? "border-brand-teal bg-brand-teal/20"
                          : "border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <option.icon className="h-4 w-4" />
                      <span
                        className={`text-xs font-medium ${
                          purposes.includes(option.id) ? "text-brand-teal/80" : "text-white"
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="text-[10px] text-gray-500">{option.desc}</span>
                      {purposes.includes(option.id) && (
                        <Check className="h-3 w-3 text-brand-teal" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Users className="h-4 w-4 text-brand-teal" />
                  Målgrupp
                </label>
                {audienceSuggestion && !targetAudience.trim() && (
                  <button
                    onClick={() => { setTargetAudience(audienceSuggestion); setAudienceSuggestion(null); }}
                    className="w-full rounded-lg border border-brand-teal/30 bg-brand-teal/10 p-2 text-left text-xs text-brand-teal/80 transition hover:bg-brand-teal/20"
                  >
                    <Lightbulb className="mr-1 inline h-3 w-3" /> Förslag: {audienceSuggestion}
                    <span className="ml-1 text-brand-teal/60">(klicka för att använda)</span>
                  </button>
                )}
                {companyLookup?.purpose && !targetAudience.trim() && !audienceSuggestion && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
                    <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                    Baserat på bolagsinfo: {companyLookup.purpose.slice(0, 120)}
                  </div>
                )}
                <textarea
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder={isEnriching ? "Analyserar din profil för att föreslå målgrupp..." : ""}
                  rows={2}
                  className={INPUT_CLASS + " resize-none"}
                />
              </div>

              {/* USP - What makes you unique */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <TrendingUp className="h-4 w-4 text-brand-teal" />
                  Vad skiljer er från konkurrenterna?{" "}
                  <span className="font-normal text-gray-500">(USP)</span>
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={usp}
                    onChange={(e) => setUsp(e.target.value)}
                    placeholder="T.ex. 'Bäst pris i Sverige', 'Personlig service', '20 års erfarenhet'..."
                    rows={2}
                    className={INPUT_CLASS + " flex-1 resize-none"}
                  />
                  <VoiceRecorder
                    compact
                    onTranscript={(text) => setUsp((prev) => (prev ? `${prev} ${text}` : text))}
                  />
                </div>
                {/* USP suggestions from AI */}
                {suggestions
                  .filter((s) => s.type === "usp")
                  .map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setUsp((prev) => (prev ? `${prev}. ${s.text}` : s.text))}
                      className="w-full rounded-lg border border-gray-700/50 bg-gray-900/50 p-2 text-left text-xs text-gray-400 transition hover:border-brand-teal/30 hover:text-gray-200"
                    >
                      <Sparkles className="mr-1 inline h-3 w-3 text-brand-teal/60" />
                      {s.text}
                    </button>
                  ))}
              </div>

              {/* AI Follow-ups */}
              {isEnriching && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyserar din profil...
                </div>
              )}
              <FollowUpRenderer
                questions={followUpQuestions}
                answers={followUpAnswers}
                onAnswer={handleFollowUpAnswer}
              />
            </div>
          )}

          {/* ═══ STEP 3: Existing Site & Inspiration & Competitors ═══ */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Website Analysis Result */}
              {websiteAnalysis && (
                <div className="rounded-lg border border-brand-teal/20 bg-linear-to-br from-brand-teal/5 to-transparent p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-teal">
                    <Sparkles className="h-4 w-4" />
                    AI-analys av {existingWebsite || "din sida"}
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{websiteAnalysis}</p>
                </div>
              )}

              {/* Company lookup info */}
              {companyLookup?.found && (
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                    <Building2 className="h-3.5 w-3.5" />
                    Bolagsinformation
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    {companyLookup.orgNr && <span>Org.nr: {companyLookup.orgNr}</span>}
                    {companyLookup.companyType && <span>{companyLookup.companyType}</span>}
                    {companyLookup.city && <span>{companyLookup.city}</span>}
                    {companyLookup.employees != null && <span>{companyLookup.employees} anställda</span>}
                    {companyLookup.revenueKsek != null && <span>Oms: {Math.round(companyLookup.revenueKsek / 1000)} MSEK</span>}
                  </div>
                </div>
              )}

              {/* Site Feedback */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Vad vill du ändra/förbättra?
                </label>
                <textarea
                  value={siteFeedback}
                  onChange={(e) => setSiteFeedback(e.target.value)}
                  placeholder="T.ex. Ser föråldrad ut, svår navigation, dålig mobilversion..."
                  rows={3}
                  className={INPUT_CLASS + " resize-none"}
                />
              </div>

              {/* Competitor Map */}
              {(competitors.length > 0 || isLoadingCompetitors) && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <TrendingUp className="h-4 w-4 text-brand-teal" />
                    Konkurrenter i ditt område
                  </label>
                  {marketInsight && (
                    <p className="text-xs text-gray-400">{marketInsight}</p>
                  )}
                  <CompetitorMap
                    competitors={competitors}
                    centerLat={locationLat ?? competitors[0]?.lat}
                    centerLng={locationLng ?? competitors[0]?.lng}
                    isLoading={isLoadingCompetitors}
                    onAddInspiration={(url) => {
                      const emptyIdx = inspirationSites.findIndex((s) => !s.trim());
                      if (emptyIdx >= 0) {
                        updateInspirationSite(emptyIdx, url);
                      } else if (inspirationSites.length < 3) {
                        setInspirationSites((prev) => [...prev, url]);
                      }
                    }}
                  />
                </div>
              )}

              {/* Inspiration Sites */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  Inspirationssajter <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                {competitors.filter((c) => c.isInspiration && c.website).length > 0 &&
                  inspirationSites.every((s) => !s.trim()) && (
                  <div className="flex flex-wrap gap-1.5">
                    {competitors.filter((c) => c.isInspiration && c.website).map((c, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const emptyIdx = inspirationSites.findIndex((s) => !s.trim());
                          if (emptyIdx >= 0) updateInspirationSite(emptyIdx, c.website!);
                          else if (inspirationSites.length < 3) setInspirationSites((prev) => [...prev, c.website!]);
                        }}
                        className="rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1 text-xs text-emerald-300 transition hover:bg-emerald-600/20"
                      >
                        + {c.name}: {c.website}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {inspirationSites.map((site, index) => (
                    <input
                      key={index}
                      type="url"
                      value={site}
                      onChange={(e) => updateInspirationSite(index, e.target.value)}
                      placeholder={`https://inspiration-${index + 1}.se`}
                      className={INPUT_CLASS}
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

              {/* AI Follow-ups */}
              {isEnriching && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Hämtar förslag...
                </div>
              )}

              {/* Trend suggestions */}
              {suggestions.filter((s) => s.type === "trend").length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-400">
                    <TrendingUp className="mr-1 inline h-3 w-3" />
                    Trender inom {currentIndustry?.label || "din bransch"}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions
                      .filter((s) => s.type === "trend")
                      .map((s, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setSiteFeedback((prev) =>
                              prev ? `${prev}. ${s.text}` : `Jag vill ha: ${s.text}`,
                            )
                          }
                          className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-400 transition hover:border-brand-teal/50 hover:text-white"
                        >
                          + {s.text}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <FollowUpRenderer
                questions={followUpQuestions}
                answers={followUpAnswers}
                onAnswer={handleFollowUpAnswer}
              />
            </div>
          )}

          {/* ═══ STEP 4: Design Preferences ═══ */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Design Vibe */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Wand2 className="h-4 w-4 text-brand-teal" />
                  Vilken stil passar ditt varumärke?
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
                      <vibe.icon className="h-5 w-5" />
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
                  <Palette className="h-4 w-4 text-brand-teal" />
                  Färgpalett
                </label>
                {/* AI palette suggestions */}
                {suggestions.filter((s) => s.type === "palette").length > 0 && (
                  <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-2 text-xs text-gray-400">
                    <Sparkles className="mr-1 inline h-3 w-3 text-brand-teal/60" />
                    {suggestions.find((s) => s.type === "palette")?.text}
                  </div>
                )}
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

              {/* AI Follow-ups */}
              <FollowUpRenderer
                questions={followUpQuestions}
                answers={followUpAnswers}
                onAnswer={handleFollowUpAnswer}
              />
            </div>
          )}

          {/* ═══ STEP 5: Special Wishes & Generate ═══ */}
          {step === 5 && !showEditMode && (
            <div className="space-y-6">
              {(showClarifyGate || isClarifying) && (
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="h-4 w-4" />
                    Innan vi skapar briefen: AI vill förtydliga några saker
                  </div>
                  {isClarifying && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sammanställer klargörandefrågor...
                    </div>
                  )}
                  {showClarifyGate && clarifyQuestions.length > 0 && (
                    <FollowUpRenderer
                      questions={clarifyQuestions}
                      answers={followUpAnswers}
                      onAnswer={handleFollowUpAnswer}
                    />
                  )}
                  {showClarifyGate && requiresClarifyFallback && (
                    <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <label className="text-xs font-medium text-amber-200">
                        Svara till AI innan briefen skapas
                      </label>
                      <textarea
                        value={followUpAnswers[CLARIFY_FALLBACK_ID] || ""}
                        onChange={(e) => handleFollowUpAnswer(CLARIFY_FALLBACK_ID, e.target.value)}
                        rows={3}
                        placeholder={
                          hasClarifyUnknowns
                            ? `Svara kort på detta: ${(activeEnrichMeta?.unknowns || []).slice(0, 3).join(", ")}`
                            : "Skriv de saknade detaljerna (t.ex. tidsplan, budget, betalningslösning)."
                        }
                        className={INPUT_CLASS + " text-sm"}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Design Feature Chips */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Wand2 className="h-4 w-4 text-brand-teal" />
                  Funktioner och teknik
                </label>
                <div className="flex flex-wrap gap-2">
                  {DESIGN_FEATURES
                    .filter((f) => !f.relevantIndustries || f.relevantIndustries.includes(industry))
                    .map((feature) => {
                      const isSelected = selectedFeatures.has(feature.id);
                      return (
                        <button
                          key={feature.id}
                          onClick={() => setSelectedFeatures((prev) => {
                            const next = new Set(prev);
                            if (next.has(feature.id)) next.delete(feature.id);
                            else next.add(feature.id);
                            return next;
                          })}
                          className={`rounded-full px-3 py-1.5 text-xs transition-all ${
                            isSelected
                              ? "border border-brand-teal/50 bg-brand-teal/20 text-brand-teal"
                              : "border border-gray-700 bg-gray-900 text-gray-400 hover:border-brand-teal/30 hover:text-gray-200"
                          }`}
                        >
                          {isSelected ? "✓" : "+"} {feature.label}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Quick Features */}
              {currentIndustry?.suggestedFeatures &&
                currentIndustry.suggestedFeatures.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Populära funktioner för {currentIndustry.label}:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {currentIndustry.suggestedFeatures.map((feature, idx) => {
                        const isIncluded = specialWishes.toLowerCase().includes(feature.toLowerCase());
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
                                ? "border border-brand-teal/50 bg-brand-teal/30 text-brand-teal/80"
                                : "border border-gray-700 bg-gray-900 text-gray-400 hover:border-brand-teal/50"
                            }`}
                          >
                            {isIncluded ? "✓" : "+"} {feature}
                          </button>
                        );
                      })}
                      {/* Feature suggestions from AI */}
                      {suggestions
                        .filter((s) => s.type === "feature")
                        .map((s, i) => (
                          <button
                            key={`ai-${i}`}
                            onClick={() =>
                              setSpecialWishes((prev) =>
                                prev ? `${prev}, ${s.text}` : `Jag vill ha: ${s.text}`,
                              )
                            }
                            className="rounded-full border border-brand-teal/20 bg-brand-teal/5 px-3 py-1.5 text-sm text-brand-teal/60 transition hover:border-brand-teal/40 hover:text-brand-teal/80"
                          >
                            <Sparkles className="mr-1 inline h-3 w-3" />
                            {s.text}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

              {/* Special Wishes */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Wand2 className="h-4 w-4 text-brand-teal" />
                  Egna önskemål <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <textarea
                  value={specialWishes}
                  onChange={(e) => setSpecialWishes(e.target.value)}
                  placeholder="Beskriv fritt vad du vill ha på din webbplats..."
                  rows={4}
                  className={INPUT_CLASS + " resize-none"}
                />
              </div>

              {/* Voice Input */}
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
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
                        : `[Röstinmatning]: ${transcript}`,
                    );
                  }}
                  onRecordingChange={() => {}}
                  placeholder="Börja prata..."
                />
              </div>

              {/* Video Presentation (optional) */}
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Video className="h-4 w-4 text-brand-blue" />
                  Beskriv din vision fritt
                  <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <p className="text-xs text-gray-500">
                  Berätta om ditt företag och vad du vill ha. AI transkriberar, extraherar
                  önskemål och ger feedback på ton och tydlighet.
                </p>
                <VideoRecorder
                  companyName={companyName}
                  industry={currentIndustry?.label || industry}
                  onTranscript={(transcript) => {
                    setVoiceTranscript((prev) => (prev ? `${prev}\n${transcript}` : transcript));
                    setSpecialWishes((prev) =>
                      prev
                        ? `${prev}\n\n[Videopresentation]: ${transcript}`
                        : `[Videopresentation]: ${transcript}`,
                    );
                  }}
                  onAnalysis={(a) => setPresentationAnalysis(a)}
                  language="sv"
                />
              </div>

              {/* Professional Summary Card */}
              <div className="rounded-lg border border-gray-700/50 bg-linear-to-br from-gray-900/80 to-gray-950 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Sparkles className="h-4 w-4 text-brand-teal" />
                  Din webbplats-brief
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {companyName && (
                    <div className="space-y-0.5">
                      <span className="text-gray-500">Företag</span>
                      <p className="text-white">{companyName}</p>
                    </div>
                  )}
                  {industry && (
                    <div className="space-y-0.5">
                      <span className="text-gray-500">Bransch</span>
                      <p className="flex items-center gap-1 text-white">
                        {currentIndustry?.icon ? <currentIndustry.icon className="h-3.5 w-3.5" /> : null}
                        {currentIndustry?.label}
                      </p>
                    </div>
                  )}
                  {purposes.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-gray-500">Mål</span>
                      <p className="text-white">
                        {purposes
                          .map((p) => PURPOSE_OPTIONS.find((o) => o.id === p)?.label)
                          .join(", ")}
                      </p>
                    </div>
                  )}
                  {selectedVibe && (
                    <div className="space-y-0.5">
                      <span className="text-gray-500">Stil</span>
                      <p className="text-white">
                        {VIBE_OPTIONS.find((v) => v.id === selectedVibe)?.label}
                      </p>
                    </div>
                  )}
                  {selectedPalette && (
                    <div className="space-y-0.5 col-span-2">
                      <span className="text-gray-500">Färger</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span
                            className="h-4 w-4 rounded-full border border-gray-700"
                            style={{ backgroundColor: selectedPalette.primary }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border border-gray-700"
                            style={{ backgroundColor: selectedPalette.secondary }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border border-gray-700"
                            style={{ backgroundColor: selectedPalette.accent }}
                          />
                        </div>
                        <span className="text-white">{selectedPalette.name}</span>
                      </div>
                    </div>
                  )}
                  {usp && (
                    <div className="space-y-0.5 col-span-2">
                      <span className="text-gray-500">USP</span>
                      <p className="text-white">{usp}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ EDIT MODE - After generation ═══ */}
          {showEditMode && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-brand-teal" />
                  <h3 className="text-xl font-bold text-white">Din genererade brief</h3>
                </div>
                <p className="text-sm text-gray-400">
                  Granska och redigera vid behov, eller fortsätt direkt.
                </p>
              </div>

              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={14}
                className={INPUT_CLASS + " resize-none font-mono text-sm"}
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
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FOOTER - Navigation buttons
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative flex items-center justify-between gap-3 border-t border-border/50 p-6">
          {/* Back button */}
          {!showEditMode ? (
            <Button
              variant="ghost"
              onClick={step === 1 ? onClose : handleBack}
              disabled={isExpanding || isClarifying}
              className="gap-2 text-muted-foreground hover:text-foreground"
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
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          )}

          {/* Enriching indicator */}
          {(isEnriching || isClarifying) && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isClarifying ? "AI förtydligar..." : "AI analyserar..."}
            </div>
          )}

          {/* Next/Generate/Complete button */}
          {showEditMode ? (
            <Button
              onClick={handleComplete}
              className="btn-3d btn-glow gap-2 bg-primary px-6 text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            >
              <Rocket className="h-4 w-4" />
              Skapa webbplats
            </Button>
          ) : currentStepIndex < totalSteps - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isClarifying}
              className="btn-3d btn-glow gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 disabled:opacity-50"
            >
              Nästa
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isExpanding || isClarifying}
              className="btn-3d btn-glow gap-2 bg-primary px-6 text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            >
              {isClarifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Hämtar klargöranden...
                </>
              ) : isExpanding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Skapar brief...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generera webbplats-brief
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
