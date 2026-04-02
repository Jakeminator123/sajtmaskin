"use client";

import { AlertCircle, Loader2, MessageCircleQuestion, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { GenerationProgress } from "./GenerationProgress";

interface PreviewPanelEmptyStateProps {
  chatId: string | null;
  versionId: string | null;
  externalLoading: boolean;
  awaitingInput: boolean;
  awaitingInputQuestion?: string | null;
  awaitingInputOptions: string[];
  sandboxPending: boolean;
  sandboxBuildError?: { stage: string; message: string } | null;
  onFixPreview?: (() => void) | null;
  simplified?: boolean;
}

export function PreviewPanelEmptyState({
  chatId,
  versionId,
  externalLoading,
  awaitingInput,
  awaitingInputQuestion,
  awaitingInputOptions,
  sandboxPending,
  sandboxBuildError,
  onFixPreview,
  simplified = false,
}: PreviewPanelEmptyStateProps) {
  const isInitialEmpty = !chatId && !versionId && !externalLoading;

  if ((externalLoading || sandboxPending) && !sandboxBuildError && !awaitingInput) {
    return <GenerationProgress />;
  }

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

  if (simplified) {
    if (awaitingInput) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-400">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-gray-500" />
          <p className="text-sm">Svara i chatten så fortsätter jag.</p>
        </div>
      );
    }
    if (!isInitialEmpty && onFixPreview) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-400">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-gray-500" />
          <p className="text-sm">Startar om förhandsgranskningen...</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
        <Wand2 className="mb-4 h-10 w-10" />
        <p className="mb-2 text-base font-medium">Din hemsida visas här</p>
        <p className="text-sm text-gray-400">Svara på frågorna i chatten så skapar jag din sajt.</p>
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
    ? "Sandbox-preview misslyckades"
    : awaitingInput
      ? "AI väntar på ditt svar"
      : isInitialEmpty
        ? "Välkommen"
        : "Ingen förhandsvisning ännu";
  const subtitle = sandboxBuildError
    ? `Steg: ${sandboxBuildError.stage}. ${sandboxBuildError.message}`
    : awaitingInput
      ? "AI behöver ditt svar innan nästa preview kan genereras."
      : isInitialEmpty
        ? "Skriv en prompt till vänster så genererar vi första preview."
        : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
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
    <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
      <EmptyIcon className={cn("mb-4 h-12 w-12")} />
      <p className="mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>
        {title}
      </p>
      <p className="text-sm" suppressHydrationWarning>
        {subtitle}
      </p>
      {awaitingInput && normalizedAwaitingQuestion ? (
        <div className="mt-4 max-w-xl space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-amber-100">{normalizedAwaitingQuestion}</p>
          {normalizedAwaitingOptions.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {normalizedAwaitingOptions.map((option) => (
                <Badge
                  key={option}
                  variant="secondary"
                  className="border border-amber-500/20 bg-amber-500/10 text-amber-100"
                >
                  {option}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-200/80">Svara i chatten till vänster för att fortsätta.</p>
          )}
        </div>
      ) : null}
      {showFixAction ? (
        <Button className="mt-4" onClick={onFixPreview!} disabled={externalLoading}>
          Försök reparera preview
        </Button>
      ) : null}
    </div>
  );
}
