"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

// Purpose options
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

// Design vibe options
const VIBE_OPTIONS = [
  { id: "modern", label: "Modern & Clean", icon: "✨" },
  { id: "playful", label: "Playful & Fun", icon: "🎨" },
  { id: "brutalist", label: "Brutalist", icon: "🏗️" },
  { id: "luxury", label: "Luxury", icon: "💎" },
  { id: "tech", label: "Futuristic", icon: "🚀" },
  { id: "minimal", label: "Minimal", icon: "◻️" },
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

// ── Shared input class ────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/50 focus:outline-none";

// ── FollowUpRenderer ──────────────────────────────────────────────

function FollowUpRenderer({
  questions,
  answers,
  onAnswer,
}: {
  questions: FollowUpQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}) {
  if (!questions.length) return null;

  return (
    <div className="space-y-4 rounded-lg border border-gray-700/50 bg-linear-to-br from-gray-900/80 to-gray-950/80 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-brand-teal/80">
        <Sparkles className="h-3.5 w-3.5" />
        Anpassade frågor för ert sajtbygge
      </div>
      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-sm text-gray-300">{q.text}</label>
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
                      ? "border-brand-teal bg-brand-teal/20 text-brand-teal/90"
                      : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
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
                        ? "border-brand-teal bg-brand-teal/20 text-brand-teal/90"
                        : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
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
  categoryType = "website",
  buildIntent = "website",
}: PromptWizardModalProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Loading states
  const [isExpanding, setIsExpanding] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
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
  const enrichedStepsRef = useRef<Set<number>>(new Set());

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: About You
  // ═══════════════════════════════════════════════════════════════
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
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

  // Get current industry data
  const currentIndustry = INDUSTRY_OPTIONS.find((i) => i.id === industry);

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
      if (draft.existingWebsite) setExistingWebsite(draft.existingWebsite);
      if (draft.purposes?.length) setPurposes(draft.purposes);
      if (draft.targetAudience) setTargetAudience(draft.targetAudience);
      if (draft.usp) setUsp(draft.usp);
      if (draft.siteFeedback) setSiteFeedback(draft.siteFeedback);
      if (draft.selectedVibe) setSelectedVibe(draft.selectedVibe);
      if (draft.specialWishes) setSpecialWishes(draft.specialWishes);
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
      companyName, industry, location, existingWebsite,
      purposes, targetAudience, usp, siteFeedback,
      selectedVibe, specialWishes, step,
      _ts: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore (private browsing etc)
    }
  }, [
    isOpen, companyName, industry, location, existingWebsite,
    purposes, targetAudience, usp, siteFeedback,
    selectedVibe, specialWishes, step,
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
    purposes, targetAudience, usp, selectedVibe,
    specialWishes, followUpAnswers,
  });
  enrichDataRef.current = {
    companyName, industry, location, existingWebsite,
    purposes, targetAudience, usp, selectedVibe,
    specialWishes, followUpAnswers,
  };

  // AbortController to cancel in-flight requests
  const enrichAbortRef = useRef<AbortController | null>(null);

  // ── Fetch AI enrichment for current step ──────────────────────
  const fetchEnrichment = useCallback(
    async (currentStep: number, scrapeUrl?: string) => {
      // Don't re-enrich the same step unless scraping
      if (enrichedStepsRef.current.has(currentStep) && !scrapeUrl) return;

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
            step: currentStep,
            data: {
              companyName: d.companyName,
              industry: d.industry,
              location: d.location,
              existingWebsite: d.existingWebsite,
              purposes: d.purposes,
              targetAudience: d.targetAudience,
              usp: d.usp,
              selectedVibe: d.selectedVibe,
              specialWishes: d.specialWishes,
              previousFollowUps: d.followUpAnswers,
            },
            scrapeUrl,
          }),
        });

        if (!response.ok) {
          console.warn("[Wizard] Enrich request failed:", response.status);
          return;
        }

        const data = await response.json();

        if (data.questions?.length) {
          setFollowUpQuestions(data.questions);
        }
        if (data.suggestions?.length) {
          setSuggestions(data.suggestions);
        }
        if (data.insightSummary) {
          setInsightSummary(data.insightSummary);
        }
        if (data.scrapedData) {
          setScrapedData(data.scrapedData);
        }

        enrichedStepsRef.current.add(currentStep);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[Wizard] Enrich failed (non-fatal):", err);
      } finally {
        setIsEnriching(false);
      }
    },
    [], // Stable -- reads from enrichDataRef
  );

  // ── Scrape website on URL entry (non-blocking) ────────────────
  const handleScrapeWebsite = useCallback(
    (url: string) => {
      if (!url) return;
      setIsScraping(true);
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;

      // Run analysis in background
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

      // Run enrichment in background separately
      fetchEnrichment(step, fullUrl);
    },
    [fetchEnrichment, step],
  );

  // ── Auto-enrich on step change (debounced, single request) ────
  useEffect(() => {
    if (!isOpen) return;
    if (step >= 2 && companyName && industry) {
      const timer = setTimeout(() => fetchEnrichment(step), 600);
      return () => clearTimeout(timer);
    }
  }, [step, isOpen, companyName, industry, fetchEnrichment]);

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
        return true;
      default:
        return true;
    }
  }, [step, companyName, industry, purposes, selectedPalette, customColors]);

  // Step navigation
  const handleNext = useCallback(() => {
    if (step < totalSteps) {
      setStep((prev) => prev + 1);
      setFollowUpQuestions([]);
      setSuggestions([]);
      setInsightSummary(null);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep((prev) => prev - 1);
      setFollowUpQuestions([]);
      setSuggestions([]);
      setInsightSummary(null);
    }
  }, [step]);

  // ── Generate brief-formatted prompt ───────────────────────────
  const handleGenerate = useCallback(async () => {
    setIsExpanding(true);
    setError(null);

    try {
      const palette = customColors || selectedPalette;
      const paletteText = palette
        ? `Primary ${palette.primary}, Secondary ${palette.secondary}, Accent ${palette.accent}`
        : null;
      const industryLabel = currentIndustry?.label || industry || "general";
      const intentLabel = buildIntentNoun(buildIntent);

      const intentHint =
        buildIntent === "template"
          ? "Scope: compact, reusable template (1-2 pages). Avoid heavy app logic."
          : buildIntent === "app"
            ? "Include app flows, stateful UI, and key data models where relevant."
            : "Focus on content structure, marketing flow, and clear sections.";

      // Build enriched prompt with all collected data
      const followUpContext = Object.entries(followUpAnswers)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");

      const promptParts = [
        `Create a ${categoryType} ${intentLabel} for ${companyName || "a business"}.`,
        `Build intent: ${intentHint}`,
        `Industry: ${industryLabel}.`,
        location ? `Location: ${location}.` : null,
        purposes.length ? `Goals: ${purposes.join(", ")}.` : null,
        targetAudience ? `Target audience: ${targetAudience}.` : null,
        usp ? `Unique selling proposition: ${usp}.` : null,
        selectedVibe ? `Visual style: ${selectedVibe}.` : null,
        paletteText ? `Color palette: ${paletteText}.` : null,
        existingWebsite ? `Existing website: ${existingWebsite}.` : null,
        inspirationSites.filter((s) => s.trim()).length
          ? `Inspiration: ${inspirationSites.filter((s) => s.trim()).join(", ")}.`
          : null,
        siteFeedback ? `Feedback on current site: ${siteFeedback}.` : null,
        specialWishes ? `Special wishes: ${specialWishes}.` : null,
        voiceTranscript ? `Voice notes: ${voiceTranscript}.` : null,
        initialPrompt ? `Initial context: ${initialPrompt}.` : null,
        websiteAnalysis ? `Website analysis: ${websiteAnalysis}.` : null,
        followUpContext ? `Additional business context:\n${followUpContext}` : null,
        scrapedData?.title
          ? `Current site title: "${scrapedData.title}", ${scrapedData.wordCount || 0} words of content.`
          : null,
        presentationAnalysis
          ? `Video presentation analysis (score ${presentationAnalysis.overallScore}/10): Key message: "${presentationAnalysis.keyMessage || ""}". Strength: ${presentationAnalysis.strengthHighlight || ""}. Tone: ${presentationAnalysis.toneFeedback || ""}. Pitch quality: ${presentationAnalysis.pitchFeedback || ""}.`
          : null,
      ].filter(Boolean);

      // Try to generate a brief via the AI endpoint
      let expandedPrompt = promptParts.join("\n");

      try {
        const briefResponse = await fetch("/api/ai/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: expandedPrompt,
            provider: "gateway",
            model: "openai/gpt-5.2",
            imageGenerations: true,
            maxTokens: 3000,
          }),
        });

        if (briefResponse.ok) {
          const brief = await briefResponse.json();
          if (brief && !brief.error) {
            // Format the brief into a readable prompt
            const briefLines = [
              `# ${brief.projectTitle || companyName}`,
              brief.oneSentencePitch ? `\n${brief.oneSentencePitch}` : null,
              brief.targetAudience ? `\nTarget audience: ${brief.targetAudience}` : null,
              brief.primaryCallToAction ? `Primary CTA: "${brief.primaryCallToAction}"` : null,
              brief.toneAndVoice?.length
                ? `Tone: ${brief.toneAndVoice.join(", ")}`
                : null,
              brief.pages?.length
                ? `\nPages:\n${brief.pages.map((p: { name: string; path: string; sections?: { type: string }[] }) => `- ${p.name} (${p.path}): ${p.sections?.map((s: { type: string }) => s.type).join(", ") || "auto"}`).join("\n")}`
                : null,
              brief.visualDirection?.styleKeywords?.length
                ? `\nStyle: ${brief.visualDirection.styleKeywords.join(", ")}`
                : null,
              brief.visualDirection?.colorPalette
                ? `Colors: ${Object.entries(brief.visualDirection.colorPalette).map(([k, v]) => `${k}: ${v}`).join(", ")}`
                : null,
              brief.seo?.keywords?.length
                ? `\nSEO keywords: ${brief.seo.keywords.slice(0, 10).join(", ")}`
                : null,
              `\n---\nOriginal specifications:\n${expandedPrompt}`,
            ].filter(Boolean);

            expandedPrompt = briefLines.join("\n");
          }
        }
      } catch (briefErr) {
        // Brief generation failed -- fall back to raw prompt (still good)
        console.warn("[Wizard] Brief generation failed, using raw prompt:", briefErr);
      }

      setGeneratedPrompt(expandedPrompt);
      setEditedPrompt(expandedPrompt);
      setShowEditMode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte generera prompt.");
    } finally {
      setIsExpanding(false);
    }
  }, [
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
    voiceTranscript,
    selectedVibe,
    categoryType,
    buildIntent,
    initialPrompt,
    websiteAnalysis,
    currentIndustry,
    followUpAnswers,
    scrapedData,
    presentationAnalysis,
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
      usp: usp || undefined,
      followUpAnswers: Object.keys(followUpAnswers).length ? followUpAnswers : undefined,
    };

    clearDraft();
    onComplete(wizardData, editedPrompt);
  }, [
    clearDraft,
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
    usp,
    followUpAnswers,
    editedPrompt,
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

  const currentMeta = STEP_META[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop -- clicking does NOT close (prevents accidental data loss) */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-linear-to-b from-gray-950 to-black shadow-2xl">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -top-32 -right-32 h-64 w-64 bg-brand-teal/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-64 w-64 bg-brand-blue/10 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-500 transition-colors duration-200 hover:rotate-90 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══════════════════════════════════════════════════════════
            HEADER with progress indicator
            ═══════════════════════════════════════════════════════════ */}
        <div className="relative border-b border-gray-800/50 p-6">
          {/* Progress bar with step numbers */}
          <div className="mb-6 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex flex-1 items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    s < step
                      ? "bg-brand-teal text-black"
                      : s === step
                        ? "bg-brand-teal/20 text-brand-teal ring-2 ring-brand-teal/50"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {s < step ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                {s < 5 && (
                  <div
                    className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                      s < step ? "bg-brand-teal" : "bg-gray-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step title with icon */}
          <div className="flex items-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/20 text-brand-teal">
              {currentMeta.icon}
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white sm:text-2xl">{currentMeta.title}</h2>
              <p className="text-sm text-gray-500">{currentMeta.subtitle}</p>
            </div>
          </div>

          {/* AI insight banner */}
          {insightSummary && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
              <p className="text-sm text-gray-300">{insightSummary}</p>
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
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Building2 className="h-4 w-4 text-brand-teal" />
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

              {/* Location */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Globe className="h-4 w-4 text-brand-teal" />
                  Plats <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Stockholm, Göteborg, eller annat..."
                  className={INPUT_CLASS}
                />
              </div>

              {/* Existing Website with Scraper */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <ExternalLink className="h-4 w-4 text-brand-teal" />
                  Befintlig hemsida?{" "}
                  <span className="font-normal text-gray-500">(valfritt - vi analyserar den)</span>
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
                  <div className="flex items-center gap-3 rounded-lg border border-brand-teal/10 bg-brand-teal/5 px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-teal/60" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-brand-teal/80">Analyserar i bakgrunden...</p>
                      <p className="text-[10px] text-gray-500">Du kan fortsätta till nästa steg medan vi jobbar</p>
                    </div>
                  </div>
                )}

                {/* Scraped data card */}
                {scrapedData && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-3 space-y-2 duration-300">
                    <div className="flex items-center gap-2 text-xs font-medium text-brand-teal">
                      <Check className="h-3.5 w-3.5" />
                      Vi hittade din sida
                    </div>
                    {scrapedData.title && (
                      <p className="text-sm text-white">{scrapedData.title}</p>
                    )}
                    {scrapedData.description && (
                      <p className="text-xs text-gray-400 line-clamp-2">{scrapedData.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-gray-500">
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
                <span className="text-xs text-gray-500">Eller berätta med rösten</span>
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
                      <span className="text-xl">{option.icon}</span>
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
                {currentIndustry?.suggestedAudience && (
                  <div className="mb-2 rounded-lg border border-brand-teal/30 bg-brand-teal/10 p-2 text-xs text-brand-teal/80">
                    <Lightbulb className="mr-1 inline h-3 w-3" /> Förslag: {currentIndustry.suggestedAudience}
                  </div>
                )}
                <textarea
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Beskriv din idealiska kund..."
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

          {/* ═══ STEP 3: Existing Site & Inspiration ═══ */}
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

              {/* Inspiration Sites */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
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

              {/* AI Follow-ups for inspiration */}
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
                  Spela in en kort presentation
                  <span className="font-normal text-gray-500">(valfritt)</span>
                </label>
                <p className="text-xs text-gray-500">
                  Pitcha ditt företag framför kameran. AI transkriberar och ger konstruktiv
                  feedback på ton, tydlighet och elevator pitch.
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
                      <p className="text-white">
                        {currentIndustry?.icon} {currentIndustry?.label}
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

          {/* Enriching indicator */}
          {isEnriching && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              AI analyserar...
            </div>
          )}

          {/* Next/Generate/Complete button */}
          {showEditMode ? (
            <Button
              onClick={handleComplete}
              className="gap-2 bg-linear-to-r from-brand-teal to-brand-teal/80 px-6 hover:from-brand-teal/90 hover:to-brand-teal/70"
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
              className="gap-2 bg-linear-to-r from-brand-teal to-brand-blue px-6 hover:from-brand-teal/90 hover:to-brand-blue/90"
            >
              {isExpanding ? (
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
