"use client";

import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  formatRepairPassProgress,
  type VersionDisplayStatus,
} from "@/lib/builder/version-status-display";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
import type { DesignTheme } from "@/lib/builder/theme-presets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewPanelInitControls } from "./PreviewPanelInitControls";
import { useRepairBlocked } from "@/lib/builder/repair-blocked";
import { cn } from "@/lib/utils";

interface PreviewPanelEmptyStateProps {
  chatId: string | null;
  versionId: string | null;
  /** Färgtema-preset till Byggval-reglagen (flyttad från Avancerat). */
  designTheme?: DesignTheme;
  onDesignThemeChange?: (theme: DesignTheme) => void;
  themeLocked?: boolean;
  externalLoading: boolean;
  awaitingInput: boolean;
  awaitingInputQuestion?: string | null;
  awaitingInputOptions: string[];
  previewPending: boolean;
  previewBuildError?: { stage: string; message: string } | null;
  previewLifecycle?: PreviewLifecycleState;
  activeVersionStatus?: VersionDisplayStatus | null;
  activeVersionSummary?: string | null;
  activeVersionIsLatest?: boolean;
  /** Latest repair pass index (0 when none), for bounded "Reparerar (X/2)" copy. */
  activeVersionRepairPassIndex?: number;
  onFixPreview?: (() => void) | null;
  /**
   * Sant när appen redan arbetar med en generering. Samma grind som i
   * `PreviewPanelFrame`: "Försök reparera preview" startar en ny debiterad
   * körning, så den får inte erbjudas mitt i en pågående.
   */
  isGenerating?: boolean;
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
  designTheme,
  onDesignThemeChange,
  themeLocked = false,
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
  activeVersionRepairPassIndex = 0,
  onFixPreview,
  isGenerating = false,
  versionlessAborted = false,
  onRestartGeneration,
}: PreviewPanelEmptyStateProps) {
  // Täcker både pågående generering och deterministisk /finalize-design.
  const repairBlocked = useRepairBlocked(isGenerating);
  const isInitialEmpty = !chatId && !versionId && !externalLoading;
  const normalizedAwaitingQuestion =
    typeof awaitingInputQuestion === "string" && awaitingInputQuestion.trim()
      ? awaitingInputQuestion.trim()
      : null;
  const normalizedAwaitingOptions = awaitingInputOptions
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 6);
  const activeStatusTitle =
    activeVersionStatus === "autofixing"
      ? "Kör mekanisk autofix"
      : activeVersionStatus === "validating"
        ? "Validerar kod"
        : activeVersionStatus === "preflighting"
          ? "Sparar version"
          : activeVersionStatus === "verifying"
            ? "Verifierar version"
            : activeVersionStatus === "repairing"
              ? `Reparerar version${
                  formatRepairPassProgress(activeVersionRepairPassIndex)
                    ? ` (${formatRepairPassProgress(activeVersionRepairPassIndex)})`
                    : ""
                }`
              : null;
  const activeStatusSubtitle =
    activeVersionStatus === "autofixing"
      ? activeVersionSummary ||
        "Mekaniska fixers rättar vanliga import-, struktur- och syntaxproblem innan validering."
      : activeVersionStatus === "validating"
        ? activeVersionSummary || "Genererad kod valideras och poleras innan versionen sparas."
        : activeVersionStatus === "preflighting"
          ? activeVersionSummary || "Finaliserar filer, kör preflight och sparar versionen."
          : activeVersionStatus === "verifying"
            ? activeVersionSummary || "Versionen är sparad och verifieras innan den markeras som stabil."
            : activeVersionStatus === "repairing"
              ? activeVersionSummary ||
                "Versionen repareras i bakgrunden innan nästa användbara preview blir aktiv."
              : null;
  const title = previewBuildError
    ? "Live-preview misslyckades"
    : versionlessAborted
      ? "Genereringen avbröts"
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? "Byter till reparerad version"
      : previewLifecycle === "recovering"
        ? "Återansluter till live-preview"
        : activeStatusTitle ??
          (previewPending
            ? "Startar VM-preview"
            : awaitingInput
              ? "AI väntar på ditt svar"
              : isInitialEmpty
                ? "Välkommen"
                : externalLoading
                  ? "Genererar kod"
                  : "Ingen förhandsvisning ännu");
  const subtitle = previewBuildError
    ? `Steg: ${previewBuildError.stage}. ${previewBuildError.message}`
    : versionlessAborted
      ? "Strömmen avbröts innan en version sparades. Den här chatten kan inte repareras — starta om genereringen i en ny chat."
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? activeVersionSummary || "En nyare reparerad version tar över som den aktuella previewn."
      : previewLifecycle === "recovering"
        ? "Vi verifierar sessionen mot servern och återansluter förhandsgranskningen om det behövs."
        : activeStatusSubtitle ??
          (previewPending
            ? "Sajten startar och visas så snart den är klar."
            : awaitingInput
              ? "AI behöver ditt svar innan nästa preview kan genereras."
              : externalLoading
                ? "AI tänker... preview kommer strax."
                : isInitialEmpty
                  ? "Skriv en prompt till vänster så genererar vi första preview."
                  : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.");
  // P0 stream-abort recovery (2026-04-26). When the chat is versionless +
  // aborted, the only valid action is "restart generation" (which the
  // parent maps to a fresh chat). The "repair preview" button is
  // suppressed so the user cannot send a followup_general into a chat
  // that has nothing to repair.
  const showRestartAction = Boolean(
    versionlessAborted && onRestartGeneration && !externalLoading && !previewPending,
  );
  const showFixAction = Boolean(
    !versionlessAborted &&
      onFixPreview &&
      !externalLoading &&
      !repairBlocked &&
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

  // Välkomst-läget (ingen chat/version ännu) är ett riktigt onboarding-steg:
  // Byggval-reglagen låter användaren styra typ, sidantal, komplexitet, stil
  // och färgläge — valen skrivs in som ett eget stycke i chattens input.
  const showWelcome =
    isInitialEmpty && !previewBuildError && !awaitingInput && !previewPending;

  if (showWelcome) {
    return (
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-black/20 px-6 py-8">
        <div className="w-full max-w-md text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-foreground mb-2 text-xl font-semibold tracking-tight">
            Vad vill du bygga?
          </h2>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Beskriv din sajt i chatten till vänster. Gör gärna några byggval nedan — de styr
            första versionen.
          </p>

          <PreviewPanelInitControls
            designTheme={designTheme}
            onDesignThemeChange={onDesignThemeChange}
            themeLocked={themeLocked}
          />

          {/* Full opacitet: /70 mot builder-bakgrunden gav ~3.7:1 och föll på
              WCAG 2 AA (4.5:1) i Vercel-toolbarens a11y-kontroll. */}
          <p className="text-muted-foreground mt-6 inline-flex items-center gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Skriv i chatten till vänster för att starta
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center bg-black/20 px-6 text-center">
      <EmptyIcon className={cn("mb-4 h-12 w-12", previewPending && "animate-spin")} />
      <p className="text-foreground mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>
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
        <Button
          className="mt-4"
          onClick={onFixPreview!}
          disabled={externalLoading || repairBlocked}
        >
          Försök reparera preview
        </Button>
      ) : null}
    </div>
  );
}
