"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import type { Competitor } from "@/app/api/wizard/competitors/route";
import { looksLikeDomain } from "@/components/modals/prompt-wizard/constants";
import type {
  EnrichMeta,
  EnrichResponsePayload,
  EnrichSuggestion,
  FollowUpQuestion,
  ScrapedData,
} from "@/components/modals/prompt-wizard/types";

/**
 * AI enrichment machinery for the prompt wizard: step-scoped follow-up
 * questions/suggestions, context-hash caching, website scraping and the
 * clarify gate state. Moved verbatim from the prompt-wizard-modal-v2
 * monolith. The auto-enrich-on-step-change effect stays in the main
 * component because it depends on the computed step flow.
 */
export function useWizardEnrichment({
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
}: {
  isOpen: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  step: number;
  companyName: string;
  industry: string;
  location: string;
  existingWebsite: string;
  inspirationSites: string[];
  purposes: string[];
  targetAudience: string;
  usp: string;
  selectedVibe: string;
  specialWishes: string;
  companyLookup: CompanyLookupResult | null;
  competitors: Competitor[];
  setWebsiteAnalysis: Dispatch<SetStateAction<string | null>>;
}) {
  const stepRef = useRef(step);
  stepRef.current = step;

  // Loading states
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  // AI follow-up state
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<EnrichSuggestion[]>([]);
  const [insightSummary, setInsightSummary] = useState<string | null>(null);
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null);
  const [activeEnrichMeta, setActiveEnrichMeta] = useState<EnrichMeta | null>(null);
  const [clarifyQuestions, setClarifyQuestions] = useState<FollowUpQuestion[]>([]);
  const [showClarifyGate, setShowClarifyGate] = useState(false);
  const [audienceSuggestion, setAudienceSuggestion] = useState<string | null>(null);
  const enrichCacheRef = useRef<Map<string, EnrichResponsePayload>>(new Map());
  const enrichByStepRef = useRef<Map<number, EnrichResponsePayload>>(new Map());
  const autoAnalyzeRef = useRef<string | null>(null);

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
    [fetchEnrichment, step, setWebsiteAnalysis],
  );

  // Restore step-specific enrichment result when navigating.
  useEffect(() => {
    if (!isOpen) return;
    const stepResult = enrichByStepRef.current.get(step) || null;
    applyEnrichmentToActiveStep(stepResult);
    setShowClarifyGate(false);
    setClarifyQuestions([]);
  }, [applyEnrichmentToActiveStep, isOpen, step]);

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

  return {
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
  };
}
