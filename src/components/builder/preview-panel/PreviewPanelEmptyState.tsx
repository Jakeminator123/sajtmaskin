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
import {
  isPreviewBuildErrorBlocking,
  previewBuildErrorTitle,
  type PreviewBuildErrorState,
  type PreviewLifecycleState,
} from "@/lib/builder/preview-lifecycle";
import type { DesignTheme } from "@/lib/builder/theme-presets";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewBackdropStage } from "./PreviewBackdropStage";
import { PreviewPanelInitControls } from "./composer/PreviewPanelInitControls";
import { useRepairBlocked } from "@/lib/builder/repair-blocked";
import { useWelcomeComposer } from "@/lib/builder/welcome-composer-bridge";
import { cn } from "@/lib/utils";

/**
 * "i chatten till vänster" stämmer bara på desktop. Under `lg` ligger chatten
 * i en egen flik, så texten säger det i stället (CSS väljer, inget JS-mått).
 */
function ChatLocation() {
  return (
    <>
      <span className="hidden lg:inline">till vänster</span>
      <span className="lg:hidden">(fliken Chatt)</span>
    </>
  );
}

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
  /**
   * Plan mode (2026-10-22): the chat shows a build plan with "Godkänn plan
   * och bygg" and no version exists yet. This is a waiting state, not a
   * missing preview — never offer "Försök reparera preview" here.
   */
  awaitingPlanApproval?: boolean;
  previewPending: boolean;
  previewBuildError?: PreviewBuildErrorState | null;
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
  /**
   * Failed `POST /api/template` while `?templateId=` is still in the URL.
   * Spinner must not represent this — show the error and «Försök igen».
   */
  templateInitError?: string | null;
  onRetryTemplateInit?: (() => void) | null;
  /**
   * The landing prompt is prefilled in the composer but not sent: free text
   * waits for Byggval before the first build (no auto-start).
   */
  hasPrefilledPrompt?: boolean;
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
  awaitingPlanApproval = false,
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
  templateInitError = null,
  onRetryTemplateInit = null,
  hasPrefilledPrompt = false,
}: PreviewPanelEmptyStateProps) {
  // Täcker både pågående generering och deterministisk /finalize-design.
  const repairBlocked = useRepairBlocked(isGenerating);
  // Chattens utkast + start (publiceras av komposern före första bygget). Tom
  // ögonblicksbild → neutralt förslag och ingen startknapp, aldrig en död knapp.
  const welcomeComposer = useWelcomeComposer();
  // A template entry (`?templateId=...`) is never a blank onboarding start:
  // the template already decides site type/pages/style, and the chat is being
  // initialized in the background. Until `chatId` hydrates, show the loading
  // state instead of the Byggval onboarding controls. `useSearchParams` is
  // null outside a router context (e.g. component tests), which safely
  // disables this branch there.
  const searchParams = useSearchParams();
  const pendingTemplateInit = Boolean(searchParams?.get("templateId")) && !chatId;
  const templateInitFailed = pendingTemplateInit && Boolean(templateInitError);
  const isInitialEmpty = !chatId && !versionId && !externalLoading && !pendingTemplateInit;
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
  // Use one winning-state predicate for copy, icon, hint and repair controls.
  // A stale plan must never hide recovery when a higher-priority state wins.
  const showPlanApproval = Boolean(
    awaitingPlanApproval && chatId && !versionId &&
    !previewBuildError && !pendingTemplateInit && !versionlessAborted &&
    !(activeVersionStatus === "retrying" && !activeVersionIsLatest) &&
    previewLifecycle !== "recovering" && !activeStatusTitle &&
    !previewPending && !awaitingInput && !externalLoading && !repairBlocked,
  );
  const title = previewBuildError
    ? previewBuildErrorTitle(previewBuildError)
    : templateInitFailed
      ? "Kunde inte läsa in templaten"
    : versionlessAborted
      ? "Genereringen avbröts"
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? "Byter till reparerad version"
      : previewLifecycle === "recovering"
        ? "Återansluter till live-preview"
        : activeStatusTitle ??
          (previewPending
            ? "Startar VM-preview"
            : pendingTemplateInit
              ? "Läser in templaten"
            : awaitingInput
              ? "AI väntar på ditt svar"
              : showPlanApproval
                ? "Planen väntar på ditt godkännande"
              : isInitialEmpty
                ? "Välkommen"
                : externalLoading
                  ? "Genererar kod"
                  : "Ingen förhandsvisning ännu");
  // Plain-language body only — the stage id and any host log tail belong in
  // the chrome banner's collapsed detail, not in the empty-state headline.
  const subtitle = previewBuildError
    ? previewBuildError.message
    : templateInitFailed
      ? templateInitError || "Templaten kunde inte startas. Försök igen."
    : versionlessAborted
      ? "Strömmen avbröts innan en version sparades. Den här chatten kan inte repareras — starta om genereringen i en ny chat."
    : activeVersionStatus === "retrying" && !activeVersionIsLatest
      ? activeVersionSummary || "En nyare reparerad version tar över som den aktuella previewn."
      : previewLifecycle === "recovering"
        ? "Vi verifierar sessionen mot servern och återansluter förhandsgranskningen om det behövs."
        : activeStatusSubtitle ??
          (previewPending
            ? "Sajten startar och visas så snart den är klar."
            : pendingTemplateInit
              ? "Templaten importeras och förhandsvisningen öppnas strax."
            : awaitingInput
              ? "AI behöver ditt svar innan nästa preview kan genereras."
              : showPlanApproval
                ? "Läs igenom planen i chatten till vänster och klicka på Godkänn plan och bygg, eller skriv vad du vill ändra. Förhandsvisningen skapas när bygget startar."
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
  const showRetryTemplateInit = Boolean(
    templateInitFailed && onRetryTemplateInit && !externalLoading && !previewPending,
  );
  const showRestartAction = Boolean(
    versionlessAborted && onRestartGeneration && !externalLoading && !previewPending,
  );
  const showFixAction = Boolean(
    !versionlessAborted &&
      onFixPreview &&
      !externalLoading &&
      !repairBlocked &&
      !isInitialEmpty &&
      // No chat exists yet during a template init — nothing to repair.
      !pendingTemplateInit &&
      !awaitingInput &&
      !showPlanApproval &&
      !previewPending,
  );
  // Ikonen följer samma gren som rubriken. Alla arbetslägen ("Genererar kod",
  // "Verifierar version", "Startar VM-preview" …) får en lugn spinner — aldrig
  // utropstecknet, som läses som ett fel (V-01, riggens baslinje 2026-11-11).
  const isWorkingState =
    !previewBuildError &&
    !templateInitFailed &&
    !versionlessAborted &&
    ((activeVersionStatus === "retrying" && !activeVersionIsLatest) ||
      previewLifecycle === "recovering" ||
      Boolean(activeStatusTitle) ||
      previewPending ||
      pendingTemplateInit ||
      (externalLoading && !awaitingInput));
  const emptyIconKind = previewBuildError
    ? previewBuildError.severity === "info"
      ? "question"
      : "error"
    : templateInitFailed
      ? "error"
      : versionlessAborted
        ? "restart"
        : isWorkingState
          ? "working"
          : awaitingInput || showPlanApproval
            ? "question"
            : isInitialEmpty
              ? "welcome"
              : "missing";
  const EmptyIcon = {
    error: AlertCircle,
    question: MessageCircleQuestion,
    restart: RotateCcw,
    working: Loader2,
    welcome: Wand2,
    missing: AlertCircle,
  }[emptyIconKind];

  // Välkomst-läget (ingen chat/version ännu) är ett riktigt onboarding-steg:
  // "Sidans utseende" först, övriga Byggval bakom "Fler byggval". Valen går
  // strukturerat i request-meta, aldrig som text i chattens input.
  const showWelcome =
    isInitialEmpty && !previewBuildError && !awaitingInput && !previewPending;

  // Moving Background 2 rör sig när ytan väntar, och fryser till stillbild vid
  // ett verkligt fel — då ska diagnostiken, inte scenen, ta uppmärksamheten.
  // Ett `info`-fel är en notis och stoppar inte scenen.
  const backdropMotion = !isPreviewBuildErrorBlocking(previewBuildError);

  if (showWelcome) {
    const welcomeDescription = welcomeComposer.draft;
    const welcomeStart =
      welcomeComposer.start && welcomeDescription.trim() ? welcomeComposer.start : null;
    return (
      <PreviewBackdropStage motion statusKey="welcome" variant="welcome">
        <div className="w-full max-w-md text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-foreground mb-2 text-xl font-semibold tracking-tight">
            {hasPrefilledPrompt ? "Din beskrivning är klar" : "Vad vill du bygga?"}
          </h2>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            {hasPrefilledPrompt ? (
              <>
                Den ligger i chatten <ChatLocation />.{" "}
                {welcomeStart
                  ? "Välj gärna utseende nedan och skapa sedan första utkastet."
                  : "Välj gärna utseende nedan och tryck sedan på pilen i chatten för att skapa första utkastet."}
              </>
            ) : (
              <>
                Beskriv din sajt i chatten <ChatLocation />. Valen nedan styr första
                utkastet.
              </>
            )}
          </p>

          <PreviewPanelInitControls
            designTheme={designTheme}
            onDesignThemeChange={onDesignThemeChange}
            themeLocked={themeLocked}
            description={welcomeDescription}
            onStart={welcomeStart}
          />

          {/* Full opacitet: /70 mot builder-bakgrunden gav ~3.7:1 och föll på
              WCAG 2 AA (4.5:1) i Vercel-toolbarens a11y-kontroll. Med en
              startknapp i panelen behövs inte hänvisningen till chatten. */}
          {welcomeStart ? null : (
            <p className="text-muted-foreground mt-6 inline-flex items-center gap-1.5 text-xs">
              <ArrowLeft className="hidden h-3.5 w-3.5 lg:inline" aria-hidden="true" />
              <span>
                Skriv i chatten <ChatLocation /> för att starta
              </span>
            </p>
          )}
        </div>
      </PreviewBackdropStage>
    );
  }

  return (
    <PreviewBackdropStage motion={backdropMotion} statusKey={title}>
      <EmptyIcon
        aria-hidden="true"
        data-empty-icon={emptyIconKind}
        className={cn(
          "mb-4 h-12 w-12",
          isWorkingState && "text-primary/80 motion-safe:animate-spin",
        )}
      />
      <p className="text-foreground mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>
        {title}
      </p>
      <p className="text-sm" suppressHydrationWarning>
        {subtitle}
      </p>
      {showPlanApproval ? (
        <p className="text-muted-foreground mt-4 inline-flex items-center gap-1.5 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Planen och knappen finns i chatten till vänster
        </p>
      ) : null}
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
      {showRetryTemplateInit ? (
        <Button className="mt-4" onClick={onRetryTemplateInit!} disabled={externalLoading}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Försök igen
        </Button>
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
    </PreviewBackdropStage>
  );
}

