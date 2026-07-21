"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { X, Wand2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type ColorPalette,
  PREDEFINED_PALETTES,
  getIndustryPalettes,
} from "@/components/forms/color-palette-picker";
import { useAuth } from "@/lib/auth/auth-store";
import { formatPrompt } from "@/lib/builder/prompt-assist";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import {
  CLARIFY_FALLBACK_ID,
  INDUSTRY_OPTIONS,
  INPUT_CLASS,
} from "@/components/modals/prompt-wizard/constants";
import type {
  ComponentChoices,
  PresentationAnalysis,
  PromptWizardModalProps,
  WizardData,
} from "@/components/modals/prompt-wizard/types";
import { getVisibleFollowUpQuestions } from "@/components/modals/prompt-wizard/follow-up-renderer";
import { buildWizardPrompt } from "@/components/modals/prompt-wizard/build-wizard-prompt";
import { useCompanyIntelligence } from "@/components/modals/prompt-wizard/use-company-intelligence";
import { useWizardEnrichment } from "@/components/modals/prompt-wizard/use-wizard-enrichment";
import { useWizardDraft } from "@/components/modals/prompt-wizard/use-wizard-draft";
import { WizardHeader } from "@/components/modals/prompt-wizard/wizard-header";
import { WizardFooter } from "@/components/modals/prompt-wizard/wizard-footer";
import { StepAbout } from "@/components/modals/prompt-wizard/steps/step-about";
import { StepGoals } from "@/components/modals/prompt-wizard/steps/step-goals";
import { StepResearch } from "@/components/modals/prompt-wizard/steps/step-research";
import { StepDesign } from "@/components/modals/prompt-wizard/steps/step-design";
import { StepReview } from "@/components/modals/prompt-wizard/steps/step-review";

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
 *
 * Split into cohesive modules under prompt-wizard/ (constants, types,
 * hooks, step views, prompt builder) -- no behavior change intended.
 */

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

  // Loading states
  const [isExpanding, setIsExpanding] = useState(false);
  const [isClarifying, setIsClarifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated prompt state
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [showEditMode, setShowEditMode] = useState(false);

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
  const [presentationAnalysis, setPresentationAnalysis] =
    useState<PresentationAnalysis | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());

  // ═══════════════════════════════════════════════════════════════
  // V3: Intelligence state (company lookup + competitor discovery)
  // ═══════════════════════════════════════════════════════════════
  const { companyLookup, isLookingUp, competitors, marketInsight, isLoadingCompetitors } =
    useCompanyIntelligence({
      isOpen,
      isAuthenticated,
      isInitialized,
      companyName,
      industry,
      location,
      locationLat,
      locationLng,
      existingWebsite,
      setLocation,
    });

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

  // ── AI enrichment machinery ───────────────────────────────────
  const {
    isEnriching,
    isScraping,
    followUpQuestions,
    followUpAnswers,
    setFollowUpAnswers,
    suggestions,
    insightSummary,
    scrapedData,
    activeEnrichMeta,
    setActiveEnrichMeta,
    clarifyQuestions,
    setClarifyQuestions,
    showClarifyGate,
    setShowClarifyGate,
    audienceSuggestion,
    setAudienceSuggestion,
    handleFollowUpAnswer,
    fetchEnrichment,
    handleScrapeWebsite,
  } = useWizardEnrichment({
    isOpen,
    isAuthenticated,
    isInitialized,
    step,
    companyName,
    industry,
    location,
    existingWebsite,
    inspirationSites,
    purposes,
    targetAudience,
    usp,
    selectedVibe,
    specialWishes,
    companyLookup,
    competitors,
    setWebsiteAnalysis,
  });

  // ── Persist wizard state in localStorage ──────────────────────
  const { clearDraft } = useWizardDraft({
    isOpen,
    step,
    setStep,
    companyName,
    setCompanyName,
    industry,
    setIndustry,
    location,
    setLocation,
    locationLat,
    setLocationLat,
    locationLng,
    setLocationLng,
    existingWebsite,
    setExistingWebsite,
    purposes,
    setPurposes,
    targetAudience,
    setTargetAudience,
    usp,
    setUsp,
    siteFeedback,
    setSiteFeedback,
    inspirationSites,
    setInspirationSites,
    selectedVibe,
    setSelectedVibe,
    specialWishes,
    setSpecialWishes,
    selectedPalette,
    setSelectedPalette,
    customColors,
    setCustomColors,
    followUpAnswers,
    setFollowUpAnswers,
  });

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
  }, [setAudienceSuggestion]);

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

      const expandedPrompt = buildWizardPrompt({
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
      });
      const preflightPrompt = formatPrompt(expandedPrompt).trim();
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
    setActiveEnrichMeta,
    setClarifyQuestions,
    setShowClarifyGate,
  ]);

  // Final completion
  const handleComplete = useCallback(() => {
    const finalPrompt = formatPrompt((editedPrompt || generatedPrompt || "").trim()).trim();
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
        <WizardHeader
          step={step}
          stepFlow={stepFlow}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          industry={industry}
          selectedVibe={selectedVibe}
          isEnriching={isEnriching}
          isScraping={isScraping}
          isClarifying={isClarifying}
          insightSummary={insightSummary}
          activeEnrichMeta={activeEnrichMeta}
          isLookingUp={isLookingUp}
          isLoadingCompetitors={isLoadingCompetitors}
        />

        {/* ═══════════════════════════════════════════════════════════
            CONTENT - Dynamic based on step
            ═══════════════════════════════════════════════════════════ */}
        <div className="min-h-[350px] p-6">
          {/* ═══ STEP 1: About You ═══ */}
          {step === 1 && (
            <StepAbout
              companyName={companyName}
              setCompanyName={setCompanyName}
              industry={industry}
              handleIndustryChange={handleIndustryChange}
              location={location}
              locationLat={locationLat}
              locationLng={locationLng}
              setLocation={setLocation}
              setLocationLat={setLocationLat}
              setLocationLng={setLocationLng}
              existingWebsite={existingWebsite}
              setExistingWebsite={setExistingWebsite}
              handleScrapeWebsite={handleScrapeWebsite}
              isScraping={isScraping}
              scrapedData={scrapedData}
            />
          )}

          {/* ═══ STEP 2: Your Goals ═══ */}
          {step === 2 && (
            <StepGoals
              purposes={purposes}
              togglePurpose={togglePurpose}
              targetAudience={targetAudience}
              setTargetAudience={setTargetAudience}
              audienceSuggestion={audienceSuggestion}
              setAudienceSuggestion={setAudienceSuggestion}
              companyLookup={companyLookup}
              usp={usp}
              setUsp={setUsp}
              suggestions={suggestions}
              isEnriching={isEnriching}
              followUpQuestions={followUpQuestions}
              followUpAnswers={followUpAnswers}
              handleFollowUpAnswer={handleFollowUpAnswer}
            />
          )}

          {/* ═══ STEP 3: Existing Site & Inspiration & Competitors ═══ */}
          {step === 3 && (
            <StepResearch
              websiteAnalysis={websiteAnalysis}
              existingWebsite={existingWebsite}
              companyLookup={companyLookup}
              siteFeedback={siteFeedback}
              setSiteFeedback={setSiteFeedback}
              competitors={competitors}
              isLoadingCompetitors={isLoadingCompetitors}
              marketInsight={marketInsight}
              locationLat={locationLat}
              locationLng={locationLng}
              inspirationSites={inspirationSites}
              setInspirationSites={setInspirationSites}
              updateInspirationSite={updateInspirationSite}
              addInspirationSite={addInspirationSite}
              isEnriching={isEnriching}
              suggestions={suggestions}
              currentIndustry={currentIndustry}
              followUpQuestions={followUpQuestions}
              followUpAnswers={followUpAnswers}
              handleFollowUpAnswer={handleFollowUpAnswer}
            />
          )}

          {/* ═══ STEP 4: Design Preferences ═══ */}
          {step === 4 && (
            <StepDesign
              selectedVibe={selectedVibe}
              setSelectedVibe={setSelectedVibe}
              suggestions={suggestions}
              selectedPalette={selectedPalette}
              setSelectedPalette={setSelectedPalette}
              customColors={customColors}
              setCustomColors={setCustomColors}
              industry={industry}
              followUpQuestions={followUpQuestions}
              followUpAnswers={followUpAnswers}
              handleFollowUpAnswer={handleFollowUpAnswer}
            />
          )}

          {/* ═══ STEP 5: Special Wishes & Generate ═══ */}
          {step === 5 && !showEditMode && (
            <StepReview
              showClarifyGate={showClarifyGate}
              isClarifying={isClarifying}
              clarifyQuestions={clarifyQuestions}
              followUpAnswers={followUpAnswers}
              handleFollowUpAnswer={handleFollowUpAnswer}
              requiresClarifyFallback={requiresClarifyFallback}
              hasClarifyUnknowns={hasClarifyUnknowns}
              activeEnrichMeta={activeEnrichMeta}
              industry={industry}
              selectedFeatures={selectedFeatures}
              setSelectedFeatures={setSelectedFeatures}
              currentIndustry={currentIndustry}
              specialWishes={specialWishes}
              setSpecialWishes={setSpecialWishes}
              suggestions={suggestions}
              setVoiceTranscript={setVoiceTranscript}
              companyName={companyName}
              setPresentationAnalysis={setPresentationAnalysis}
              purposes={purposes}
              selectedVibe={selectedVibe}
              selectedPalette={selectedPalette}
              usp={usp}
            />
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
                data-openclaw-text-target="wizard.review.generated_brief"
                data-openclaw-text-label="Wizard: genererad brief"
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
        <WizardFooter
          showEditMode={showEditMode}
          step={step}
          onClose={onClose}
          handleBack={handleBack}
          isExpanding={isExpanding}
          isClarifying={isClarifying}
          isEnriching={isEnriching}
          setShowEditMode={setShowEditMode}
          setGeneratedPrompt={setGeneratedPrompt}
          setEditedPrompt={setEditedPrompt}
          handleComplete={handleComplete}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          handleNext={handleNext}
          canProceed={canProceed}
          handleGenerate={handleGenerate}
        />
      </div>
    </div>
  );
}
