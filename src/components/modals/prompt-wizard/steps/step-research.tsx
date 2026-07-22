"use client";

import type { Dispatch, SetStateAction } from "react";
import { Building2, Lightbulb, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompetitorMap } from "@/components/modals/competitor-map";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import type { Competitor } from "@/app/api/wizard/competitors/route";
import { INPUT_CLASS, type IndustryOption } from "@/components/modals/prompt-wizard/constants";
import { FollowUpRenderer } from "@/components/modals/prompt-wizard/follow-up-renderer";
import type { EnrichSuggestion, FollowUpQuestion } from "@/components/modals/prompt-wizard/types";

/** STEP 3: Existing Site & Inspiration & Competitors (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function StepResearch({
  websiteAnalysis,
  existingWebsite,
  companyLookup,
  siteFeedback,
  setSiteFeedback,
  competitors,
  isLoadingCompetitors,
  marketInsight,
  locationLat,
  locationLng,
  inspirationSites,
  setInspirationSites,
  updateInspirationSite,
  addInspirationSite,
  isEnriching,
  suggestions,
  currentIndustry,
  followUpQuestions,
  followUpAnswers,
  handleFollowUpAnswer,
}: {
  websiteAnalysis: string | null;
  existingWebsite: string;
  companyLookup: CompanyLookupResult | null;
  siteFeedback: string;
  setSiteFeedback: Dispatch<SetStateAction<string>>;
  competitors: Competitor[];
  isLoadingCompetitors: boolean;
  marketInsight: string | null;
  locationLat: number | undefined;
  locationLng: number | undefined;
  inspirationSites: string[];
  setInspirationSites: Dispatch<SetStateAction<string[]>>;
  updateInspirationSite: (index: number, value: string) => void;
  addInspirationSite: () => void;
  isEnriching: boolean;
  suggestions: EnrichSuggestion[];
  currentIndustry: IndustryOption | undefined;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  handleFollowUpAnswer: (id: string, value: string) => void;
}) {
  return (
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
          data-openclaw-text-target="wizard.research.site_feedback"
          data-openclaw-text-label="Wizard: vad ska förbättras"
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
  );
}
