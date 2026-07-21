"use client";

import { Building2, Check, Globe, Loader2, Palette, Rocket, Sparkles, Target } from "lucide-react";
import { StepVisual } from "@/components/modals/step-visual";
import type { EnrichMeta } from "@/components/modals/prompt-wizard/types";

// ── Step titles and subtitles ─────────────────────────────────
const STEP_META: Record<number, { title: string; subtitle: string; icon: React.ReactNode }> = {
  1: { title: "Berätta om ditt företag", subtitle: "Vi vill förstå ditt företag bättre", icon: <Building2 className="h-5 w-5" /> },
  2: { title: "Mål och målgrupp", subtitle: "Vad vill du uppnå med din webbplats?", icon: <Target className="h-5 w-5" /> },
  3: { title: "Nuvarande sida och inspiration", subtitle: "Vad finns idag och vad inspirerar dig?", icon: <Globe className="h-5 w-5" /> },
  4: { title: "Design och färger", subtitle: "Hur ska din webbplats se ut och kännas?", icon: <Palette className="h-5 w-5" /> },
  5: { title: "Slutför och skapa", subtitle: "Lägg till sista detaljerna", icon: <Rocket className="h-5 w-5" /> },
};

/** Modal header: progress indicator, step title and AI status banners (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function WizardHeader({
  step,
  stepFlow,
  currentStepIndex,
  totalSteps,
  industry,
  selectedVibe,
  isEnriching,
  isScraping,
  isClarifying,
  insightSummary,
  activeEnrichMeta,
  isLookingUp,
  isLoadingCompetitors,
}: {
  step: number;
  stepFlow: number[];
  currentStepIndex: number;
  totalSteps: number;
  industry: string;
  selectedVibe: string;
  isEnriching: boolean;
  isScraping: boolean;
  isClarifying: boolean;
  insightSummary: string | null;
  activeEnrichMeta: EnrichMeta | null;
  isLookingUp: boolean;
  isLoadingCompetitors: boolean;
}) {
  const currentMeta = STEP_META[step] ?? STEP_META[1];

  return (
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
  );
}
