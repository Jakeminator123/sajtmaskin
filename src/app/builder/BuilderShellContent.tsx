"use client";

import { ChatInterface } from "@/components/builder/ChatInterface";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { MessageList } from "@/components/builder/MessageList";
import { PreviewPanel } from "@/components/builder/PreviewPanel";
import { SandboxModal } from "@/components/builder/SandboxModal";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { ProjectEnvVarsPanel } from "@/components/builder/ProjectEnvVarsPanel";
import { DeployNameDialog } from "@/components/builder/DeployNameDialog";
import { DomainSearchDialog } from "@/components/builder/DomainSearchDialog";
import { DomainManager } from "@/components/builder/DomainManager";
import { ThinkingOverlay } from "@/components/builder/ThinkingOverlay";
import { RequireAuthModal } from "@/components/auth";
import { useAuthStore } from "@/lib/auth/auth-store";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { BuilderLayout } from "./BuilderLayout";
import type { BuilderViewModel } from "./useBuilderPageController";

export function BuilderShellContent(vm: BuilderViewModel) {
  const isBusy = vm.isCreatingChat || vm.isAnyStreaming || vm.isTemplateLoading || vm.isPreparingPrompt;
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);

  useEffect(() => {
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      chatId: vm.chatId,
      activeVersionId: vm.activeVersionId,
      demoUrl: vm.currentDemoUrl,
      recentMessages: vm.messages.slice(-5).map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string" ? m.content.slice(0, 300) : "[structured]",
      })),
      currentCode: vm.currentPageCode?.slice(0, 3000) || null,
      isStreaming: vm.isAnyStreaming,
    };
    return () => {
      delete window.__SITEMASKIN_CONTEXT;
    };
  }, [
    vm.chatId,
    vm.activeVersionId,
    vm.currentDemoUrl,
    vm.messages,
    vm.currentPageCode,
    vm.isAnyStreaming,
  ]);

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
          <div className="min-h-0 flex-1 overflow-hidden">
            <MessageList
              chatId={vm.chatId}
              messages={vm.messages}
              showStructuredParts={vm.showStructuredChat}
              onQuickReply={(text) => vm.sendMessage(text)}
              quickReplyDisabled={isBusy}
            />
            <ThinkingOverlay isVisible={vm.isAnyStreaming} />
          </div>
          <ChatInterface
            chatId={vm.chatId}
            initialPrompt={vm.initialPrompt}
            onCreateChat={vm.requestCreateChat}
            onSendMessage={vm.sendMessage}
            onStartFromRegistry={vm.handleStartFromRegistry}
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
