'use client';

import type { PromptAssistProvider } from '@/lib/builder/promptAssist';
import type { ModelTier } from '@/lib/validations/chatSchemas';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Bot,
  ChevronDown,
  FolderGit2,
  ImageIcon,
  Loader2,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';

const MODEL_OPTIONS: {
  value: ModelTier;
  label: string;
  description: string;
}[] = [
    {
      value: 'v0-mini',
      label: 'Light',
      description: 'Fast & cost-efficient',
    },
    {
      value: 'v0-pro',
      label: 'Pro',
      description: 'Balanced',
    },
    {
      value: 'v0-max',
      label: 'Max',
      description: 'Best quality',
    },
  ];

const PROMPT_ASSIST_OPTIONS: {
  value: PromptAssistProvider;
  label: string;
}[] = [
    { value: 'off', label: 'Off' },
    { value: 'gateway', label: 'AI Gateway' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Claude' },
  ];

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;

  promptAssistProvider: PromptAssistProvider;
  onPromptAssistProviderChange: (provider: PromptAssistProvider) => void;
  promptAssistModel: string;
  onPromptAssistModelChange: (model: string) => void;
  promptAssistDeep: boolean;
  onPromptAssistDeepChange: (deep: boolean) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;

  enableImageGenerations: boolean;
  onEnableImageGenerationsChange: (v: boolean) => void;

  designSystemMode: boolean;
  onDesignSystemModeChange: (v: boolean) => void;

  deployImageStrategy: 'external' | 'blob';
  onDeployImageStrategyChange: (s: 'external' | 'blob') => void;

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
    systemPrompt,
    onSystemPromptChange,
    enableImageGenerations,
    onEnableImageGenerationsChange,
    designSystemMode,
    onDesignSystemModeChange,
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
  const currentModel = MODEL_OPTIONS.find((m) => m.value === selectedModelTier);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Sajtmaskin</h1>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isBusy}>
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">{currentModel?.label || 'AI'}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Model Tier</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedModelTier}
              onValueChange={(v) => onSelectedModelTierChange(v as ModelTier)}
            >
              {MODEL_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <span className="font-medium">{option.label}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{option.description}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Prompt Assist</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={promptAssistProvider}
              onValueChange={(v) => onPromptAssistProviderChange(v as PromptAssistProvider)}
            >
              {PROMPT_ASSIST_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            {promptAssistProvider !== 'off' && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Assist Model</label>
                  <Input
                    value={promptAssistModel}
                    onChange={(e) => onPromptAssistModelChange(e.target.value)}
                    placeholder={
                      promptAssistProvider === 'gateway'
                        ? 'openai/gpt-5'
                        : promptAssistProvider === 'openai'
                          ? 'gpt-5'
                          : 'claude-...'
                    }
                    className="h-8 text-sm"
                    disabled={isBusy}
                  />
                </div>
                <DropdownMenuCheckboxItem
                  checked={promptAssistDeep}
                  onCheckedChange={onPromptAssistDeepChange}
                  disabled={isBusy}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Deep Brief Mode
                </DropdownMenuCheckboxItem>
              </>
            )}

            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                Preprompt (system)
              </label>
              <Input
                value={systemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                placeholder="Valfri systemprompt för v0-generering"
                className="h-8 text-sm"
                disabled={isBusy}
              />
            </div>
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
              <ImageIcon className="h-4 w-4 mr-2" />
              Enable AI Images
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              checked={designSystemMode}
              onCheckedChange={onDesignSystemModeChange}
              disabled={isBusy}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Design System Mode
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Deploy Image Strategy</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={deployImageStrategy}
              onValueChange={(v) => onDeployImageStrategyChange(v as 'external' | 'blob')}
            >
              <DropdownMenuRadioItem value="external">
                External URLs
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="blob">
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
          {isDeploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          <span className="hidden sm:inline">Deploy</span>
        </Button>
      </div>
    </header>
  );
}
