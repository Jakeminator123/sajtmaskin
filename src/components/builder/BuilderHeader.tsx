"use client";

import type { PromptAssistProvider } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import { MODEL_TIER_OPTIONS, PROMPT_ASSIST_PROVIDER_OPTIONS } from "@/lib/builder/defaults";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;

  promptAssistProvider: PromptAssistProvider;
  onPromptAssistProviderChange: (provider: PromptAssistProvider) => void;
  promptAssistModel: string;
  onPromptAssistModelChange: (model: string) => void;
  promptAssistDeep: boolean;
  onPromptAssistDeepChange: (deep: boolean) => void;

  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (v: boolean) => void;

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
    enableImageGenerations,
    onEnableImageGenerationsChange,
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
  const showLegacyVercel =
    promptAssistProvider === "vercel" &&
    !PROMPT_ASSIST_PROVIDER_OPTIONS.some((option) => option.value === "vercel");

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
            <DropdownMenuLabel>Model Tier</DropdownMenuLabel>
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
            <DropdownMenuLabel>Prompt Assist</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={promptAssistProvider}
              onValueChange={(v) => onPromptAssistProviderChange(v as PromptAssistProvider)}
            >
              {showLegacyVercel && (
                <DropdownMenuRadioItem value="vercel">
                  v0 Model API
                  <span className="text-muted-foreground ml-2 text-xs">Legacy</span>
                </DropdownMenuRadioItem>
              )}
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
                <div className="px-2 py-2">
                  <label className="text-muted-foreground mb-1 block text-xs">Assist Model</label>
                  <Input
                    value={promptAssistModel}
                    onChange={(e) => onPromptAssistModelChange(e.target.value)}
                    placeholder={
                      promptAssistProvider === "gateway"
                        ? "openai/gpt-5"
                        : promptAssistProvider === "openai"
                          ? "gpt-5"
                          : promptAssistProvider === "anthropic"
                            ? "claude-..."
                            : promptAssistProvider === "vercel"
                              ? "v0-1.5-md"
                              : "openai/gpt-5"
                    }
                    className="h-8 text-sm"
                    disabled={isBusy}
                  />
                </div>
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
              disabled={isBusy}
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
              <DropdownMenuRadioItem value="blob">Vercel Blob</DropdownMenuRadioItem>
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
    </header>
  );
}
