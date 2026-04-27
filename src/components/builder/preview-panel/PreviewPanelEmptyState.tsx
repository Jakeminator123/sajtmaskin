"use client";

import { AlertCircle, Loader2, MessageCircleQuestion, RotateCcw, Wand2 } from "lucide-react";
import type { EngineVersionDisplayStatus } from "@/lib/db/engine-version-lifecycle";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
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
  previewLifecycle?: PreviewLifecycleState | string;
  activeVersionStatus?: EngineVersionDisplayStatus | string | null;
  activeVersionSummary?: unknown;
  activeVersionIsLatest?: boolean;
  onFixPreview?: (() => void) | null;
  simplified?: boolean;
  generationPhase?: GenerationPhase;
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
  previewPending: sandboxPending = false,
  previewBuildError: sandboxBuildError,
  previewLifecycle,
  activeVersionStatus,
  activeVersionSummary,
  activeVersionIsLatest,
  onFixPreview,
  simplified = false,
  generationPhase,
  versionlessAborted = false,
  onRestartGeneration,
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

  if ((externalLoading || sandboxPending) && !sandboxBuildError) {
    return <GenerationProgress phase={generationPhase ?? "brief"} />;
  }

  // Visa progress direkt så fort vi har en chat/version men ännu ingen preview
  // och inte heller väntar på input eller har ett byggfel — det undanröjer
  // glappet mellan chat-skapande och första stream-eventet där skärmen
  // annars stod blank.
  if (
    !isInitialEmpty &&
    !awaitingInput &&
    !sandboxBuildError &&
    (Boolean(chatId) || Boolean(versionId) || Boolean(generationPhase))
  ) {
    return <GenerationProgress phase={generationPhase ?? "brief"} />;
  }

  if (isInitialEmpty) {
    return <GenerationProgress phase={null} />;
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
          <p className="mb-1 text-sm font-medium text-foreground">Behöver din input</p>
          <p className="text-xs">Svara i chatten till höger så fortsätter vi.</p>
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
  const activeVersionSummaryText =
    typeof activeVersionSummary === "string" && activeVersionSummary.trim()
      ? activeVersionSummary.trim()
      : null;
  const title = sandboxBuildError
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
      : sandboxPending
      ? "Startar VM-preview"
      : awaitingInput
        ? "AI väntar på ditt svar"
        : isInitialEmpty
          ? "Välkommen"
          : externalLoading
            ? "Genererar kod"
          : "Ingen förhandsvisning ännu";
  const subtitle = sandboxBuildError
    ? `Steg: ${sandboxBuildError.stage}. ${sandboxBuildError.message}`
    : versionlessAborted
      ? "Strömmen avbröts innan en version sparades. Den här chatten kan inte repareras — starta om genereringen i en ny chat."
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? activeVersionSummaryText || "En nyare reparerad version tar över som den aktuella previewn."
      : previewLifecycle === "recovering"
        ? "Vi verifierar sessionen mot servern och återansluter förhandsgranskningen om det behövs."
        : activeVersionStatus === "verifying"
          ? activeVersionSummaryText || "Versionen är sparad och verifieras innan den markeras som stabil."
          : activeVersionStatus === "repairing"
            ? activeVersionSummaryText || "Versionen repareras i bakgrunden innan nästa användbara preview blir aktiv."
    : sandboxPending
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
  // parent maps to a fresh chat). The "repair preview" button is
  // suppressed so the user cannot send a followup_general into a chat
  // that has nothing to repair.
  const showRestartAction = Boolean(
    versionlessAborted && onRestartGeneration && !externalLoading && !sandboxPending,
  );
  const showFixAction = Boolean(
    !versionlessAborted &&
      onFixPreview &&
      !externalLoading &&
      !isInitialEmpty &&
      !awaitingInput &&
      !sandboxPending,
  );
  const EmptyIcon = sandboxBuildError
    ? AlertCircle
    : versionlessAborted
      ? RotateCcw
      : sandboxPending
        ? Loader2
        : awaitingInput
          ? MessageCircleQuestion
          : isInitialEmpty
            ? Wand2
            : AlertCircle;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-card p-6 text-muted-foreground">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card px-8 py-10 text-center shadow-sm">
        <EmptyIcon className={cn("mx-auto mb-4 h-10 w-10 text-primary/85", sandboxPending && "animate-spin")} />
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
            Försök reparera preview
          </Button>
        ) : null}
        {showRestartAction ? (
          <Button className="mt-4" onClick={onRestartGeneration!} disabled={externalLoading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Starta om generation
          </Button>
        ) : null}
      </div>
    </div>
  );
}
