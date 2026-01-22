'use client';

import type { PromptAssistProvider } from '@/lib/builder/promptAssist';
import type { ModelTier } from '@/lib/validations/chatSchemas';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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

const V0_MODEL_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: 'v0-1.5-md',
    label: 'v0-1.5-md',
    description: 'Balanced',
  },
  {
    value: 'v0-1.5-lg',
    label: 'v0-1.5-lg',
    description: 'Best quality',
  },
];

const PROMPT_ASSIST_OPTIONS: {
  value: PromptAssistProvider;
  label: string;
}[] = [
    { value: 'off', label: 'Off' },
  { value: 'vercel', label: 'v0 Model API' },
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
  gatewayModels: string[];
  gatewayModelsStatus: 'idle' | 'loading' | 'ready' | 'error';
  gatewayModelsError: string | null;
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
    gatewayModels,
    gatewayModelsStatus,
    gatewayModelsError,
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
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Assist Model
                  </label>
                  {promptAssistProvider === 'gateway' ? (
                    <div className="rounded-md border border-border bg-background">
                      <Command>
                        <CommandInput
                          value={promptAssistModel}
                          onValueChange={onPromptAssistModelChange}
                          placeholder="Sök eller skriv (t.ex. openai/gpt-5)"
                          className="h-8 text-sm"
                          disabled={isBusy}
                        />
                        <CommandList className="max-h-40">
                          {gatewayModelsStatus === 'loading' && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              Hämtar modeller...
                            </div>
                          )}
                          {gatewayModelsStatus === 'error' && (
                            <div className="px-3 py-2 text-xs text-destructive">
                              {gatewayModelsError || 'Kunde inte hämta modeller'}
                            </div>
                          )}
                          {gatewayModelsStatus !== 'loading' &&
                            gatewayModelsStatus !== 'error' && (
                              <>
                                {gatewayModels.length === 0 ? (
                                  <CommandEmpty>Inga modeller hittades.</CommandEmpty>
                                ) : (
                                  <CommandGroup heading="Modeller">
                                    {gatewayModels.map((modelId) => (
                                      <CommandItem
                                        key={modelId}
                                        value={modelId}
                                        onSelect={() => onPromptAssistModelChange(modelId)}
                                      >
                                        <span className="font-mono text-xs">{modelId}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </>
                            )}
                        </CommandList>
                      </Command>
                    </div>
                  ) : promptAssistProvider === 'vercel' ? (
                    <div className="rounded-md border border-border bg-background">
                      <Command>
                        <CommandInput
                          value={promptAssistModel}
                          onValueChange={onPromptAssistModelChange}
                          placeholder="Sök eller skriv (t.ex. v0-1.5-lg)"
                          className="h-8 text-sm"
                          disabled={isBusy}
                        />
                        <CommandList className="max-h-40">
                          <CommandGroup heading="v0 Model API">
                            {V0_MODEL_OPTIONS.map((option) => (
                              <CommandItem
                                key={option.value}
                                value={option.value}
                                onSelect={() => onPromptAssistModelChange(option.value)}
                              >
                                <span className="font-mono text-xs">{option.label}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {option.description}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandEmpty>Inga standardmodeller.</CommandEmpty>
                        </CommandList>
                      </Command>
                    </div>
                  ) : (
                    <Input
                      value={promptAssistModel}
                      onChange={(e) => onPromptAssistModelChange(e.target.value)}
                      placeholder={
                        promptAssistProvider === 'openai'
                          ? 'gpt-5'
                          : promptAssistProvider === 'anthropic'
                            ? 'claude-...'
                            : 'openai/gpt-5'
                      }
                      className="h-8 text-sm"
                      disabled={isBusy}
                    />
                  )}
                  {promptAssistProvider === 'gateway' && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Du kan skriva fritt för egna modeller.
                    </p>
                  )}
                  {promptAssistProvider === 'vercel' && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      v0-1.5-lg = högsta kvalitet (ofta långsammare/dyrare).
                    </p>
                  )}
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
