"use client";

import {
  ChatInterface,
  type VisualPlacementDecision,
  type VisualPlacementRequest,
} from "@/components/builder/ChatInterface";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { MessageList } from "@/components/builder/MessageList";
import { PlacementConfirmDialog } from "@/components/builder/PlacementConfirmDialog";
import { PreviewPanel } from "@/components/builder/PreviewPanel";
import { SandboxModal } from "@/components/builder/SandboxModal";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { ProjectEnvVarsPanel } from "@/components/builder/ProjectEnvVarsPanel";
import { DeployNameDialog } from "@/components/builder/DeployNameDialog";
import { DomainSearchDialog } from "@/components/builder/DomainSearchDialog";
import { DomainManager } from "@/components/builder/DomainManager";
import { ThinkingOverlay } from "@/components/builder/ThinkingOverlay";
import { TipCard } from "@/components/builder/TipCard";
import { RequireAuthModal } from "@/components/auth";
import { useAuthStore } from "@/lib/auth/auth-store";
import { buildAiElementPrompt } from "@/lib/builder/ai-elements-catalog";
import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import {
  buildShadcnBlockPrompt,
  buildShadcnComponentPrompt,
} from "@/lib/shadcn-registry-utils";
import type { ChatMessage } from "@/lib/builder/types";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BuilderLayout } from "./BuilderLayout";
import type { BuilderViewModel } from "./useBuilderPageController";

const CONTEXT_RECENT_MESSAGE_COUNT = 5;
const CONTEXT_MESSAGE_MAX_CHARS = 300;
const TIP_USER_MESSAGE_MAX_CHARS = 500;
const TIP_ASSISTANT_MESSAGE_MAX_CHARS = 900;
const TIP_CODE_MAX_CHARS = 2200;
const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 3000;

type TipApiResponse = {
  success?: boolean;
  tip?: string;
  error?: string;
  cost?: number;
};

type ContextMessage = {
  role: ChatMessage["role"];
  content: string;
};

function toContextMessage(message: ChatMessage, maxChars: number): ContextMessage {
  return {
    role: message.role,
    content:
      typeof message.content === "string" ? message.content.slice(0, maxChars) : "[structured]",
  };
}

function buildRecentContextMessages(messages: ChatMessage[]): ContextMessage[] {
  return messages
    .slice(-CONTEXT_RECENT_MESSAGE_COUNT)
    .map((message) => toContextMessage(message, CONTEXT_MESSAGE_MAX_CHARS));
}

function getLatestCompletedAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      !message.isStreaming &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function getLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function buildCustomizationInstruction(customization: string): string {
  const trimmed = customization.trim();
  if (!trimmed) return "";
  return [
    "",
    "Ytterligare implementeringsinstruktion från användaren:",
    trimmed,
    "Följ instruktionen ovan samtidigt som du håller vald placering exakt.",
  ].join("\n");
}

function buildUiPlacementMessage(
  request: Extract<VisualPlacementRequest, { kind: "ui" }>,
  placement: PlacementSelectEventDetail,
  customization: string,
  existingUiComponents?: string[],
): string {
  const selection = request.selection;
  const technicalPrompt = request.isComponent
    ? buildShadcnComponentPrompt(selection.registryItem, {
        style: selection.style,
        displayName: selection.block.title,
        description: selection.block.description,
        dependencyItems: selection.dependencyItems,
        placement: placement.placement,
        detectedSections: selection.detectedSections,
        existingUiComponents,
      })
    : buildShadcnBlockPrompt(selection.registryItem, {
        style: selection.style,
        displayName: selection.block.title,
        description: selection.block.description,
        dependencyItems: selection.dependencyItems,
        placement: placement.placement,
        detectedSections: selection.detectedSections,
        existingUiComponents,
      });

  const anchorLine = placement.anchorSection
    ? `\n🧭 Ankare: ${placement.anchorSection.label}`
    : "";
  const extraInstruction = buildCustomizationInstruction(customization);

  return `Lägg till UI‑element (${request.isComponent ? "komponent" : "block"}): **${request.itemTitle}**${request.deps}
📍 Placering: ${placement.placementLabel}${anchorLine}

---

${technicalPrompt}${extraInstruction}`;
}

