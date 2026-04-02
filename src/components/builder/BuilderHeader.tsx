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
  Settings2,
  Sparkles,
  Wand2,
  Wrench,
  TerminalSquare,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { BuilderMode } from "@/components/builder/ModeSelector";
import Image from "next/image";
import { useCallback, useId, useState } from "react";

export function BuilderHeader(props: {
  builderMode?: BuilderMode;
  onModeChange?: (mode: BuilderMode) => void;
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
  isThinkingSupported: boolean;
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
    isThinkingSupported,
    isImageGenerationsSupported,
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
    canManageDomain,
    canSaveProject,
    deploymentStatus,
    deploymentUrl,
    deployDisabledReason,
  } = props;

  const builderMode = props.builderMode ?? "pro";
  const onModeChange = props.onModeChange;
  const isStarter = builderMode === "starter";
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
  const applyOnceId = useId();
  const hasCustomInstructions = Boolean(customInstructions.trim());
  const isDefaultInstructions = isDefaultCustomInstructions(customInstructions);
  const isAssistOff = promptAssistModel === PROMPT_ASSIST_OFF_VALUE;
  const isGatewayProvider = isGatewayAssistModel(promptAssistModel);
  const isDeepBriefDisabled = isBusy || isAssistOff || !isGatewayProvider || !canUseDeepBrief;
  const assistModelLabel = getPromptAssistModelLabel(promptAssistModel);
  const assistProviderName = (() => {
    const provider = resolvePromptAssistProvider(promptAssistModel);
    if (provider === "gateway") return "OpenAI";
    if (provider === "anthropic") return "Anthropic";
    return provider;
  })();
  const assistProviderLabel = isAssistOff
    ? "Av"
    : `${assistProviderName}: ${assistModelLabel}`;
  const runDeferredAction = useCallback((action: () => void) => {
    if (typeof window === "undefined") {
      action();
      return;
    }
    window.requestAnimationFrame(action);
  }, []);
  const { isAuthenticated, logout } = useAuth();
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
            src="/images/sajtmaskin-logo.png"
            alt="Sajtmaskin"
            width={148}
            height={56}
            className="h-7 w-auto object-contain"
            priority
          />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* ── Primary action: Publicera ── */}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    className={canDeploy && !isBusy && !isDeploying ? "animate-subtle-pulse" : ""}
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

        {isStarter && onModeChange && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onModeChange("pro")}
                  aria-label="Byt till Pro"
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Pro</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Visa Pro-verktyg</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {!isStarter && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isBusy} aria-label="Meny">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-h-[80vh] overflow-y-auto">
            {/* ── Generera ── */}
            <DropdownMenuLabel>Generera</DropdownMenuLabel>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Modell: {modelButtonLabel}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedModelTier}
              onValueChange={(v) => onSelectedModelTierChange(v as ModelTier)}
            >
              {MODEL_TIER_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <span className="font-medium">{option.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground mt-1">Brief: {assistProviderLabel}</DropdownMenuLabel>
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
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                onApplyAnthropicComparePreset();
              }}
            >
              <Bot className="mr-2 h-4 w-4" />
              Anthropic-jämförelse
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={enableThinking}
              onCheckedChange={onEnableThinkingChange}
              disabled={isBusy || !isThinkingSupported}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Resonemang
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={enableImageGenerations}
              onCheckedChange={onEnableImageGenerationsChange}
              disabled={!isImageGenerationsSupported || isBusy}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              AI-bilder
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={enableAutofix}
              onCheckedChange={onEnableAutofixChange}
              disabled={isBusy}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Autofix
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            {/* ── Struktur ── */}
            <DropdownMenuLabel>Struktur</DropdownMenuLabel>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Mall: {scaffoldButtonLabel}</DropdownMenuLabel>
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
              {getAllScaffolds().map((scaffold) => (
                <DropdownMenuRadioItem
                  key={scaffold.id}
                  value={`manual:${scaffold.id}`}
                >
                  <span className="font-medium">{scaffold.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{scaffold.description}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem disabled={isBusy} onSelect={(e) => { e.preventDefault(); setIsInstructionsOpen(true); }}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Instruktioner{hasCustomInstructions ? " (aktiv)" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isBusy} onSelect={(e) => { e.preventDefault(); onToggleFigmaInput(); }}>
              <Link2 className="mr-2 h-4 w-4" />
              {isFigmaInputOpen ? "Dölj Figma-länk" : "Figma-länk"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isBusy} onSelect={(e) => { e.preventDefault(); runDeferredAction(onOpenImport); }}>
              <FolderGit2 className="mr-2 h-4 w-4" />
              Importera
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* ── Publicera ── */}
            <DropdownMenuLabel>Publicera</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={enableBlobMedia}
              onCheckedChange={onEnableBlobMediaChange}
              disabled={isBusy}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              Blob-bilder
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={chatPrivacy === "unlisted"}
              onCheckedChange={(checked) => onChatPrivacyChange(checked ? "unlisted" : "private")}
              disabled={isBusy}
            >
              <Globe className="mr-2 h-4 w-4" />
              Publik preview
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled={!canManageDomain || isBusy} onSelect={(e) => { e.preventDefault(); runDeferredAction(onDomainSearch); }}>
              <Globe className="mr-2 h-4 w-4" />
              Domän
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isBusy} onSelect={(e) => { e.preventDefault(); runDeferredAction(onOpenSandbox); }}>
              <TerminalSquare className="mr-2 h-4 w-4" />
              Sandbox
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!chatId || !activeVersionId || isBusy}
              onSelect={(e) => {
                e.preventDefault();
                if (chatId && activeVersionId) {
                  window.open(
                    `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(activeVersionId)}/download?format=zip`,
                    "_blank",
                  );
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Ladda ner ZIP
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* ── Övrigt ── */}
            <DropdownMenuCheckboxItem
              checked={showStructuredChat}
              onCheckedChange={onShowStructuredChatChange}
              disabled={isBusy}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Felsökningsvy
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={tipsEnabled}
              onCheckedChange={(checked) => onTipsEnabledChange(Boolean(checked))}
              disabled={isBusy}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Tips efter AI-svar
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled={isBusy} onSelect={(e) => { e.preventDefault(); runDeferredAction(onNewChat); }}>
              <Plus className="mr-2 h-4 w-4" />
              Ny chat
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canSaveProject || isBusy || isSavingProject} onSelect={(e) => { e.preventDefault(); runDeferredAction(() => { void onSaveProject(); }); }}>
              <Save className="mr-2 h-4 w-4" />
              Spara
            </DropdownMenuItem>
            {onModeChange && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onModeChange("starter"); }}>
                <Sparkles className="mr-2 h-4 w-4" />
                Byt till Amatör
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {isAuthenticated && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} title="Logga ut" aria-label="Logga ut">
            <LogOut className="h-4 w-4" />
          </Button>
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
