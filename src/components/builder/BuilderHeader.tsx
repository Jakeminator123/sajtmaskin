"use client";

import type { PromptAssistProvider } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  MODEL_TIER_OPTIONS,
  PROMPT_ASSIST_PROVIDER_OPTIONS,
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
  FolderGit2,
  HelpCircle,
  ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;

  promptAssistProvider: PromptAssistProvider;
  onPromptAssistProviderChange: (provider: PromptAssistProvider) => void;
  promptAssistModel: string;
  onPromptAssistModelChange: (model: string) => void;
  promptAssistDeep: boolean;
  onPromptAssistDeepChange: (deep: boolean) => void;

  customInstructions: string;
  onCustomInstructionsChange: (value: string) => void;

  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (v: boolean) => void;
  imageGenerationsSupported?: boolean;
  blobSupported?: boolean;

  designSystemMode: boolean;
  onDesignSystemModeChange: (v: boolean) => void;

  showStructuredChat: boolean;
  onShowStructuredChatChange: (v: boolean) => void;

  deployImageStrategy: "external" | "blob";
  onDeployImageStrategyChange: (s: "external" | "blob") => void;

  onOpenImport: () => void;
  onOpenSandbox: () => void;
  onDeployProduction: () => void;
  onNewChat: () => void;

  isDeploying: boolean;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  canDeploy: boolean;
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    promptAssistProvider,
    onPromptAssistProviderChange,
    promptAssistModel,
    onPromptAssistModelChange,
    promptAssistDeep,
    onPromptAssistDeepChange,
    customInstructions,
    onCustomInstructionsChange,
    enableImageGenerations,
    onEnableImageGenerationsChange,
    imageGenerationsSupported = true,
    blobSupported = false,
    designSystemMode,
    onDesignSystemModeChange,
    showStructuredChat,
    onShowStructuredChatChange,
    deployImageStrategy,
    onDeployImageStrategyChange,
    onOpenImport,
    onOpenSandbox,
    onDeployProduction,
    onNewChat,
    isDeploying,
    isCreatingChat,
    isAnyStreaming,
    canDeploy,
  } = props;

  const isBusy = isAnyStreaming || isCreatingChat;
  const currentModel = MODEL_TIER_OPTIONS.find((m) => m.value === selectedModelTier);
  const assistModelOptions = getPromptAssistModelOptions(promptAssistProvider);
  const hasCustomAssistModel =
    promptAssistProvider !== "off" &&
    promptAssistModel &&
    !assistModelOptions.some((option) => option.value === promptAssistModel);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions =
    customInstructions.trim() === DEFAULT_CUSTOM_INSTRUCTIONS.trim();

  useEffect(() => {
    const handleDialogClose = () => setIsInstructionsOpen(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  return (
    <header className="border-border bg-background flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Sajtmaskin</h1>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isBusy}>
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">{currentModel?.label || "AI"}</span>
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

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2">
              <span>Prompt Assist</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground ml-auto flex cursor-help items-center">
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">
                      Prompt Assist skriver om din prompt via AI Gateway innan v0 kör.
                      Av skickar prompten direkt utan omskrivning.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={promptAssistProvider}
              onValueChange={(v) => onPromptAssistProviderChange(v as PromptAssistProvider)}
            >
              {PROMPT_ASSIST_PROVIDER_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                  {option.description && (
                    <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            {promptAssistProvider !== "off" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <span>Assist Model</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground ml-auto flex cursor-help items-center">
                          <HelpCircle className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="text-xs">
                          Modellen här används bara för att förbättra prompten.
                          Själva bygget styrs av Model Tier (v0-mini/pro/max).
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
                          disabled={isBusy}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Deep Brief Mode
                          <HelpCircle className="text-muted-foreground ml-1 h-3 w-3" />
                        </DropdownMenuCheckboxItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        AI skapar först en detaljerad brief (specifikation) som sedan används för
                        att bygga en bättre prompt. Tar längre tid men ger mer genomtänkta resultat.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
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
            <DropdownMenuCheckboxItem
              checked={enableImageGenerations}
              onCheckedChange={onEnableImageGenerationsChange}
              disabled={isBusy || !imageGenerationsSupported}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              Enable AI Images
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              checked={designSystemMode}
              onCheckedChange={onDesignSystemModeChange}
              disabled={isBusy}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Design System Mode
            </DropdownMenuCheckboxItem>

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

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Deploy Image Strategy</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={deployImageStrategy}
              onValueChange={(v) => onDeployImageStrategyChange(v as "external" | "blob")}
            >
              <DropdownMenuRadioItem value="external">External URLs</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="blob" disabled={!blobSupported}>
                Vercel Blob
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
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
          size="sm"
          onClick={onDeployProduction}
          disabled={!canDeploy || isBusy || isDeploying}
        >
          {isDeploying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Deploy</span>
        </Button>
      </div>

      <Dialog open={isInstructionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom Instructions</DialogTitle>
            <DialogDescription>
              Gäller för denna chatten. Ändringar efter start kräver ny chat.
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
