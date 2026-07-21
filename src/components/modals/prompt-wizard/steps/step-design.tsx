"use client";

import type { Dispatch, SetStateAction } from "react";
import { Palette, Sparkles, Wand2 } from "lucide-react";
import {
  ColorPalettePicker,
  type ColorPalette,
} from "@/components/forms/color-palette-picker";
import { VIBE_OPTIONS } from "@/components/modals/prompt-wizard/constants";
import { FollowUpRenderer } from "@/components/modals/prompt-wizard/follow-up-renderer";
import type { EnrichSuggestion, FollowUpQuestion } from "@/components/modals/prompt-wizard/types";

type CustomColors = { primary: string; secondary: string; accent: string } | null;

/** STEP 4: Design Preferences (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function StepDesign({
  selectedVibe,
  setSelectedVibe,
  suggestions,
  selectedPalette,
  setSelectedPalette,
  customColors,
  setCustomColors,
  industry,
  followUpQuestions,
  followUpAnswers,
  handleFollowUpAnswer,
}: {
  selectedVibe: string;
  setSelectedVibe: Dispatch<SetStateAction<string>>;
  suggestions: EnrichSuggestion[];
  selectedPalette: ColorPalette | null;
  setSelectedPalette: Dispatch<SetStateAction<ColorPalette | null>>;
  customColors: CustomColors;
  setCustomColors: Dispatch<SetStateAction<CustomColors>>;
  industry: string;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  handleFollowUpAnswer: (id: string, value: string) => void;
}) {
  return (
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
  );
}
