"use client";

import { AlertCircle, Loader2, MessageCircleQuestion, RotateCcw, Wand2 } from "lucide-react";
import type { EngineVersionDisplayStatus } from "@/lib/db/engine-version-lifecycle";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
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
  previewPending: boolean;
  previewBuildError?: { stage: string; message: string } | null;
  previewLifecycle?: PreviewLifecycleState;
  activeVersionStatus?: EngineVersionDisplayStatus | null;
  activeVersionSummary?: string | null;
  activeVersionIsLatest?: boolean;
  onFixPreview?: (() => void) | null;
  /**
   * P0 stream-abort recovery (2026-04-26). True when the most recent
   * generation/repair stream for this chat died before any version was
   * created. Forces the action area into "Starta om generation" mode
   * and suppresses the "Försök reparera preview" button (there is
   * nothing to repair).
   */
  versionlessAborted?: boolean;
  onRestartGeneration?: (() => void) | null;
}

export function PreviewPanelEmptyState({
  chatId,
  versionId,
  externalLoading,
  awaitingInput,
  awaitingInputQuestion,
  awaitingInputOptions,
  previewPending,
  previewBuildError,
  previewLifecycle,
  activeVersionStatus,
  activeVersionSummary,
  activeVersionIsLatest = true,
  onFixPreview,
  versionlessAborted = false,
  onRestartGeneration,
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
  const title = previewBuildError
    ? "Live-preview misslyckades"
    : versionlessAborted
      ? "Genereringen avbröts"
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? "Byter till reparerad version"
      : previewLifecycle === "recovering"
        ? "Återansluter till live-preview"
        : activeVersionStatus === "verifying"
          ? "Verifierar version"
          : activeVersionStatus === "repairing"
            ? "Reparerar version"
    : previewPending
      ? "Startar VM-preview"
      : awaitingInput
        ? "AI väntar på ditt svar"
        : isInitialEmpty
          ? "Välkommen"
          : externalLoading
            ? "Genererar kod"
          : "Ingen förhandsvisning ännu";
  const subtitle = previewBuildError
    ? `Steg: ${previewBuildError.stage}. ${previewBuildError.message}`
    : versionlessAborted
      ? "Strömmen avbröts innan en version sparades. Den här chatten kan inte repareras — starta om genereringen i en ny chat."
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? activeVersionSummary || "En nyare reparerad version tar över som den aktuella previewn."
      : previewLifecycle === "recovering"
        ? "Vi verifierar sessionen mot servern och återansluter förhandsgranskningen om det behövs."
        : activeVersionStatus === "verifying"
          ? activeVersionSummary || "Versionen är sparad och verifieras innan den markeras som stabil."
          : activeVersionStatus === "repairing"
            ? activeVersionSummary || "Versionen repareras i bakgrunden innan nästa användbara preview blir aktiv."
    : previewPending
      ? "Sajten startar och visas så snart den är klar."
      : awaitingInput
        ? "AI behöver ditt svar innan nästa preview kan genereras."
        : externalLoading
          ? "AI tänker... preview kommer strax."
          : isInitialEmpty
            ? "Skriv en prompt till vänster så genererar vi första preview."
            : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
  // P0 stream-abort recovery (2026-04-26). When the chat is versionless +
  // aborted, the only valid action is "restart generation" (which the
  // parent maps to a fresh chat with restartedFromChatId lineage). The
  // "repair preview" button is suppressed so the user cannot send a
  // followup_general into a chat that has nothing to repair.
  const showRestartAction = Boolean(
    versionlessAborted && onRestartGeneration && !externalLoading && !previewPending,
  );
  const showFixAction = Boolean(
    !versionlessAborted &&
      onFixPreview &&
      !externalLoading &&
      !isInitialEmpty &&
      !awaitingInput &&
      !previewPending,
  );
  const EmptyIcon = previewBuildError
    ? AlertCircle
    : versionlessAborted
      ? RotateCcw
      : previewPending
        ? Loader2
        : awaitingInput
          ? MessageCircleQuestion
          : isInitialEmpty
            ? Wand2
            : AlertCircle;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
      <EmptyIcon className={cn("mb-4 h-12 w-12", previewPending && "animate-spin")} />
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
      {showRestartAction ? (
        <Button className="mt-4" onClick={onRestartGeneration!} disabled={externalLoading}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Starta om generation
        </Button>
      ) : null}
      {showFixAction ? (
        <Button className="mt-4" onClick={onFixPreview!} disabled={externalLoading}>
          Försök reparera preview
        </Button>
      ) : null}
    </div>
  );
}
