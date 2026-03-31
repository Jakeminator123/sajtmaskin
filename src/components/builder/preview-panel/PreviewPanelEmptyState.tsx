"use client";

import { AlertCircle, Loader2, MessageCircleQuestion, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}: PreviewPanelEmptyStateProps) {
  const isInitialEmpty = !chatId && !versionId && !externalLoading;
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
    : sandboxPending
      ? "Startar live-preview"
      : awaitingInput
        ? "AI väntar på ditt svar"
        : isInitialEmpty
          ? "Välkommen"
          : "Ingen förhandsvisning ännu";
  const subtitle = sandboxBuildError
    ? `Steg: ${sandboxBuildError.stage}. ${sandboxBuildError.message}`
    : sandboxPending
      ? "Next.js byggs i sandbox och previewn visas så snart dev-servern svarar."
      : awaitingInput
        ? "AI behöver ditt svar innan nästa preview kan genereras."
        : externalLoading
          ? "AI tänker... preview kommer strax."
          : isInitialEmpty
            ? "Skriv en prompt till vänster så genererar vi första preview."
            : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
  const showFixAction = Boolean(
    onFixPreview && !externalLoading && !isInitialEmpty && !awaitingInput && !sandboxPending,
  );
  const EmptyIcon = sandboxBuildError
    ? AlertCircle
    : sandboxPending
      ? Loader2
      : awaitingInput
        ? MessageCircleQuestion
        : isInitialEmpty
          ? Wand2
          : AlertCircle;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
      <EmptyIcon className={cn("mb-4 h-12 w-12", sandboxPending && "animate-spin")} />
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
