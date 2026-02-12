"use client";

import { isGatewayAssistModel } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  EXPERIMENTAL_MODEL_ID_OPTIONS,
  MODEL_TIER_OPTIONS,
  getPromptAssistModelOptions,
} from "@/lib/builder/defaults";
import { Button } from "@/components/ui/button";
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
  Loader2,
  MessageSquare,
  Plus,
  Globe,
  Rocket,
  Save,
  Settings2,
  Wand2,
  TerminalSquare,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useId, useState } from "react";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;
  allowExperimentalModelId: boolean;
  customModelId: string;
  onCustomModelIdChange: (modelId: string) => void;

  promptAssistModel: string;
  onPromptAssistModelChange: (model: string) => void;
  promptAssistDeep: boolean;
  onPromptAssistDeepChange: (deep: boolean) => void;
  canUseDeepBrief: boolean;

  customInstructions: string;
  onCustomInstructionsChange: (value: string) => void;
  applyInstructionsOnce: boolean;
  onApplyInstructionsOnceChange: (value: boolean) => void;
  planModeFirstPrompt: boolean;
  onPlanModeFirstPromptChange: (value: boolean) => void;

  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (v: boolean) => void;
  enableThinking: boolean;
  onEnableThinkingChange: (v: boolean) => void;
  isThinkingSupported: boolean;
  isImageGenerationsSupported: boolean;
  isMediaEnabled: boolean;
  enableBlobMedia: boolean;
  onEnableBlobMediaChange: (v: boolean) => void;

  showStructuredChat: boolean;
  onShowStructuredChatChange: (v: boolean) => void;

  chatId: string | null;
  activeVersionId: string | null;

  onOpenImport: () => void;
  onOpenSandbox: () => void;
  onDeployProduction: () => void;
  onDomainSearch: () => void;
  onNewChat: () => void;
  onSaveProject: () => void;

  isDeploying: boolean;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  isSavingProject: boolean;
  canDeploy: boolean;
  canSaveProject: boolean;
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    allowExperimentalModelId,
    customModelId,
    onCustomModelIdChange,
    promptAssistModel,
    onPromptAssistModelChange,
    promptAssistDeep,
    onPromptAssistDeepChange,
    canUseDeepBrief,
    customInstructions,
    onCustomInstructionsChange,
    applyInstructionsOnce,
    onApplyInstructionsOnceChange,
    planModeFirstPrompt,
    onPlanModeFirstPromptChange,
    enableImageGenerations,
    onEnableImageGenerationsChange,
    enableThinking,
    onEnableThinkingChange,
    isThinkingSupported,
    isImageGenerationsSupported,
    isMediaEnabled,
    enableBlobMedia,
    onEnableBlobMediaChange,
    showStructuredChat,
    onShowStructuredChatChange,
    chatId,
    activeVersionId,
    onOpenImport,
    onOpenSandbox,
    onDeployProduction,
    onDomainSearch,
    onNewChat,
    onSaveProject,
    isDeploying,
    isCreatingChat,
    isAnyStreaming,
    isSavingProject,
    canDeploy,
    canSaveProject,
  } = props;

  const isBusy = isAnyStreaming || isCreatingChat;
  const currentModel = MODEL_TIER_OPTIONS.find((m) => m.value === selectedModelTier);
  const normalizedCustomModelId = customModelId.trim();
  const activeModelLabel =
    allowExperimentalModelId && normalizedCustomModelId
      ? normalizedCustomModelId
      : currentModel?.label || "AI";
  const modelButtonLabel = activeModelLabel;
  const assistModelOptions = getPromptAssistModelOptions();
  const hasCustomAssistModel =
    Boolean(promptAssistModel) &&
    !assistModelOptions.some((option) => option.value === promptAssistModel);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = customInstructions.trim() === DEFAULT_CUSTOM_INSTRUCTIONS.trim();
  const isGatewayProvider = isGatewayAssistModel(promptAssistModel);
  const isDeepBriefDisabled = isBusy || !isGatewayProvider || !canUseDeepBrief;

  useEffect(() => {
    const handleDialogClose = () => setIsInstructionsOpen(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  return (
    <header className="border-border bg-background flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Sajtmaskin</h1>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isBusy}>
              <Bot className="h-4 w-4" />
              <span className="hidden max-w-[180px] truncate sm:inline">{modelButtonLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2">
              <span>Model Tier</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground ml-auto flex cursor-help items-center">
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">
                      Model Tier styr v0 Platform API (v0-mini/pro/max) som bygger sajten och
                      preview. Prompt Assist Model är en separat AI-modell som bara förbättrar
                      prompten innan v0 kör.
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

            {allowExperimentalModelId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Experimentellt v0 modelId
                </DropdownMenuLabel>
                {EXPERIMENTAL_MODEL_ID_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    disabled={isBusy}
                    onSelect={(event) => {
                      event.preventDefault();
                      onCustomModelIdChange(option.value);
                    }}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  disabled={isBusy}
                  onSelect={(event) => {
                    event.preventDefault();
                    const suggested = normalizedCustomModelId || "opus-4.6-fast";
                    const next = window.prompt("Ange custom v0 modelId:", suggested);
                    if (next === null) return;
                    onCustomModelIdChange(next.trim());
                  }}
                >
                  Skriv in modelId manuellt...
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isBusy || !normalizedCustomModelId}
                  onSelect={(event) => {
                    event.preventDefault();
                    onCustomModelIdChange("");
                  }}
                >
                  Återställ till tier-val
                </DropdownMenuItem>
                {normalizedCustomModelId ? (
                  <div className="text-muted-foreground px-2 pb-1 text-[11px]">
                    Aktivt modelId: <span className="font-mono">{normalizedCustomModelId}</span>
                  </div>
                ) : null}
              </>
            )}

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
                      Rättar stavning/tydlighet i prompten med minimal omskrivning. Behåller språk
                      om du inte uttryckligen ber om engelska. Själva bygget styrs av Model Tier
                      (v0-mini/pro/max).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={promptAssistModel}
              onValueChange={(v) => onPromptAssistModelChange(v)}
            >
              {assistModelOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
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
                        <span className="text-muted-foreground ml-2 text-xs">(ej för mini)</span>
                      )}
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Aktiverar mer resonemang i v0-svaret. Ger högre kvalitet men kan ta längre tid.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuCheckboxItem
                      checked={planModeFirstPrompt}
                      onCheckedChange={onPlanModeFirstPromptChange}
                      disabled={isBusy}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Plan-läge (första prompten)
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Lägger till plan-instruktion till v0 endast vid första prompten i ny chat.
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
                        <span className="text-muted-foreground ml-2 text-xs">(v0 av)</span>
                      )}
                      {isImageGenerationsSupported && !isMediaEnabled && (
                        <span className="text-muted-foreground ml-2 text-xs">(blob saknas)</span>
                      )}
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Slå på för att be v0 om bilder. Om Blob saknas kan bilder utebli i preview.
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
          variant="outline"
          size="sm"
          onClick={onOpenImport}
          disabled={isBusy}
          title="Import from GitHub or ZIP"
        >
          <FolderGit2 className="h-4 w-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSandbox}
          disabled={isBusy}
          title="Run in Vercel Sandbox"
        >
          <TerminalSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Sandbox</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
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
          onClick={onSaveProject}
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
          onClick={onDomainSearch}
          disabled={!canDeploy || isBusy}
          title="Sök & köp domän"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">Domän</span>
        </Button>

        <Button
          size="sm"
          onClick={onDeployProduction}
          disabled={!canDeploy || isBusy || isDeploying}
        >
          {isDeploying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Publicera</span>
        </Button>
      </div>

      <Dialog open={isInstructionsOpen}>
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
            <label className="border-border bg-muted/40 flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                id={applyOnceId}
                name="applyInstructionsOnce"
                type="checkbox"
                checked={applyInstructionsOnce}
                onChange={(event) => onApplyInstructionsOnceChange(event.target.checked)}
                className="text-brand-blue mt-1 rounded border-gray-300"
                disabled={isBusy}
              />
              <span>
                <span className="font-medium">Gäller endast nästa generation</span>
                <span className="text-muted-foreground block text-xs">
                  Efter att versionen skapats rensas instruktionerna automatiskt.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onCustomInstructionsChange(DEFAULT_CUSTOM_INSTRUCTIONS)}
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