function buildAiPlacementMessage(
  request: Extract<VisualPlacementRequest, { kind: "ai" }>,
  placement: PlacementSelectEventDetail,
  customization: string,
): string {
  const technicalPrompt = buildAiElementPrompt(request.item, {
    placement: placement.placement,
    detectedSections: request.options.detectedSections,
  });
  const anchorLine = placement.anchorSection
    ? `\n🧭 Ankare: ${placement.anchorSection.label}`
    : "";
  const extraInstruction = buildCustomizationInstruction(customization);

  return `Lägg till AI‑element: **${request.item.label}**${request.deps}
📍 Placering: ${placement.placementLabel}${anchorLine}

---

${technicalPrompt}${extraInstruction}`;
}

export function BuilderShellContent(vm: BuilderViewModel) {
  const isBusy = vm.isCreatingChat || vm.isAnyStreaming || vm.isTemplateLoading || vm.isPreparingPrompt;
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [tipPanelOpen, setTipPanelOpen] = useState(false);
  const [tipText, setTipText] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipCost, setTipCost] = useState<number | null>(null);
  const [isTipLoading, setIsTipLoading] = useState(false);
  const previousStreamingRef = useRef(vm.isAnyStreaming);
  const lastAutoTipAssistantIdRef = useRef<string | null>(null);
  const latestTipRequestIdRef = useRef(0);
  const [pendingPlacementRequest, setPendingPlacementRequest] =
    useState<VisualPlacementRequest | null>(null);
  const [placementSelection, setPlacementSelection] =
    useState<PlacementSelectEventDetail | null>(null);
  const [placementConfirmOpen, setPlacementConfirmOpen] = useState(false);
  const [isPlacementSubmitting, setIsPlacementSubmitting] = useState(false);
  const placementResolverRef = useRef<((decision: VisualPlacementDecision) => void) | null>(null);

  const requestTip = useCallback(
    async (assistantMessage: ChatMessage | null) => {
      if (!assistantMessage) {
        setTipText(null);
        setTipCost(null);
        setTipError("Inget AI-svar att hämta tips från ännu.");
        setTipPanelOpen(true);
        return;
      }

      const tipRequestId = latestTipRequestIdRef.current + 1;
      latestTipRequestIdRef.current = tipRequestId;
      setIsTipLoading(true);
      setTipError(null);
      try {
        const latestUser = getLatestUserMessage(vm.messages);
        const res = await fetch("/api/openclaw/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              page: "builder",
              projectId: vm.appProjectId,
              chatId: vm.chatId,
              activeVersionId: vm.activeVersionId,
              demoUrl: vm.currentDemoUrl,
              recentMessages: buildRecentContextMessages(vm.messages),
              latestUserMessage: latestUser?.content?.slice(0, TIP_USER_MESSAGE_MAX_CHARS) || "",
              latestAssistantMessage: assistantMessage.content.slice(
                0,
                TIP_ASSISTANT_MESSAGE_MAX_CHARS,
              ),
              currentCode: vm.currentPageCode?.slice(0, TIP_CODE_MAX_CHARS) || "",
            },
          }),
        });

        const data = (await res.json().catch(() => null)) as TipApiResponse | null;
        if (latestTipRequestIdRef.current !== tipRequestId) return;

        if (!res.ok || !data?.success || typeof data.tip !== "string") {
          const message = data?.error || "Kunde inte hämta tips just nu.";
          setTipText(null);
          setTipCost(null);
          setTipError(message);
          setTipPanelOpen(true);
          return;
        }

        const trimmedTip = data.tip.trim();
        if (!trimmedTip) {
          setTipText(null);
          setTipCost(null);
          setTipError("Kunde inte hämta tips just nu.");
          setTipPanelOpen(true);
          return;
        }

        setTipText(trimmedTip);
        setTipCost(typeof data.cost === "number" ? data.cost : 2);
        setTipError(null);
        setTipPanelOpen(true);
      } catch {
        if (latestTipRequestIdRef.current !== tipRequestId) return;
        setTipText(null);
        setTipCost(null);
        setTipError("Kunde inte hämta tips just nu.");
        setTipPanelOpen(true);
      } finally {
        if (latestTipRequestIdRef.current === tipRequestId) {
          setIsTipLoading(false);
        }
      }
    },
    [
      vm.activeVersionId,
      vm.appProjectId,
      vm.chatId,
      vm.currentDemoUrl,
      vm.currentPageCode,
      vm.messages,
    ],
  );

  const handleRefreshTip = useCallback(() => {
    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    void requestTip(latestAssistant);
  }, [requestTip, vm.messages]);

  useEffect(() => {
    if (!vm.chatId) {
      latestTipRequestIdRef.current += 1;
      setTipPanelOpen(false);
      setTipText(null);
      setTipError(null);
      setTipCost(null);
      setIsTipLoading(false);
      lastAutoTipAssistantIdRef.current = null;
    }
  }, [vm.chatId]);

  useEffect(() => {
    if (!vm.tipsEnabled) {
      latestTipRequestIdRef.current += 1;
      setIsTipLoading(false);
      setTipPanelOpen(false);
    }
  }, [vm.tipsEnabled]);

  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    previousStreamingRef.current = vm.isAnyStreaming;

    if (!vm.tipsEnabled) return;
    if (!wasStreaming || vm.isAnyStreaming) return;

    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    if (!latestAssistant) return;
    if (lastAutoTipAssistantIdRef.current === latestAssistant.id) return;

    lastAutoTipAssistantIdRef.current = latestAssistant.id;
    void requestTip(latestAssistant);
  }, [requestTip, vm.isAnyStreaming, vm.messages, vm.tipsEnabled]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const seen = new Set<string>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const imgs =
            node.tagName === "IMG"
              ? [node as HTMLImageElement]
              : Array.from(node.querySelectorAll<HTMLImageElement>("img[src]"));

          for (const img of imgs) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
            try {
              const url = new URL(src, window.location.origin);
              if (url.origin === window.location.origin) continue;
              if (seen.has(url.href)) continue;
              seen.add(url.href);

              const closestLabel =
                img.alt ||
                img.closest("[data-label]")?.getAttribute("data-label") ||
                img.closest("[aria-label]")?.getAttribute("aria-label") ||
                img.parentElement?.textContent?.trim().slice(0, 60) ||
                "(unknown)";

              console.info(
                `%c[ExtImg]%c ${closestLabel}\n${url.href}`,
                "color:#f59e0b;font-weight:bold",
                "color:inherit",
              );
            } catch { /* invalid URL */ }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      projectId: vm.appProjectId,
      chatId: vm.chatId,
      activeVersionId: vm.activeVersionId,
      demoUrl: vm.currentDemoUrl,
      recentMessages: buildRecentContextMessages(vm.messages),
      currentCode: vm.currentPageCode?.slice(0, OPENCLAW_CONTEXT_CODE_MAX_CHARS) || null,
      isStreaming: vm.isAnyStreaming,
    };
    return () => {
      delete window.__SITEMASKIN_CONTEXT;
    };
  }, [
    vm.appProjectId,
    vm.chatId,
    vm.activeVersionId,
    vm.currentDemoUrl,
    vm.messages,
    vm.currentPageCode,
    vm.isAnyStreaming,
  ]);

  const resolvePlacementFlow = useCallback((decision: VisualPlacementDecision) => {
    setPendingPlacementRequest(null);
    setPlacementSelection(null);
    setPlacementConfirmOpen(false);
    const resolver = placementResolverRef.current;
    placementResolverRef.current = null;
    if (resolver) {
      resolver(decision);
    }
  }, []);

  useEffect(() => {
    return () => {
      const resolver = placementResolverRef.current;
      placementResolverRef.current = null;
      if (resolver) resolver("cancelled");
    };
  }, []);

  useEffect(() => {
    if (!pendingPlacementRequest) return;
    if (vm.chatId && vm.currentDemoUrl) return;
    resolvePlacementFlow("cancelled");
  }, [pendingPlacementRequest, resolvePlacementFlow, vm.chatId, vm.currentDemoUrl]);

  const handleRequestPlacement = useCallback(
    async (request: VisualPlacementRequest) => {
      if (!vm.chatId || !vm.currentDemoUrl) return "fallback";

      const existingResolver = placementResolverRef.current;
      if (existingResolver) {
        placementResolverRef.current = null;
        existingResolver("cancelled");
      }

      setPendingPlacementRequest(request);
      setPlacementSelection(null);
      setPlacementConfirmOpen(false);

      return await new Promise<VisualPlacementDecision>((resolve) => {
        placementResolverRef.current = resolve;
      });
    },
    [vm.chatId, vm.currentDemoUrl],
  );

  const handlePlacementComplete = useCallback(
    (detail: PlacementSelectEventDetail) => {
      if (!pendingPlacementRequest) return;
      setPlacementSelection(detail);
      setPlacementConfirmOpen(true);
    },
    [pendingPlacementRequest],
  );

  const handlePlacementCancel = useCallback(() => {
    resolvePlacementFlow("cancelled");
  }, [resolvePlacementFlow]);

  const handlePlacementConfirm = useCallback(
    async (customization: string) => {
      if (!pendingPlacementRequest || !placementSelection || !vm.chatId) {
        resolvePlacementFlow("cancelled");
        return;
      }

      setIsPlacementSubmitting(true);
      try {
        const fullMessage =
          pendingPlacementRequest.kind === "ui"
            ? buildUiPlacementMessage(
                pendingPlacementRequest,
                placementSelection,
                customization,
                vm.existingUiComponents,
              )
            : buildAiPlacementMessage(
                pendingPlacementRequest,
                placementSelection,
                customization,
              );

        await vm.sendMessage(fullMessage);
        resolvePlacementFlow("handled");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kunde inte skicka placeringsinstruktion";
        toast.error(message);
        resolvePlacementFlow("cancelled");
      } finally {
        setIsPlacementSubmitting(false);
      }
    },
    [
      pendingPlacementRequest,
      placementSelection,
      vm,
      resolvePlacementFlow,
    ],
  );

  const pendingPlacementItem = pendingPlacementRequest
    ? pendingPlacementRequest.kind === "ui"
      ? {
          title: pendingPlacementRequest.itemTitle,
          description:
            pendingPlacementRequest.selection.block.description ||
            pendingPlacementRequest.selection.registryItem.description ||
            null,
        }
      : {
          title: pendingPlacementRequest.item.label,
          description: pendingPlacementRequest.item.description,
        }
    : null;

  return (
    <BuilderLayout chatId={vm.chatId} versionId={vm.activeVersionId}>
      <BuilderHeader
        selectedModelTier={vm.selectedModelTier}
        onSelectedModelTierChange={vm.setSelectedModelTier}
        promptAssistModel={vm.promptAssistModel}
        onPromptAssistModelChange={vm.handlePromptAssistModelChange}
        promptAssistDeep={vm.promptAssistDeep}
        onPromptAssistDeepChange={vm.setPromptAssistDeep}
        canUseDeepBrief={!vm.chatId}
        designSystemId={vm.designSystemId}
        onDesignSystemIdChange={vm.setDesignSystemId}
        scaffoldMode={vm.scaffoldMode}
        scaffoldId={vm.scaffoldId}
        onScaffoldModeChange={vm.setScaffoldMode}
        onScaffoldIdChange={vm.setScaffoldId}
        customInstructions={vm.customInstructions}
        onCustomInstructionsChange={vm.setCustomInstructions}
        applyInstructionsOnce={vm.applyInstructionsOnce}
        onApplyInstructionsOnceChange={vm.setApplyInstructionsOnce}
        enableImageGenerations={vm.enableImageGenerations}
        onEnableImageGenerationsChange={vm.setEnableImageGenerations}
        enableThinking={vm.enableThinking}
        onEnableThinkingChange={vm.setEnableThinking}
        isThinkingSupported={vm.isThinkingSupported}
        isImageGenerationsSupported={vm.isImageGenerationsSupported}
        isMediaEnabled={vm.isMediaEnabled}
        chatPrivacy={vm.chatPrivacy}
        onChatPrivacyChange={vm.setChatPrivacy}
        enableBlobMedia={vm.enableBlobMedia}
        onEnableBlobMediaChange={vm.setEnableBlobMedia}
        showStructuredChat={vm.showStructuredChat}
        onShowStructuredChatChange={vm.setShowStructuredChat}
        tipsEnabled={vm.tipsEnabled}
        onTipsEnabledChange={vm.setTipsEnabled}
        isFigmaInputOpen={isFigmaInputOpen}
        onToggleFigmaInput={() => setIsFigmaInputOpen((value) => !value)}
        chatId={vm.chatId}
        activeVersionId={vm.activeVersionId}
        onOpenImport={() => {
          vm.setIsSandboxModalOpen(false);
          vm.setIsImportModalOpen(true);
        }}
        onOpenSandbox={() => {
          vm.setIsImportModalOpen(false);
          vm.setIsSandboxModalOpen(true);
        }}
        onDeployProduction={vm.handleOpenDeployDialog}
        onDomainSearch={() => {
          if (vm.lastDeployVercelProjectId) {
            vm.setDomainManagerOpen(true);
          } else {
            vm.setDomainSearchOpen(true);
          }
        }}
        onGoHome={vm.handleGoHome}
        onNewChat={vm.resetToNewChat}
        onSaveProject={vm.handleSaveProject}
        isDeploying={vm.isDeploying}
        isCreatingChat={vm.isCreatingChat || vm.isTemplateLoading}
        isAnyStreaming={vm.isAnyStreaming}
        isSavingProject={vm.isSavingProject}
        canDeploy={Boolean(
          vm.chatId && vm.activeVersionId && !vm.isCreatingChat && !vm.isAnyStreaming && !vm.isDeploying,
        )}
        canSaveProject={Boolean(vm.chatId)}
        deploymentStatus={vm.deploymentStatus}
        deploymentUrl={vm.deploymentUrl}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="border-border bg-background flex min-h-0 w-full flex-col border-r lg:w-96">
          <ProjectEnvVarsPanel projectId={vm.v0ProjectId} />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MessageList
              chatId={vm.chatId}
              messages={vm.messages}
              showStructuredParts={vm.showStructuredChat}
              onQuickReply={(text) => vm.sendMessage(text)}
              quickReplyDisabled={isBusy}
            />
            <TipCard
              open={tipPanelOpen && vm.tipsEnabled}
              isLoading={isTipLoading}
              tip={tipText}
              error={tipError}
              cost={tipCost}
              onRefresh={handleRefreshTip}
              onClose={() => setTipPanelOpen(false)}
            />
            <ThinkingOverlay isVisible={vm.isAnyStreaming} />
          </div>
          <ChatInterface
            chatId={vm.chatId}
            initialPrompt={vm.initialPrompt}
            onCreateChat={vm.requestCreateChat}
            onSendMessage={vm.sendMessage}
            onStartFromRegistry={vm.handleStartFromRegistry}
            onRequestPlacement={handleRequestPlacement}
            onStartFromTemplate={vm.handleStartFromTemplate}
            onPaletteSelection={vm.handlePaletteSelection}
            paletteSelections={vm.paletteState.selections}
            designTheme={vm.designTheme}
            onDesignThemeChange={vm.setDesignTheme}
            onEnhancePrompt={vm.handlePromptEnhance}
            isFigmaInputOpen={isFigmaInputOpen}
            onFigmaInputOpenChange={setIsFigmaInputOpen}
            isBusy={isBusy}
            isPreparingPrompt={vm.isPreparingPrompt}
            mediaEnabled={vm.mediaEnabled}
            currentCode={vm.currentPageCode}
            existingUiComponents={vm.existingUiComponents}
          />
          <DeployNameDialog
            open={vm.deployNameDialogOpen}
            deployName={vm.deployNameInput}
            deployNameError={vm.deployNameError}
            isDeploying={vm.isDeploying}
            isSaving={false}
            onDeployNameChange={(value) => {
              vm.setDeployNameInput(value);
              if (vm.deployNameError) vm.setDeployNameError(null);
            }}
            onCancel={() => vm.setDeployNameDialogOpen(false)}
            onConfirm={vm.handleConfirmDeploy}
          />

          <DomainSearchDialog
            open={vm.domainSearchOpen}
            query={vm.domainQuery}
            results={vm.domainResults}
            isSearching={vm.isDomainSearching}
            onQueryChange={vm.setDomainQuery}
            onSearch={vm.handleDomainSearch}
            onClose={() => vm.setDomainSearchOpen(false)}
          />

          <DomainManager
            open={vm.domainManagerOpen}
            onClose={() => vm.setDomainManagerOpen(false)}
            projectId={vm.lastDeployVercelProjectId}
            deploymentId={vm.activeDeploymentId}
          />
        </div>

        <div className="hidden min-h-0 flex-1 overflow-hidden lg:flex">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PreviewPanel
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              demoUrl={vm.currentDemoUrl}
              isLoading={vm.isAnyStreaming || vm.isCreatingChat}
              imageGenerationsEnabled={vm.enableImageGenerations}
              imageGenerationsSupported={vm.isImageGenerationsSupported}
              isBlobConfigured={vm.isMediaEnabled}
              awaitingInput={vm.isAwaitingInput}
              onClear={vm.handleClearPreview}
              onFixPreview={vm.handleFixPreview}
              refreshToken={vm.previewRefreshToken}
              placementMode={Boolean(pendingPlacementRequest)}
              pendingPlacementItem={pendingPlacementItem}
              onPlacementComplete={handlePlacementComplete}
            />
          </div>
          <div
            className={cn(
              "border-border bg-background flex h-full flex-col border-l transition-[width] duration-200",
              vm.isVersionPanelCollapsed ? "w-10" : "w-80",
            )}
          >
            <VersionHistory
              chatId={vm.chatId}
              selectedVersionId={vm.activeVersionId}
              onVersionSelect={vm.handleVersionSelect}
              isCollapsed={vm.isVersionPanelCollapsed}
              onToggleCollapse={vm.handleToggleVersionPanel}
              versions={vm.versions}
              mutateVersions={vm.mutateVersions}
            />
          </div>
        </div>
      </div>

      <PlacementConfirmDialog
        open={placementConfirmOpen && Boolean(pendingPlacementRequest) && Boolean(placementSelection)}
        elementName={pendingPlacementItem?.title || "Element"}
        elementDescription={pendingPlacementItem?.description}
        placementLabel={placementSelection?.placementLabel || "Vald placering"}
        onConfirm={handlePlacementConfirm}
        onCancel={handlePlacementCancel}
        isSubmitting={isPlacementSubmitting}
      />

      <SandboxModal
        isOpen={vm.isSandboxModalOpen}
        onClose={() => vm.setIsSandboxModalOpen(false)}
        chatId={vm.chatId}
        versionId={vm.activeVersionId}
        onUseInPreview={(url) => vm.setCurrentDemoUrl(url)}
      />

      <InitFromRepoModal
        isOpen={vm.isImportModalOpen}
        onClose={() => vm.setIsImportModalOpen(false)}
        onSuccess={(newChatId, _v0ProjectInternalId) => {
          vm.setChatId(newChatId);
          if (vm.appProjectId) {
            vm.applyAppProjectId(vm.appProjectId, { chatId: newChatId });
          } else {
            const params = new URLSearchParams(vm.searchParams.toString());
            params.set("chatId", newChatId);
            vm.router.replace(`/builder?${params.toString()}`);
          }
          vm.setMessages([]);
          vm.setCurrentDemoUrl(null);
        }}
      />

      <RequireAuthModal
        isOpen={Boolean(vm.authModalReason)}
        onClose={() => {
          const freshlyAuthed = useAuthStore.getState().user !== null;
          if (vm.authModalReason === "builder" && !freshlyAuthed) {
            vm.router.push("/");
          }
          vm.setAuthModalReason(null);
        }}
        reason={vm.authModalReason ?? "builder"}
      />
    </BuilderLayout>
  );
}
