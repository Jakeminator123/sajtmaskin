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
    ? "Bygget misslyckades"
    : awaitingInput
      ? "Svar behövs"
      : isInitialEmpty
        ? "Välkommen"
        : "Ingen preview än";
  const subtitle = sandboxBuildError
    ? `${sandboxBuildError.stage}: ${sandboxBuildError.message}`
    : awaitingInput
      ? "Svara i chatten."
      : isInitialEmpty
        ? "Skriv en prompt till vänster."
        : "Generera igen eller reparera.";
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
    <div className="flex h-full flex-col items-center justify-center bg-muted/15 p-6 text-muted-foreground">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card px-8 py-10 text-center shadow-sm">
        <EmptyIcon className={cn("mx-auto mb-4 h-10 w-10 text-primary/85")} />
        <p className="mb-2 text-base font-medium tracking-tight text-foreground" suppressHydrationWarning>
          {title}
        </p>
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {subtitle}
        </p>
        {awaitingInput && normalizedAwaitingQuestion ? (
          <div className="mt-5 space-y-3 rounded-[var(--radius)] border border-border bg-muted/30 px-4 py-3 text-left">
            <p className="text-sm font-medium text-foreground">{normalizedAwaitingQuestion}</p>
            {normalizedAwaitingOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {normalizedAwaitingOptions.map((option) => (
                  <Badge
                    key={option}
                    variant="secondary"
                    className="border border-border bg-background text-foreground"
                  >
                    {option}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Svara i chatten.</p>
            )}
          </div>
        ) : null}
        {showFixAction ? (
          <Button className="mt-6" onClick={onFixPreview!} disabled={externalLoading}>
            Försök igen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
