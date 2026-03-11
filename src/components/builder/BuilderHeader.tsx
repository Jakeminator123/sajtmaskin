"use client";

import { isGatewayAssistModel, resolvePromptAssistProvider } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import {
  MODEL_TIER_OPTIONS,
  PROMPT_ASSIST_OFF_VALUE,
  getPromptAssistModelLabel,
  getPromptAssistModelOptions,
  getDefaultCustomInstructions,
  isDefaultCustomInstructions,
} from "@/lib/builder/defaults";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-store";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import { getAllScaffolds } from "@/lib/gen/scaffolds";
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
  Plus,
  Lightbulb,
  Globe,
  Rocket,
  Save,
  Settings2,
  Wand2,
  TerminalSquare,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useId, useState } from "react";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;

  promptAssistModel: string;
  onPromptAssistModelChange: (model: string) => void;
  promptAssistDeep: boolean;
  onPromptAssistDeepChange: (deep: boolean) => void;
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
  isThinkingSupported: boolean;
  isImageGenerationsSupported: boolean;
  isMediaEnabled: boolean;
  chatPrivacy: "private" | "unlisted";
  onChatPrivacyChange: (v: "private" | "unlisted") => void;
  enableBlobMedia: boolean;
  onEnableBlobMediaChange: (v: boolean) => void;

  showStructuredChat: boolean;
  onShowStructuredChatChange: (v: boolean) => void;
  tipsEnabled: boolean;
  onTipsEnabledChange: (v: boolean) => void;
  isFigmaInputOpen: boolean;
  onToggleFigmaInput: () => void;

  chatId: string | null;
  activeVersionId: string | null;

  onOpenImport: () => void;
  onOpenSandbox: () => void;
  onDeployProduction: () => void;
  onDomainSearch: () => void;
  onGoHome: () => void;
  onNewChat: () => void;
  onSaveProject: () => void;

  isDeploying: boolean;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  isSavingProject: boolean;
  canDeploy: boolean;
  canSaveProject: boolean;
  deploymentStatus?: "pending" | "building" | "ready" | "error" | "cancelled" | null;
  deploymentUrl?: string | null;
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    promptAssistModel,
    onPromptAssistModelChange,
    promptAssistDeep,
    onPromptAssistDeepChange,
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
    isThinkingSupported,
    isImageGenerationsSupported,
    isMediaEnabled,
    chatPrivacy,
    onChatPrivacyChange,
    enableBlobMedia,
    onEnableBlobMediaChange,
    showStructuredChat,
    onShowStructuredChatChange,
    tipsEnabled,
    onTipsEnabledChange,
    isFigmaInputOpen,
    onToggleFigmaInput,
    chatId,
    activeVersionId,
    onOpenImport,
    onOpenSandbox,
    onDeployProduction,
    onDomainSearch,
    onGoHome,
    onNewChat,
    onSaveProject,
    isDeploying,
    isCreatingChat,
    isAnyStreaming,
    isSavingProject,
    canDeploy,
    canSaveProject,
    deploymentStatus,
    deploymentUrl,
  } = props;

  const isBusy = isAnyStreaming || isCreatingChat;
  const currentModel = MODEL_TIER_OPTIONS.find((m) => m.value === selectedModelTier);
  const modelButtonLabel = currentModel?.label || "AI";
  const scaffoldButtonLabel =
    scaffoldMode === "off"
      ? "Av"
      : scaffoldMode === "auto"
        ? "Auto"
        : getAllScaffolds().find((scaffold) => scaffold.id === scaffoldId)?.label ?? "Välj";
  const assistModelOptions = getPromptAssistModelOptions();
  const hasCustomAssistModel =
    Boolean(promptAssistModel) &&
    !assistModelOptions.some((option) => option.value === promptAssistModel);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = isDefaultCustomInstructions(customInstructions);
  const isAssistOff = promptAssistModel === PROMPT_ASSIST_OFF_VALUE;
  const isGatewayProvider = isGatewayAssistModel(promptAssistModel);
  const isDeepBriefDisabled = isBusy || isAssistOff || !isGatewayProvider || !canUseDeepBrief;
  const assistModelLabel = getPromptAssistModelLabel(promptAssistModel);
  const assistProviderName = (() => {
    const provider = resolvePromptAssistProvider(promptAssistModel);
    if (provider === "v0") return "Model API";
    if (provider === "gateway") return "Gateway";
    if (provider === "anthropic") return "Anthropic";
    return provider;
  })();
  const assistProviderLabel = isAssistOff
    ? "Av"
    : `${assistProviderName}: ${assistModelLabel}`;
  const assistStatusSummary = isAssistOff
    ? "Förbättra: Av"
    : `Förbättra: ${assistProviderLabel}${promptAssistDeep && isGatewayProvider ? " (deep)" : ""}`;
  const runDeferredAction = useCallback((action: () => void) => {
    if (typeof window === "undefined") {
      action();
      return;
    }
    window.requestAnimationFrame(action);
  }, []);
  const { isAuthenticated, logout } = useAuth();
  useEffect(() => {
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
          className="text-xl font-semibold tracking-tight transition-opacity hover:opacity-80"
          aria-label="Gå till startsidan"
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

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isBusy}>
                    <Bot className="h-4 w-4" />
                    <span className="hidden max-w-[220px] truncate sm:inline">
                      Modell: {modelButtonLabel}
                    </span>
                    {promptAssistDeep && isGatewayProvider && !isAssistOff && (
                      <Wand2 className="text-primary h-3 w-3" />
                    )}
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
                      Detta är builderns byggprofiler. Om `V0_FALLBACK_BUILDER=y` och fallback
                      uttryckligen begars används motsvarande v0-modell direkt. Annars mappar samma
                      byggprofil till egen motor som `GPT-4.1`, `GPT-5.3 Codex`, `GPT-5.4` eller
                      `GPT-5.1 Codex Max`. Prompt Assist nedan är separat och används bara för att förbättra prompt,
                      scaffold-val och designbrief innan bygg.
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
            <DropdownMenuLabel className="flex items-center gap-2">
              <span>Förbättra</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground ml-auto flex cursor-help items-center">
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">
                      Den här modellen styr den tyngre förbättringen: deep brief, scaffold-hjälp,
                      designbrief och dynamiska instruktioner före första bygget. Den snabba knappen
                      `Skriv om prompt` använder i stället en lättare polish-modell bara för texten i
                      inmatningsrutan.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={promptAssistModel}
              onValueChange={(v) => onPromptAssistModelChange(v)}
            >
              {assistModelOptions.map((option, idx) => {
                const isOff = option.value === PROMPT_ASSIST_OFF_VALUE;
                const nextOption = assistModelOptions[idx + 1];
                const needsSeparator = isOff && nextOption && nextOption.value !== PROMPT_ASSIST_OFF_VALUE;
                return (
                  <span key={option.value}>
                    <DropdownMenuRadioItem value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                    {needsSeparator && <DropdownMenuSeparator />}
                  </span>
                );
              })}
              {hasCustomAssistModel && (
                <DropdownMenuRadioItem value={promptAssistModel}>
                  Custom: {promptAssistModel}
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuCheckboxItem
                      checked={promptAssistDeep}
                      onCheckedChange={onPromptAssistDeepChange}
                      disabled={isDeepBriefDisabled}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Deep Brief Mode
                      {!canUseDeepBrief && (
                        <span className="text-muted-foreground ml-2 text-xs">(endast ny chat)</span>
                      )}
                      <HelpCircle className="text-muted-foreground ml-1 h-3 w-3" />
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    AI skapar först en detaljerad brief (specifikation) som sedan används för att
                    bygga en bättre prompt. Tar längre tid men ger mer genomtänkta resultat. Används
                    bara vid första prompten i en ny chat. (Endast AI Gateway stödjer Deep Brief.)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isBusy}>
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
              {getAllScaffolds().map((scaffold) => (
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
            <Button variant="outline" size="sm" disabled={isBusy}>
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Generation Options</DropdownMenuLabel>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuCheckboxItem
                      checked={enableThinking}
                      onCheckedChange={onEnableThinkingChange}
                      disabled={isBusy || !isThinkingSupported}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Thinking
                      {!isThinkingSupported && (
                        <span className="text-muted-foreground ml-2 text-xs">(ej tillgängligt)</span>
                      )}
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Aktiverar mer resonemang i AI-svaret. Ger högre kvalitet men kan ta längre tid.
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
                      disabled={!isImageGenerationsSupported || isBusy}
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
                    Slå på för att be AI om bilder. Om Blob saknas kan bilder utebli i preview.
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
                      disabled={isBusy}
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
                    Kopierar externa bild-URL:er till Vercel Blob vid deploy. Stäng av om du vill
                    köra med externa länkar.
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
                      disabled={isBusy}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      Publik preview
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Gör demo-sidan tillgänglig via URL (unlisted). Krävs för att inspektionsläget ska
                    fungera. Privata sidor kan inte proxas.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Prompt Input</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                onToggleFigmaInput();
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {isFigmaInputOpen ? "Dölj Figma-länk" : "Visa Figma-länk"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Instructions</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                setIsInstructionsOpen(true);
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Custom Instructions
              {hasCustomInstructions && (
                <span className="text-muted-foreground ml-2 text-xs">Aktiv</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Chat View</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showStructuredChat}
              onCheckedChange={onShowStructuredChatChange}
              disabled={isBusy}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Debug-läge (verktygsblock)
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={tipsEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => onTipsEnabledChange(!tipsEnabled)}
          title={`AI-tips ${tipsEnabled ? "på" : "av"} (2 credits per tips)`}
        >
          <Lightbulb className="h-4 w-4" />
          <span className="hidden sm:inline">{tipsEnabled ? "Tips: På" : "Tips: Av"}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => runDeferredAction(onOpenImport)}
          disabled={isBusy}
          title="Import from GitHub or ZIP"
        >
          <FolderGit2 className="h-4 w-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => runDeferredAction(onOpenSandbox)}
          disabled={isBusy}
          title="Run in Vercel Sandbox"
        >
          <TerminalSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Sandbox</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => runDeferredAction(onNewChat)}
          disabled={isBusy}
          title="Start a new chat"
        >
          {isCreatingChat ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">New</span>
        </Button>

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

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (chatId && activeVersionId) {
              window.open(
                `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(activeVersionId)}/download?format=zip`,
                "_blank",
              );
            }
          }}
          disabled={!chatId || !activeVersionId || isBusy}
          title="Ladda ner projekt som ZIP"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Ladda ner</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => runDeferredAction(onDomainSearch)}
          disabled={!canDeploy || isBusy}
          title="Sök & köp domän"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">Domän</span>
        </Button>

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
            onClick={() => window.open(deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`, "_blank")}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Publicerad</span>
          </Button>
        ) : (
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
        )}
      </div>

      <Dialog open={isInstructionsOpen} onOpenChange={setIsInstructionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom Instructions</DialogTitle>
            <DialogDescription>
              Instruktioner används när en ny chat startas. Du kan välja att rensa dem efter nästa
              generation.
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
              <Button onClick={() => setIsInstructionsOpen(false)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
