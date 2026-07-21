"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Loader2, Rocket, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Modal footer: navigation/generate buttons (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function WizardFooter({
  showEditMode,
  step,
  onClose,
  handleBack,
  isExpanding,
  isClarifying,
  isEnriching,
  setShowEditMode,
  setGeneratedPrompt,
  setEditedPrompt,
  handleComplete,
  currentStepIndex,
  totalSteps,
  handleNext,
  canProceed,
  handleGenerate,
}: {
  showEditMode: boolean;
  step: number;
  onClose: () => void;
  handleBack: () => void;
  isExpanding: boolean;
  isClarifying: boolean;
  isEnriching: boolean;
  setShowEditMode: Dispatch<SetStateAction<boolean>>;
  setGeneratedPrompt: Dispatch<SetStateAction<string | null>>;
  setEditedPrompt: Dispatch<SetStateAction<string>>;
  handleComplete: () => void;
  currentStepIndex: number;
  totalSteps: number;
  handleNext: () => void;
  canProceed: () => boolean;
  handleGenerate: () => Promise<void>;
}) {
  return (
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
  );
}
