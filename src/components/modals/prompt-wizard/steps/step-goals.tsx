"use client";

import type { Dispatch, SetStateAction } from "react";
import { Check, Lightbulb, Loader2, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import { INPUT_CLASS, PURPOSE_OPTIONS } from "@/components/modals/prompt-wizard/constants";
import { FollowUpRenderer } from "@/components/modals/prompt-wizard/follow-up-renderer";
import type { EnrichSuggestion, FollowUpQuestion } from "@/components/modals/prompt-wizard/types";

/** STEP 2: Your Goals (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function StepGoals({
  purposes,
  togglePurpose,
  targetAudience,
  setTargetAudience,
  audienceSuggestion,
  setAudienceSuggestion,
  companyLookup,
  usp,
  setUsp,
  suggestions,
  isEnriching,
  followUpQuestions,
  followUpAnswers,
  handleFollowUpAnswer,
}: {
  purposes: string[];
  togglePurpose: (purposeId: string) => void;
  targetAudience: string;
  setTargetAudience: Dispatch<SetStateAction<string>>;
  audienceSuggestion: string | null;
  setAudienceSuggestion: Dispatch<SetStateAction<string | null>>;
  companyLookup: CompanyLookupResult | null;
  usp: string;
  setUsp: Dispatch<SetStateAction<string>>;
  suggestions: EnrichSuggestion[];
  isEnriching: boolean;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  handleFollowUpAnswer: (id: string, value: string) => void;
}) {
  return (
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
          data-openclaw-text-target="wizard.goals.target_audience"
          data-openclaw-text-label="Wizard: målgrupp"
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
            data-openclaw-text-target="wizard.goals.usp"
            data-openclaw-text-label="Wizard: USP"
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
  );
}
