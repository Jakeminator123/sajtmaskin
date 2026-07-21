"use client";

import type { Dispatch, SetStateAction } from "react";
import { Loader2, Mic, Sparkles, Video, Wand2 } from "lucide-react";
import type { ColorPalette } from "@/components/forms/color-palette-picker";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { VideoRecorder } from "@/components/forms/video-recorder";
import {
  CLARIFY_FALLBACK_ID,
  DESIGN_FEATURES,
  INPUT_CLASS,
  PURPOSE_OPTIONS,
  VIBE_OPTIONS,
  type IndustryOption,
} from "@/components/modals/prompt-wizard/constants";
import { FollowUpRenderer } from "@/components/modals/prompt-wizard/follow-up-renderer";
import type {
  EnrichMeta,
  EnrichSuggestion,
  FollowUpQuestion,
  PresentationAnalysis,
} from "@/components/modals/prompt-wizard/types";

/** STEP 5: Special Wishes & Generate (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function StepReview({
  showClarifyGate,
  isClarifying,
  clarifyQuestions,
  followUpAnswers,
  handleFollowUpAnswer,
  requiresClarifyFallback,
  hasClarifyUnknowns,
  activeEnrichMeta,
  industry,
  selectedFeatures,
  setSelectedFeatures,
  currentIndustry,
  specialWishes,
  setSpecialWishes,
  suggestions,
  setVoiceTranscript,
  companyName,
  setPresentationAnalysis,
  purposes,
  selectedVibe,
  selectedPalette,
  usp,
}: {
  showClarifyGate: boolean;
  isClarifying: boolean;
  clarifyQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  handleFollowUpAnswer: (id: string, value: string) => void;
  requiresClarifyFallback: boolean;
  hasClarifyUnknowns: boolean;
  activeEnrichMeta: EnrichMeta | null;
  industry: string;
  selectedFeatures: Set<string>;
  setSelectedFeatures: Dispatch<SetStateAction<Set<string>>>;
  currentIndustry: IndustryOption | undefined;
  specialWishes: string;
  setSpecialWishes: Dispatch<SetStateAction<string>>;
  suggestions: EnrichSuggestion[];
  setVoiceTranscript: Dispatch<SetStateAction<string>>;
  companyName: string;
  setPresentationAnalysis: Dispatch<SetStateAction<PresentationAnalysis | null>>;
  purposes: string[];
  selectedVibe: string;
  selectedPalette: ColorPalette | null;
  usp: string;
}) {
  return (
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
          data-openclaw-text-target="wizard.final.special_wishes"
          data-openclaw-text-label="Wizard: egna önskemål"
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
  );
}
