"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import {
  MODEL_TIER_OPTIONS,
  getDefaultCustomInstructions,
  isDefaultCustomInstructions,
} from "@/lib/builder/defaults";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-store";
import { SCAFFOLD_OFF_BASELINE_ID, type ScaffoldMode } from "@/lib/gen/scaffolds/types";
import { SCAFFOLD_CLIENT_LIST } from "@/lib/gen/scaffolds/scaffold-client-list.generated";

const MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST = SCAFFOLD_CLIENT_LIST.filter(
  ({ id }) => id !== SCAFFOLD_OFF_BASELINE_ID,
);
import { useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  ChevronDown,
  Download,
  FolderGit2,
  Github,
  HelpCircle,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Link2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Lightbulb,
  Globe,
  Save,
  Settings2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BuilderPublishControl } from "./BuilderPublishControl";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;

  promptAssistModel: string;
  promptAssistDeep: boolean;
  canUseDeepBrief: boolean;

  scaffoldMode: ScaffoldMode;
  scaffoldId: string | null;
  onScaffoldModeChange: (mode: ScaffoldMode) => void;
  onScaffoldIdChange: (id: string | null) => void;

  customInstructions: string;
  onCustomInstructionsChange: (value: string) => void;
  applyInstructionsOnce: boolean;
  onApplyInstructionsOnceChange: (value: boolean) => void;

  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (v: boolean) => void;
  enableThinking: boolean;
  onEnableThinkingChange: (v: boolean) => void;
  isImageGenerationsSupported: boolean;
  isMediaEnabled: boolean;
  chatPrivacy: "private" | "unlisted";
  onChatPrivacyChange: (v: "private" | "unlisted") => void;
  enableBlobMedia: boolean;
  onEnableBlobMediaChange: (v: boolean) => void;
  enableAutofix: boolean;
  onEnableAutofixChange: (v: boolean) => void;

  showStructuredChat: boolean;
  onShowStructuredChatChange: (v: boolean) => void;
  tipsEnabled: boolean;
  onTipsEnabledChange: (v: boolean) => void;
  isFigmaInputOpen: boolean;
  onToggleFigmaInput: () => void;

  chatId: string | null;
  activeVersionId: string | null;

  onOpenImport: () => void;
  onExportGitHub: () => void;
  onDeployProduction: () => void;
  onDomainSearch: () => void;
  onGoHome: () => void;
  onNewChat: () => void;
  onSaveProject: () => void;
  onCancelGeneration: () => void;

  isDeploying: boolean;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  isSavingProject: boolean;
  canDeploy: boolean;
  canManageDomain: boolean;
  canSaveProject: boolean;
  deploymentStatus?: "pending" | "building" | "ready" | "error" | "cancelled" | null;
  deploymentUrl?: string | null;
  /** A4: Vercels byggloggs-URL för den senaste (failade) publiceringen. */
  deploymentInspectorUrl?: string | null;
  /** A3: kör manuell deploy-repair ("Publicera om med fix") vid build-fel. */
  onRepublishWithFix?: () => void;
  /** A3: sant medan deploy-repair körs (knappen visar spinner). */
  isRepublishRepairing?: boolean;
  /** Hydrated live deployment (survives reloads). Drives "Publicerad" vs
   * "Publicera ändringar" together with `activeVersionId`. */
  liveDeploymentUrl?: string | null;
  liveDeploymentVersionId?: string | null;
  /** True when publish-state hydration failed after automatic retries. */
  deploymentHistoryHydrationFailed?: boolean;
  onRetryDeploymentHistory?: () => void;
  deployDisabledReason?: string | null;

  /** Toggles the version-history drawer (desktop only — panel is hidden < lg). */
  onToggleVersions?: () => void;
  isVersionPanelOpen?: boolean;

  /**
   * Previewens verktygskluster (`Kod`, `Byggblock`, `Bygg integrationer`,
   * `Rensa`, `Öppna`). Renderas som en avgränsad grupp precis före `Ny chat`.
   * Ägaren avgör själv när klustret ska finnas — utan preview skickas inget.
   */
  previewTools?: ReactNode;
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    promptAssistModel: _promptAssistModel,
    promptAssistDeep,
    canUseDeepBrief,
    scaffoldMode,
    scaffoldId,
    onScaffoldModeChange,
    onScaffoldIdChange,
    customInstructions,
    onCustomInstructionsChange,
    applyInstructionsOnce,
    onApplyInstructionsOnceChange,
    enableImageGenerations,
    onEnableImageGenerationsChange,
    enableThinking,
    onEnableThinkingChange,
    isImageGenerationsSupported,
    isMediaEnabled,
    chatPrivacy,
    onChatPrivacyChange,
    enableBlobMedia,
    onEnableBlobMediaChange,
    enableAutofix,
    onEnableAutofixChange,
    showStructuredChat,
    onShowStructuredChatChange,
    tipsEnabled,
    onTipsEnabledChange,
    isFigmaInputOpen,
    onToggleFigmaInput,
    chatId,
    activeVersionId,
    onOpenImport,
    onExportGitHub,
    onDeployProduction,
    onDomainSearch,
    onGoHome,
    onNewChat,
    onSaveProject,
    onCancelGeneration,
    isDeploying,
    isCreatingChat,
    isAnyStreaming,
    isSavingProject,
    canDeploy,
    canManageDomain,
    canSaveProject,
    deploymentStatus,
    deploymentUrl,
    deploymentInspectorUrl,
    onRepublishWithFix,
    isRepublishRepairing,
    liveDeploymentUrl,
    liveDeploymentVersionId,
    deploymentHistoryHydrationFailed,
    onRetryDeploymentHistory,
    deployDisabledReason,
    onToggleVersions,
    isVersionPanelOpen = false,
    previewTools,
  } = props;

  const isBusy = isAnyStreaming || isCreatingChat;
  const isConfigLocked = isAnyStreaming;
  const currentModel = MODEL_TIER_OPTIONS.find((m) => m.value === selectedModelTier);
  const modelButtonLabel = currentModel?.label || "AI";
  const scaffoldButtonLabel =
    scaffoldMode === "off"
      ? "Av"
      : scaffoldMode === "auto"
        ? "Auto"
        : (SCAFFOLD_CLIENT_LIST.find((scaffold) => scaffold.id === scaffoldId)?.label ?? "Välj");
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = isDefaultCustomInstructions(customInstructions);
  const assistStatusSummary =
    promptAssistDeep && canUseDeepBrief ? "Deep Brief aktiv" : "Assist aktiv";
  const runDeferredAction = useCallback((action: () => void) => {
    if (typeof window === "undefined") {
      action();
      return;
    }
    window.requestAnimationFrame(action);
  }, []);
  const { isAuthenticated, logout } = useAuth();
  const searchParams = useSearchParams();
  const showDebugViewToggle = searchParams.get("debug") === "1";
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- client-only mounted flag for hydration */
    setHasMounted(true);
  }, []);
  const handleLogout = useCallback(() => {
    logout();
    runDeferredAction(onGoHome);
  }, [logout, onGoHome, runDeferredAction]);

  // Headerns höjd är ett golv, inte ett tak: högergruppen är `flex-wrap`, så en
  // smal skärm lägger knapparna på flera rader. Med fast `h-14` ritades de
  // raderna utanför headern, ovanpå mobilflikarna och previewen.
  return (
    <header className="border-border bg-background flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGoHome}
          className="text-xl font-semibold tracking-tight transition-opacity hover:opacity-80"
          aria-label="Sajtmaskin — gå till startsidan"
          title="Till startsidan"
        >
          Sajtmaskin
        </button>
        {hasMounted && isAuthenticated && (
          <Button variant="ghost" size="sm" onClick={handleLogout} title="Logga ut">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logga ut</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Byggmodell-väljaren flyttade in i Mer → Inställningar 2026-07-31
            (Ö1, meny-konsolidering N2) — ingen genväg eller kompakt etikett
            kvar i headern. Vald profil syns första klicket in i Inställningar
            (sub-triggerns "Byggmodell: <profil>"-etikett nedan). */}
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  {/* Triggern lämnas aktiv — varje item/submeny har egen spärr
                      (isBusy för import/export och Spara, isConfigLocked för
                      inställningar och dess nästlade scaffold-/byggmodellval),
                      så inställningar förblir nåbara under chat-skapande
                      precis som tidigare. */}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Mer — spara, inställningar, import och export"
                    title="Spara, inställningar, import och export"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">Mer</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p>Spara projektet, ändra inställningar eller importera/exportera</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Projekt</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canSaveProject || isBusy || isSavingProject}
              onSelect={(event) => {
                event.preventDefault();
                runDeferredAction(() => {
                  void onSaveProject();
                });
              }}
            >
              {isSavingProject ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Spara projekt
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isConfigLocked}>
                <Settings2 className="mr-2 h-4 w-4" />
                Inställningar
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isConfigLocked}>
                    <Layers className="mr-2 h-4 w-4" />
                    <span className="max-w-[160px] truncate">Scaffold: {scaffoldButtonLabel}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <DropdownMenuLabel>Scaffold</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={
                        scaffoldMode === "manual" ? `manual:${scaffoldId ?? ""}` : scaffoldMode
                      }
                      onValueChange={(v) => {
                        if (v === "off" || v === "auto") {
                          onScaffoldModeChange(v);
                          onScaffoldIdChange(null);
                        } else if (v.startsWith("manual:")) {
                          const id = v.slice("manual:".length);
                          onScaffoldModeChange("manual");
                          onScaffoldIdChange(id || null);
                        }
                      }}
                    >
                      <DropdownMenuRadioItem value="off">Av</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="auto">Auto</DropdownMenuRadioItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                        Välj själv
                      </DropdownMenuLabel>
                      {MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST.map((scaffold) => (
                        <DropdownMenuRadioItem key={scaffold.id} value={`manual:${scaffold.id}`}>
                          <span className="font-medium">{scaffold.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {scaffold.description}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isConfigLocked}>
                    <Bot className="mr-2 h-4 w-4" />
                    <span className="max-w-[160px] truncate">Byggmodell: {modelButtonLabel}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <span>Byggmodell</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground ml-auto flex cursor-help items-center">
                              <HelpCircle className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p className="text-xs">
                              Byggprofiler: Premium, Lagom, Tänker, Kod Max och Anthropic. Varje
                              profil väljer en konkret modell i den egna motorn. Förbättra nedan är
                              separat och används till promptförbättring, mallval och designbrief
                              innan första bygget.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </DropdownMenuLabel>
                    {/* assistStatusSummary bodde tidigare bara i trigger-tooltipen
                    på den fristående Modell-knappen. Den knappen är borta
                    (Ö1), så det här är nu den enda ytan som visar
                    prompt-assist-statusen. */}
                    <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                      {assistStatusSummary}
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={selectedModelTier}
                      onValueChange={(v) => onSelectedModelTierChange(v as ModelTier)}
                    >
                      {MODEL_TIER_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          <span className="font-medium">{option.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {option.description}
                          </span>
                          {option.hint && (
                            <span className="text-primary ml-1 text-xs">({option.hint})</span>
                          )}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Generering</DropdownMenuLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={enableThinking}
                          onCheckedChange={onEnableThinkingChange}
                          disabled={isConfigLocked}
                        >
                          <Wand2 className="mr-2 h-4 w-4" />
                          Resonemang
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        Aktiverar provider-reasoning. Premium använder GPT-5.6 Sol med high och
                        pro-läge enligt fasinställningarna.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={enableImageGenerations}
                          onCheckedChange={onEnableImageGenerationsChange}
                          disabled={!isImageGenerationsSupported || isConfigLocked}
                        >
                          <ImageIcon className="mr-2 h-4 w-4" />
                          AI-bilder
                          {!isImageGenerationsSupported && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (ej tillgängligt)
                            </span>
                          )}
                          {isImageGenerationsSupported && !isMediaEnabled && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (blob saknas)
                            </span>
                          )}
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        Slå på för att be AI om bilder. Om Blob saknas kan bilder saknas i
                        förhandsvisningen.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={enableBlobMedia}
                          onCheckedChange={onEnableBlobMediaChange}
                          disabled={isConfigLocked}
                        >
                          <ImageIcon className="mr-2 h-4 w-4" />
                          Blob-bilder
                          {!isMediaEnabled && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (blob saknas)
                            </span>
                          )}
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        Kopierar externa bildadresser till bildlagring vid publicering. Stäng av om
                        du vill behålla externa länkar som de är.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={enableAutofix}
                          onCheckedChange={onEnableAutofixChange}
                          disabled={isConfigLocked}
                        >
                          <Wrench className="mr-2 h-4 w-4" />
                          Åtgärda fel automatiskt
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        När kvalitetskontrollen eller förhandsvisningen misslyckas skickas
                        automatiskt en reparationsprompt. Stäng av om du vill styra allt manuellt.
                        Parametrarna ?autofix och ?noautofix i URL:en åsidosätter tillfälligt.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={chatPrivacy === "unlisted"}
                          onCheckedChange={(checked) =>
                            onChatPrivacyChange(checked ? "unlisted" : "private")
                          }
                          disabled={isConfigLocked}
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          Publik preview
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        Gör demosidan nåbar via länk (olistad). Krävs för inspektionsläget eftersom
                        servern måste kunna läsa förhandsvisningen.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Inmatning</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={isConfigLocked}
                  onSelect={(event) => {
                    event.preventDefault();
                    onToggleFigmaInput();
                  }}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {isFigmaInputOpen ? "Dölj Figma-länk" : "Visa Figma-länk"}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Instruktioner</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={isConfigLocked}
                  onSelect={(event) => {
                    event.preventDefault();
                    setIsInstructionsOpen(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Egna instruktioner
                  {hasCustomInstructions && (
                    <span className="text-muted-foreground ml-2 text-xs">Aktiv</span>
                  )}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                {showDebugViewToggle && (
                  <>
                    <DropdownMenuLabel>Chattvy</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={showStructuredChat}
                      onCheckedChange={onShowStructuredChatChange}
                      disabled={isConfigLocked}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Felsökningsvy (verktygsblock)
                    </DropdownMenuCheckboxItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                  Tips · 2 credits per hämtning
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={tipsEnabled}
                  onCheckedChange={(checked) => onTipsEnabledChange(Boolean(checked))}
                  disabled={isConfigLocked}
                >
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Visa tips efter AI-svar
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Importera och exportera</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                runDeferredAction(onOpenImport);
              }}
            >
              <FolderGit2 className="mr-2 h-4 w-4" />
              Importera (GitHub eller ZIP)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!chatId || !activeVersionId || isBusy}
              onSelect={(event) => {
                event.preventDefault();
                if (chatId && activeVersionId) {
                  window.open(
                    `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(activeVersionId)}/download?format=zip`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Ladda ner som ZIP
            </DropdownMenuItem>
            {/* Bara export ligger under GitHub-subben (Ö2, 2026-07-31).
                Importvalet ovan hanterar både GitHub och ZIP, så det får
                inte gömmas under en GitHub-rubrik. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!chatId || !activeVersionId || isBusy}>
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuItem
                  disabled={!chatId || !activeVersionId || isBusy}
                  onSelect={(event) => {
                    event.preventDefault();
                    runDeferredAction(onExportGitHub);
                  }}
                >
                  <Github className="mr-2 h-4 w-4" />
                  Exportera till GitHub
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {isBusy ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => runDeferredAction(onCancelGeneration)}
            title="Avbryt pågående generering"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Avbryt</span>
          </Button>
        ) : null}

        {previewTools}

        <Button
          variant="outline"
          size="sm"
          onClick={() => runDeferredAction(onNewChat)}
          disabled={isBusy}
          title="Starta en ny chat (nuvarande finns kvar i historiken)"
        >
          {isCreatingChat ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Ny chat</span>
        </Button>

        {onToggleVersions ? (
          <Button
            variant={isVersionPanelOpen ? "secondary" : "outline"}
            size="sm"
            onClick={onToggleVersions}
            aria-pressed={isVersionPanelOpen}
            title={isVersionPanelOpen ? "Stäng versionshistoriken" : "Öppna versionshistoriken"}
            className="hidden lg:inline-flex"
          >
            <History className="h-4 w-4" />
            <span className="hidden xl:inline">Versioner</span>
          </Button>
        ) : null}

        <BuilderPublishControl
          activeVersionId={activeVersionId}
          canDeploy={canDeploy}
          canManageDomain={canManageDomain}
          deployDisabledReason={deployDisabledReason}
          deploymentHistoryHydrationFailed={deploymentHistoryHydrationFailed}
          deploymentInspectorUrl={deploymentInspectorUrl}
          deploymentStatus={deploymentStatus}
          deploymentUrl={deploymentUrl}
          isBusy={isBusy}
          isDeploying={isDeploying}
          isRepublishRepairing={isRepublishRepairing}
          liveDeploymentUrl={liveDeploymentUrl}
          liveDeploymentVersionId={liveDeploymentVersionId}
          onDeployProduction={() =>
            runDeferredAction(() => {
              void onDeployProduction();
            })
          }
          onDomainSearch={() => runDeferredAction(onDomainSearch)}
          onRepublishWithFix={
            onRepublishWithFix ? () => runDeferredAction(onRepublishWithFix) : undefined
          }
          onRetryDeploymentHistory={onRetryDeploymentHistory}
        />
      </div>

      <Dialog open={isInstructionsOpen} onOpenChange={setIsInstructionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Egna instruktioner</DialogTitle>
            <DialogDescription>
              Instruktioner används när en ny chat startas. Du kan välja att rensa dem efter nästa
              generering.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={customInstructions}
              onChange={(event) => onCustomInstructionsChange(event.target.value)}
              placeholder="Skriv regler, ramverk eller preferenser för denna chat."
              rows={5}
            />
            <div className="text-muted-foreground text-xs">
              Exempel: “Använd Next.js App Router, Tailwind CSS, shadcn/ui och prioritera
              tillgänglighet.”
            </div>
            <div className="border-border bg-muted/40 flex items-start gap-3 rounded-lg border p-3 text-sm">
              <Switch
                id={applyOnceId}
                checked={applyInstructionsOnce}
                onCheckedChange={onApplyInstructionsOnceChange}
                disabled={isBusy}
                className="mt-0.5"
              />
              <Label htmlFor={applyOnceId} className="flex flex-col gap-1 font-normal">
                <span className="font-medium">Gäller endast nästa generation</span>
                <span className="text-muted-foreground text-xs">
                  Efter att versionen skapats rensas instruktionerna automatiskt.
                </span>
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  onCustomInstructionsChange(getDefaultCustomInstructions(scaffoldMode))
                }
                disabled={isBusy || isDefaultInstructions}
              >
                Använd standard
              </Button>
              <Button
                variant="outline"
                onClick={() => onCustomInstructionsChange("")}
                disabled={isBusy || !customInstructions.trim()}
              >
                Rensa
              </Button>
              <Button onClick={() => setIsInstructionsOpen(false)}>Klar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
