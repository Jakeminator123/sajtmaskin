"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { isOpenAIAssistModel, resolvePromptAssistProvider } from "@/lib/builder/promptAssist";
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
  Download,
  FolderGit2,
  Image as ImageIcon,
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

  Settings,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useId, useState } from "react";

export function BuilderHeader(props: {
  selectedModelTier: ModelTier;
  onSelectedModelTierChange: (tier: ModelTier) => void;
  onApplyAnthropicComparePreset: () => void;

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
  /** Short label for current phase or project id (wizard / needs analysis / session). */
  projectLabel?: string | null;

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
}) {
  const {
    selectedModelTier,
    onSelectedModelTierChange,
    onApplyAnthropicComparePreset,
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
    projectLabel,
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
  const assistModelOptions = getPromptAssistModelOptions();
  const hasCustomAssistModel =
    Boolean(promptAssistModel) &&
    !assistModelOptions.some((option) => option.value === promptAssistModel);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = isDefaultCustomInstructions(customInstructions);
  const isAssistOff = promptAssistModel === PROMPT_ASSIST_OFF_VALUE;
  const isOpenAIProvider = isOpenAIAssistModel(promptAssistModel);
  const isDeepBriefDisabled = isConfigLocked || isAssistOff || !isOpenAIProvider || !canUseDeepBrief;
  const assistModelLabel = getPromptAssistModelLabel(promptAssistModel);
  const assistProviderName = (() => {
    const provider = resolvePromptAssistProvider(promptAssistModel);
    if (provider === "openai") return "OpenAI";
    if (provider === "anthropic") return "Anthropic";
    return provider;
  })();
  const assistProviderLabel = isAssistOff
    ? "Av"
    : `${assistProviderName}: ${assistModelLabel}`;
  const assistStatusSummary = isAssistOff
    ? "Förbättra: av"
    : `Förbättra: ${assistProviderLabel}${promptAssistDeep && isOpenAIProvider ? " (djup brief)" : ""}`;
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
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/85 flex h-10 shrink-0 items-center justify-between gap-1.5 border-b px-2.5 backdrop-blur-sm motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200 sm:gap-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <div className="flex min-w-0 items-baseline gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={onGoHome}
            className="text-foreground shrink-0 text-sm font-semibold tracking-tight motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out hover:opacity-80"
            aria-label="Gå till startsidan"
            title="Till startsidan"
          >
            Sajtmaskin
          </button>
          {projectLabel ? (
            <>
              <span className="text-muted-foreground/70 hidden shrink-0 sm:inline" aria-hidden>
                ·
              </span>
              <span
                className="text-muted-foreground min-w-0 truncate text-xs font-medium tracking-tight sm:text-sm"
                title={projectLabel}
              >
                {projectLabel}
              </span>
            </>
          ) : null}
        </div>
        {hasMounted && isAuthenticated && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={handleLogout}
            title="Logga ut"
            aria-label="Logga ut"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="relative flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
        <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Meny">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="border-border max-h-[min(70vh,32rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto rounded-xl"
          >
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={() => runDeferredAction(onNewChat)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Ny chat
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canSaveProject || isBusy || isSavingProject}
              onSelect={() => runDeferredAction(() => { void onSaveProject(); })}
            >
              <Save className="mr-2 h-4 w-4" />
              Spara
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canManageDomain || isBusy}
              onSelect={() => runDeferredAction(onDomainSearch)}
            >
              <Globe className="mr-2 h-4 w-4" />
              Domän
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                runDeferredAction(onOpenImport);
              }}
            >
              <FolderGit2 className="mr-2 h-4 w-4" />
              Importera
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
              Ladda ner ZIP
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Byggmodell</DropdownMenuLabel>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Settings className="mr-2 h-4 w-4" />
                Avancerat
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[min(60vh,28rem)] w-[min(100vw-2rem,20rem)] overflow-y-auto">
            <DropdownMenuLabel>Promptverktyg</DropdownMenuLabel>
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
                  Anpassad: {promptAssistModel}
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
                    <DropdownMenuCheckboxItem
                      checked={promptAssistDeep}
                      onCheckedChange={onPromptAssistDeepChange}
                      disabled={isDeepBriefDisabled}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Djup brief
                      {!canUseDeepBrief && (
                        <span className="text-muted-foreground ml-2 text-xs">(ny chat)</span>
                      )}
                    </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isConfigLocked}
              onSelect={(event) => {
                event.preventDefault();
                onApplyAnthropicComparePreset();
              }}
            >
              <Bot className="mr-2 h-4 w-4" />
              Anthropic-jämförelse
            </DropdownMenuItem>

            <DropdownMenuSeparator />
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

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Generering</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={enableThinking}
                      onCheckedChange={onEnableThinkingChange}
                      disabled={isConfigLocked}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Resonemang
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={enableImageGenerations}
                      onCheckedChange={onEnableImageGenerationsChange}
                      disabled={!isImageGenerationsSupported || isConfigLocked}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      AI-bilder
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={enableBlobMedia}
                      onCheckedChange={onEnableBlobMediaChange}
                      disabled={isConfigLocked}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Blob-bilder
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={enableAutofix}
                      onCheckedChange={onEnableAutofixChange}
                      disabled={isConfigLocked}
                    >
                      <Wrench className="mr-2 h-4 w-4" />
                      Autofix
                    </DropdownMenuCheckboxItem>
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

            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isConfigLocked}
              onSelect={(event) => {
                event.preventDefault();
                onToggleFigmaInput();
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {isFigmaInputOpen ? "Dölj Figma" : "Figma-länk"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isConfigLocked}
              onSelect={(event) => {
                event.preventDefault();
                setIsInstructionsOpen(true);
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Instruktioner
              {hasCustomInstructions && (
                <span className="text-muted-foreground ml-2 text-xs">Aktiv</span>
              )}
            </DropdownMenuItem>

            {showDebugViewToggle && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showStructuredChat}
                  onCheckedChange={onShowStructuredChatChange}
                  disabled={isConfigLocked}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Debug-vy
                </DropdownMenuCheckboxItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={tipsEnabled}
              onCheckedChange={(checked) => onTipsEnabledChange(Boolean(checked))}
              disabled={isConfigLocked}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Tips efter svar
            </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {isBusy ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => runDeferredAction(onCancelGeneration)}
            title="Avbryt"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Avbryt</span>
          </Button>
        ) : null}

        {deploymentStatus === "building" ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Bygger...</span>
          </Button>
        ) : deploymentStatus === "ready" && deploymentUrl ? (
          <Button
            size="sm"
            variant="outline"
            className="border-primary/40 text-primary hover:bg-accent hover:text-accent-foreground"
            onClick={() => window.open(deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`, "_blank")}
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
