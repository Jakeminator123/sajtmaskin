"use client";

import { AlertCircle, Loader2, MessageCircleQuestion, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { GenerationProgress, type GenerationPhase } from "./GenerationProgress";

export interface PreviewPanelEmptyStateProps {
  chatId: string | null;
  versionId: string | null;
  externalLoading: boolean;
  awaitingInput: boolean;
  awaitingInputQuestion?: string | null;
  awaitingInputOptions: string[];
  previewPending?: boolean;
  previewBuildError?: { stage: string; message: string } | null;
  previewLifecycle?: string;
  activeVersionStatus?: string | null;
  activeVersionSummary?: unknown;
  activeVersionIsLatest?: boolean;
  onFixPreview?: (() => void) | null;
  simplified?: boolean;
  generationPhase?: GenerationPhase;
}

export function PreviewPanelEmptyState({
  chatId,
  versionId,
  externalLoading,
  awaitingInput,
  awaitingInputQuestion,
  awaitingInputOptions,
  previewPending: sandboxPending = false,
  previewBuildError: sandboxBuildError,
  onFixPreview,
  simplified = false,
  generationPhase,
}: PreviewPanelEmptyStateProps) {
  const isInitialEmpty = !chatId && !versionId && !externalLoading;
  const autoRecoverFiredRef = useRef(false);

  useEffect(() => {
    if (!simplified || isInitialEmpty || !onFixPreview || externalLoading || sandboxPending) return;
    if (autoRecoverFiredRef.current) return;
    autoRecoverFiredRef.current = true;
    onFixPreview();
  }, [simplified, isInitialEmpty, onFixPreview, externalLoading, sandboxPending]);

  useEffect(() => {
    if (externalLoading || sandboxPending) {
      autoRecoverFiredRef.current = false;
    }
  }, [externalLoading, sandboxPending]);

  if ((externalLoading || sandboxPending) && !sandboxBuildError && !awaitingInput) {
    return <GenerationProgress phase={generationPhase} />;
  }

  if (simplified) {
    if (sandboxBuildError) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
          <AlertCircle className="mb-3 h-8 w-8 text-destructive/60" />
          <p className="mb-1 text-sm font-medium text-foreground">Sajten kunde inte visas</p>
          <p className="mb-4 max-w-sm text-xs text-muted-foreground">Något gick fel. Klicka nedan så försöker vi igen.</p>
          {onFixPreview && (
            <Button size="sm" onClick={onFixPreview} disabled={externalLoading}>
              Försök igen
            </Button>
          )}
        </div>
      );
    }
    if (awaitingInput) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
          <MessageCircleQuestion className="mb-3 h-8 w-8 text-primary/60" />
          <p className="mb-1 text-sm font-medium text-foreground">Jag behöver ditt svar</p>
          <p className="text-xs">Svara i chatten så fortsätter jag bygga.</p>
        </div>
      );
    }
    if (!isInitialEmpty && onFixPreview) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
          <p className="text-sm">Laddar din sajt&hellip;</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <Wand2 className="mb-3 h-8 w-8 text-primary/30" />
        <p className="mb-1 text-sm font-medium text-foreground">Din hemsida visas här</p>
        <p className="text-xs">Svara på frågorna så skapar jag din sajt.</p>
      </div>
    );
  }

  const normalizedAwaitingQuestion =
    typeof awaitingInputQuestion === "string" && awaitingInputQuestion.trim()
      ? awaitingInputQuestion.trim()
      : null;
  const normalizedAwaitingOptions = awaitingInputOptions
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 6);
  const title = sandboxBuildError
    ? "Sajten kunde inte byggas"
    : awaitingInput
      ? "AI väntar på ditt svar"
      : isInitialEmpty
        ? "Välkommen"
        : "Ingen sajt att visa ännu";
  const subtitle = sandboxBuildError
    ? `Steg: ${sandboxBuildError.stage}. ${sandboxBuildError.message}`
    : awaitingInput
      ? "AI behöver ditt svar innan nästa version kan genereras."
      : isInitialEmpty
        ? "Skriv en prompt till vänster så skapar vi din sajt."
        : "Det finns ingen vy för senaste versionen. Testa att generera igen eller reparera.";
  const showFixAction = Boolean(
    onFixPreview && !externalLoading && !isInitialEmpty && !awaitingInput && !sandboxPending,
  );
  const EmptyIcon = sandboxBuildError
    ? AlertCircle
    : awaitingInput
      ? MessageCircleQuestion
      : isInitialEmpty
        ? Wand2
        : AlertCircle;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-muted/20 text-muted-foreground">
      <EmptyIcon className={cn("mb-4 h-12 w-12")} />
      <p className="mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>
        {title}
      </p>
      <p className="text-sm" suppressHydrationWarning>
        {subtitle}
      </p>
      {awaitingInput && normalizedAwaitingQuestion ? (
        <div className="mt-4 max-w-xl space-y-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-foreground">{normalizedAwaitingQuestion}</p>
          {normalizedAwaitingOptions.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {normalizedAwaitingOptions.map((option) => (
                <Badge
                  key={option}
                  variant="secondary"
                  className="border border-primary/20 bg-primary/10 text-foreground"
                >
                  {option}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Svara i chatten till vänster för att fortsätta.</p>
          )}
        </div>
      ) : null}
      {showFixAction ? (
        <Button className="mt-4" onClick={onFixPreview!} disabled={externalLoading}>
          Försök igen
        </Button>
      ) : null}
    </div>
  );
}
