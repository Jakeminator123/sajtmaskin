"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import {
  MODEL_TIER_OPTIONS,
  getDefaultCustomInstructions,
  isDefaultCustomInstructions,
} from "@/lib/builder/defaults";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAuth } from "@/lib/auth/auth-store";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import { SCAFFOLD_CLIENT_LIST } from "@/lib/gen/scaffolds/types";
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
  HelpCircle,
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
  Rocket,
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
import { useCallback, useEffect, useId, useState } from "react";
import { BuilderProjectMenu } from "@/components/builder/BuilderProjectMenu";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;
  onApplyAnthropicComparePreset: () => void;

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
  appProjectId: string | null;

  onOpenImport: () => void;
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
  deployDisabledReason?: string | null;

  /**
   * Apple-minimal header: only logo + (Avbryt) + Publicera are visible.
   * The rest is collapsed into a single "···" dropdown.
   */
  compact?: boolean;
  onOpenDetailsDrawer?: () => void;
  onToggleUiMode?: () => void;
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    onApplyAnthropicComparePreset,
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
    appProjectId,
    onOpenImport,
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
    deployDisabledReason,
    compact = false,
    onOpenDetailsDrawer,
    onToggleUiMode,
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
        : SCAFFOLD_CLIENT_LIST.find((scaffold) => scaffold.id === scaffoldId)?.label ?? "Välj";
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = isDefaultCustomInstructions(customInstructions);
  const assistStatusSummary = promptAssistDeep && canUseDeepBrief
    ? "Deep Brief aktiv"
    : "Assist aktiv";
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

  return (
    <header className="border-border bg-background flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center transition-opacity hover:opacity-80"
          aria-label="Gå till startsidan"
          title="Till startsidan"
        >
          <Image
            src="/LOGO_SM2.0.png"
            alt="Sajtmaskin"
            width={843}
            height={168}
            priority
            className="h-5 w-auto object-contain md:h-6"
          />
        </button>
        {hasMounted && isAuthenticated && (
          <Button variant="ghost" size="sm" onClick={handleLogout} title="Logga ut">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logga ut</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!compact && <><DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isConfigLocked}>
                    <Bot className="h-4 w-4" />
                    <span className="hidden max-w-[220px] truncate sm:inline">
                      Modell: {modelButtonLabel}
                    </span>
                    
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p>Byggmodell: {modelButtonLabel}</p>
                <p>{assistStatusSummary}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-64">
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
                      Byggprofiler: Snabb, Lagom, Tanker, Kod Max och Anthropic. Varje profil väljer en
                      konkret modell i den egna motorn. Förbättra nedan är separat och används till
                      promptförbättring, mallval och designbrief innan första bygget.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedModelTier}
              onValueChange={(v) => onSelectedModelTierChange(v as ModelTier)}
            >
              {MODEL_TIER_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <span className="font-medium">{option.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                  {option.hint && (
                    <span className="text-primary ml-1 text-xs">({option.hint})</span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isConfigLocked}
              onSelect={(event) => {
                event.preventDefault();
                onApplyAnthropicComparePreset();
              }}
            >
              <Bot className="mr-2 h-4 w-4" />
              Claude-läge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isConfigLocked}>
                    <Layers className="h-4 w-4" />
                    <span className="hidden max-w-[180px] truncate sm:inline">
                      Mall: {scaffoldButtonLabel}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p>Hemsidemall — startpunkt för genererad kod</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Hemsidemall</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={scaffoldMode === "manual" ? `manual:${scaffoldId ?? ""}` : scaffoldMode}
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
              {SCAFFOLD_CLIENT_LIST.map((scaffold) => (
                <DropdownMenuRadioItem
                  key={scaffold.id}
                  value={`manual:${scaffold.id}`}
                >
                  <span className="font-medium">{scaffold.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {scaffold.description}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isConfigLocked}>
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Inställningar</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Generering</DropdownMenuLabel>
            {/* Fast-tier (gpt-5.4-fast) does not support reasoning deltas
                in the manifest — server-side phase routing already forces
                thinking=false for this tier. We mirror that here so the
                user gets immediate feedback instead of toggling a setting
                that has no effect. */}
            {(() => {
              const thinkingUnsupportedForTier = selectedModelTier === "fast";
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuCheckboxItem
                          checked={enableThinking && !thinkingUnsupportedForTier}
                          onCheckedChange={onEnableThinkingChange}
                          disabled={isConfigLocked || thinkingUnsupportedForTier}
                        >
                          <Wand2 className="mr-2 h-4 w-4" />
                          Resonemang
                          {thinkingUnsupportedForTier && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (ej i Snabb)
                            </span>
                          )}
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        {thinkingUnsupportedForTier
                          ? "Snabb-modellen stödjer inte resonemang. Välj Lagom eller Tanker för att aktivera resonemang."
                          : "Aktiverar mer resonemang i AI-svaret. Ger högre kvalitet men kan ta längre tid."}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

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
                        <span className="text-muted-foreground ml-2 text-xs">(blob saknas)</span>
                      )}
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Slå på för att be AI om bilder. Om Blob saknas kan bilder saknas i förhandsvisningen.
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
                        <span className="text-muted-foreground ml-2 text-xs">(blob saknas)</span>
                      )}
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Kopierar externa bildadresser till Vercel Blob vid publicering. Stäng av om du vill
                    behålla externa länkar som de är.
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
                    När kvalitetskontrollen eller förhandsvisningen misslyckas skickas automatiskt en
                    reparationsprompt. Stäng av om du vill styra allt manuellt. Parametrarna ?autofix och
                    ?noautofix i URL:en åsidosätter tillfälligt.
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
          </DropdownMenuContent>
        </DropdownMenu></>}

        {!compact && (
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      aria-label="Fler åtgärder: import, runtime och nedladdning"
                      title="Importera, starta runtime eller ladda ner ZIP"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="hidden sm:inline">Mer</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p>Importera från GitHub eller ZIP, eller ladda ner projektet som ZIP</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-60">
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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

        {!compact && hasMounted && isAuthenticated && (
          <BuilderProjectMenu
            currentProjectId={appProjectId}
            disabled={isBusy}
          />
        )}

        {!compact && (
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
        )}

        {!compact && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              runDeferredAction(() => {
                void onSaveProject();
              })
            }
            disabled={!canSaveProject || isBusy || isSavingProject}
            title="Spara projekt"
          >
            {isSavingProject ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Spara</span>
          </Button>
        )}

        {!compact && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => runDeferredAction(onDomainSearch)}
            disabled={!canManageDomain || isBusy}
            title="Sök & köp domän"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Domän</span>
          </Button>
        )}

        {compact && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Fler åtgärder"
                title="Fler åtgärder"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Projekt</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={(event) => {
                  event.preventDefault();
                  runDeferredAction(onNewChat);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ny chat
              </DropdownMenuItem>
              {hasMounted && isAuthenticated && (
                <DropdownMenuItem asChild>
                  <a href="/projects" className="flex items-center">
                    <FolderGit2 className="mr-2 h-4 w-4" />
                    Tidigare projekt
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!canSaveProject || isBusy || isSavingProject}
                onSelect={(event) => {
                  event.preventDefault();
                  runDeferredAction(() => {
                    void onSaveProject();
                  });
                }}
              >
                <Save className="mr-2 h-4 w-4" />
                Spara projekt
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canManageDomain || isBusy}
                onSelect={(event) => {
                  event.preventDefault();
                  runDeferredAction(onDomainSearch);
                }}
              >
                <Globe className="mr-2 h-4 w-4" />
                Domän
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Import &amp; export</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={(event) => {
                  event.preventDefault();
                  runDeferredAction(onOpenImport);
                }}
              >
                <FolderGit2 className="mr-2 h-4 w-4" />
                Importera (GitHub/ZIP)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!chatId || !activeVersionId || isBusy}
                onSelect={(event) => {
                  event.preventDefault();
                  if (chatId && activeVersionId) {
                    window.open(
                      `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(activeVersionId)}/download?format=zip`,
                      "_blank",
                    );
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Ladda ner som ZIP
              </DropdownMenuItem>
              {(onOpenDetailsDrawer || onToggleUiMode) && <DropdownMenuSeparator />}
              {onOpenDetailsDrawer && (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onOpenDetailsDrawer();
                  }}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  Verktyg &amp; inställningar
                </DropdownMenuItem>
              )}
              {onToggleUiMode && (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onToggleUiMode();
                  }}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Växla läge (utökat)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {deploymentStatus === "building" ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Bygger...</span>
          </Button>
        ) : deploymentStatus === "ready" && deploymentUrl ? (
          <Button
            size="sm"
            variant="outline"
            className="border-green-500 text-green-600"
            onClick={() =>
              window.open(
                deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Publicerad</span>
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    onClick={() =>
                      runDeferredAction(() => {
                        void onDeployProduction();
                      })
                    }
                    disabled={!canDeploy || isBusy || isDeploying}
                  >
                    {isDeploying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Publicera</span>
                  </Button>
                </span>
              </TooltipTrigger>
              {!canDeploy && deployDisabledReason ? (
                <TooltipContent side="bottom" className="max-w-sm text-xs">
                  <p>{deployDisabledReason}</p>
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        )}
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
                onClick={() => onCustomInstructionsChange(getDefaultCustomInstructions(scaffoldMode))}
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
