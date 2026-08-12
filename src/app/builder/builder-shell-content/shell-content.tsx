"use client";

import { ChatInterface } from "@/components/builder/chat/ChatInterface";
import { MessageList } from "@/components/builder/chat/MessageList";
import { PreviewPanel } from "@/components/builder/preview-panel/PreviewPanel";
import { BuilderPreviewTools } from "@/components/builder/shell/BuilderPreviewTools";
import { ChatOutputCollapseBar } from "@/components/builder/chat/ChatOutputCollapseBar";
import { BuilderHeader } from "@/components/builder/shell/BuilderHeader";
import { ModelTraceOverlay } from "@/components/builder/diagnostics/ModelTraceOverlay";
import { LaunchReadinessCard } from "@/components/builder/readiness/LaunchReadinessCard";
import {
  F3RequirementsSurface,
  F3StatusSurface,
} from "@/components/builder/readiness/F3RequirementsSurface";
import { TipCard } from "@/components/builder/shell/TipCard";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { useAuthStore } from "@/lib/auth/auth-store";
import { requestF3Rebuild } from "@/lib/builder/project-env-events";
import { resolveChatCollapseStatusText } from "@/lib/builder/chat-collapse-status";
import { localizeVerificationSummary } from "@/lib/builder/version-history-status-labels";
import { cn } from "@/lib/utils";
import { Eye, MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { BuilderLayout } from "../BuilderLayout";
import type { BuilderViewModel } from "../useBuilderPageController";
import { BuilderShellDialogs } from "./shell-dialogs";
import { useShellDeployDomain } from "./use-deploy-domain";
import { useShellDevContextEffects } from "./use-dev-context-effects";
import { useShellF3TipsChrome } from "./use-f3-tips-chrome";
import { useShellPreviewLayout } from "./use-preview-layout";
import { useShellRegistryInsert } from "./use-registry-insert";
import { useShellVersionFollowup } from "./use-version-followup";

const InitFromRepoModal = dynamic(
  () =>
    import("@/components/builder/project-transfer/InitFromRepoModal").then((mod) => ({
      default: mod.InitFromRepoModal,
    })),
  { ssr: false },
);

const VersionHistory = dynamic(
  () =>
    import("@/components/builder/VersionHistory").then((mod) => ({
      default: mod.VersionHistory,
    })),
  { ssr: false },
);

export function BuilderShellContent(vm: BuilderViewModel) {
  const [hasMountedImportModal, setHasMountedImportModal] = useState(vm.isImportModalOpen);

  const {
    isBusy,
    isPreviewLoading,
    activeVersionSummary,
    activeVersionIsLatest,
    activeVersionBusStatus,
    activeVersionStatus,
    followUpBaseInfo,
    sendMessage,
    handleComposerAiFallback,
  } = useShellVersionFollowup(vm);

  const {
    isDeployActionBusy,
    hasPublication,
    canDeploy,
    deployDisabledReason,
    deployReadinessBlocker,
    hasGitHub,
    authUser,
  } = useShellDeployDomain(vm);

  const {
    setF3Requirements,
    setF3Status,
    visibleF3Status,
    visibleF3Requirements,
    handleDossierCountsChange,
    mobileTab,
    setMobileTab,
    githubExportOpen,
    setGithubExportOpen,
    enableAutofix,
    setEnableAutofix,
    isFigmaInputOpen,
    setIsFigmaInputOpen,
    tipPanelOpen,
    setTipPanelOpen,
    tipText,
    tipError,
    tipCost,
    isTipLoading,
    handleApproveBuildPlan,
    handleRefreshTip,
  } = useShellF3TipsChrome(vm, sendMessage);

  const {
    latestPendingReply,
    catalogPickDisabled,
    handleShadcnItemInsert,
    handleRequestDossier,
  } = useShellRegistryInsert(vm, sendMessage, isBusy);

  useShellDevContextEffects(vm, {
    activeVersionStatus,
    activeVersionIsLatest,
    latestPendingReply,
  });

  const {
    handleClearPreview,
    handleVersionSelect,
    handleF3MissingEnv,
    handleF3Ready,
    previewSurface,
    handleEnableAutofixChange,
    chatOutputCollapse,
    isChatOutputCollapsed,
  } = useShellPreviewLayout(vm, {
    tipPanelOpen,
    setEnableAutofix,
    setF3Requirements,
    setF3Status,
    sendMessage,
  });

  // Ö9: nedfällt läge döljer chattflödet, så en spärr som bara syns där måste
  // följa med upp i raden — annars gömmer nedfällningen felet.
  const chatCollapseStatusText = resolveChatCollapseStatusText({
    activeVersionStatus,
    deployBlocker: deployReadinessBlocker,
    f3Status: visibleF3Status,
  });

  return (
    <BuilderLayout chatId={vm.chatId} versionId={vm.activeVersionId}>
      <BuilderHeader
        selectedModelTier={vm.selectedModelTier}
        onSelectedModelTierChange={vm.setSelectedModelTier}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        canUseDeepBrief={!vm.chatId}
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
        isImageGenerationsSupported={vm.isImageGenerationsSupported}
        isMediaEnabled={vm.isMediaEnabled}
        chatPrivacy={vm.chatPrivacy}
        onChatPrivacyChange={vm.setChatPrivacy}
        enableBlobMedia={vm.enableBlobMedia}
        onEnableBlobMediaChange={vm.setEnableBlobMedia}
        enableAutofix={enableAutofix}
        onEnableAutofixChange={handleEnableAutofixChange}
        showStructuredChat={vm.showStructuredChat}
        onShowStructuredChatChange={vm.setShowStructuredChat}
        tipsEnabled={vm.tipsEnabled}
        onTipsEnabledChange={vm.setTipsEnabled}
        isFigmaInputOpen={isFigmaInputOpen}
        onToggleFigmaInput={() => setIsFigmaInputOpen((value) => !value)}
        chatId={vm.chatId}
        activeVersionId={vm.activeVersionId}
        onOpenImport={() => {
          setHasMountedImportModal(true);
          vm.setIsImportModalOpen(true);
        }}
        onExportGitHub={() => setGithubExportOpen(true)}
        onDeployProduction={vm.handleOpenDeployDialog}
        onDomainSearch={() => {
          // A publication exists if there is a live deployment or a known
          // hosting project — from the current session OR hydrated on reload.
          if (hasPublication) {
            vm.setDomainManagerOpen(true);
          } else {
            vm.setDomainSearchOpen(true);
          }
        }}
        onGoHome={vm.handleGoHome}
        onNewChat={vm.resetToNewChat}
        onSaveProject={vm.handleSaveProject}
        onCancelGeneration={vm.cancelActiveGeneration}
        isDeploying={vm.isDeploying}
        isCreatingChat={vm.isCreatingChat}
        isAnyStreaming={vm.isAnyStreaming}
        isSavingProject={vm.isSavingProject}
        canDeploy={canDeploy}
        canManageDomain={Boolean(vm.chatId && vm.activeVersionId && !isDeployActionBusy)}
        canSaveProject={Boolean(vm.chatId)}
        deploymentStatus={vm.deploymentStatus}
        deploymentUrl={vm.deploymentUrl}
        deploymentInspectorUrl={vm.deploymentInspectorUrl}
        onRepublishWithFix={vm.republishWithFix}
        isRepublishRepairing={vm.isRepublishRepairing}
        liveDeploymentUrl={vm.liveDeploymentUrl}
        liveDeploymentVersionId={vm.liveDeploymentVersionId}
        deploymentHistoryHydrationFailed={vm.deploymentHistoryHydrationFailed}
        onRetryDeploymentHistory={vm.refetchDeploymentHistory}
        deployDisabledReason={deployDisabledReason}
        onToggleVersions={vm.handleToggleVersionPanel}
        isVersionPanelOpen={!vm.isVersionPanelCollapsed}
        previewTools={
          <BuilderPreviewTools
            surface={previewSurface}
            chatId={vm.chatId}
            versionId={vm.activeVersionId}
            previewUrl={vm.currentPreviewUrl}
            lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
            isBusy={isBusy}
            onClear={handleClearPreview}
            clearDisabled={isPreviewLoading}
            onRequestDossier={handleRequestDossier}
            catalogPickDisabled={catalogPickDisabled}
            onF3MissingEnv={handleF3MissingEnv}
            onF3Status={setF3Status}
            onF3Ready={handleF3Ready}
            onF3ReleaseSettled={vm.handleDeterministicF3Settled}
            f3RequiresRealBuildKeys={
              vm.deployReadiness?.info?.hasRealBuildIntegrations ?? null
            }
            onDossierCountsChange={handleDossierCountsChange}
            activeVersionMeta={activeVersionSummary}
          />
        }
      />
      <ModelTraceOverlay
        selectedModelTier={vm.selectedModelTier}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        enableThinking={vm.enableThinking}
        canUseDeepBrief={!vm.chatId}
      />

      {/* Mobile tab bar (visible < lg) */}
      <div className="border-border bg-background flex border-b lg:hidden" role="tablist" aria-label="Byggarvyer">
        <button
          role="tab"
          aria-selected={mobileTab === "chat"}
          aria-controls="builder-chat-panel"
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            mobileTab === "chat"
              ? "border-brand-blue text-brand-blue border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "preview"}
          aria-controls="builder-preview-panel"
          onClick={() => setMobileTab("preview")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            mobileTab === "preview"
              ? "border-brand-blue text-brand-blue border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="h-4 w-4" />
          Preview
          {vm.currentPreviewUrl && mobileTab !== "preview" && (
            <span className="bg-brand-blue h-2 w-2 rounded-full" />
          )}
        </button>
      </div>

      {/* Ö9: nedfälld chat lägger sig som en rad under previewen i stället för
          som en kolumn bredvid den — det är så previewen får ytan tillbaka.
          `flex-col-reverse` håller chatten (först i DOM) kvar längst ned. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          isChatOutputCollapsed && "lg:flex-col-reverse",
        )}
      >
        <div
          id="builder-chat-panel"
          role="tabpanel"
          className={cn(
            "border-border bg-background min-h-0 w-full flex-col lg:flex",
            isChatOutputCollapsed
              ? "lg:w-full lg:shrink-0 lg:border-t"
              : "border-r lg:w-96",
            mobileTab === "chat" ? "flex" : "hidden",
          )}
        >
          <LaunchReadinessCard
            readiness={vm.deployReadiness}
            isLoading={vm.isDeployReadinessLoading}
            lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
            hasAnyVersion={vm.effectiveVersionsList.length > 0}
          />
          {/* Lucka 3 (ägarbeslut 2026-08-11): render while an F3-blocked
              episode is tracked at all — NOT only while `missingByIntegration`
              is still non-empty. `visibleF3Requirements` shrinks that list
              client-side as keys are saved, but "Fortsätt integrationsbygget"
              (the only caller of `requestF3Rebuild`) must stay reachable right
              after the user fills the LAST key too (Bugbot, 4th pass on this
              diff — gating on the empty list here removed the button, not
              just the surface's own now-removed "allt klart"-text). The
              surface itself hides its intro text + key list when nothing is
              missing; the retry button is always rendered. */}
          {visibleF3Requirements ? (
            <F3RequirementsSurface
              projectId={visibleF3Requirements.projectId ?? vm.appProjectId}
              missingByIntegration={visibleF3Requirements.missingByIntegration}
              onRetry={() =>
                requestF3Rebuild(visibleF3Requirements.parentVersionId)
              }
            />
          ) : null}
          {visibleF3Status ? (
            <F3StatusSurface
              status={visibleF3Status}
              chatId={vm.chatId}
              versionId={visibleF3Status.versionId ?? null}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
            />
          ) : null}
          {/* Ägarbeslut 2026-07-22: ProjectEnvVarsPanel är borttagen — Byggblock-
              popovern (PreviewPanelDossiers) är den enda env-ytan i både F2 och F3. */}
          <div
            id="builder-chat-output"
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              isChatOutputCollapsed && "hidden",
            )}
          >
            <MessageList
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              messages={vm.messages}
              showStructuredParts={vm.showStructuredChat}
              onQuickReply={async (text, options) => {
                await sendMessage(text, options);
              }}
              onApproveBuildPlan={handleApproveBuildPlan}
              quickReplyDisabled={isBusy}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              isStreaming={vm.isAnyStreaming}
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
          </div>
          {/* Ö3/Del B: i nedfällt läge centreras BARA chatten (fliken + inputen)
              som en box i mitten — inte Lansering-panelen (Del F) ovanför. På
              smal skärm ger `w-full` full bredd så boxen inte blir en remsa. */}
          <div
            className={cn(
              "flex flex-col",
              isChatOutputCollapsed && "mx-auto w-full max-w-2xl",
            )}
          >
            {vm.messages.length > 0 ? (
              <ChatOutputCollapseBar
                isCollapsed={isChatOutputCollapsed}
                onToggle={chatOutputCollapse.toggle}
                messageCount={vm.messages.length}
                isStreaming={vm.isAnyStreaming}
                statusText={chatCollapseStatusText}
              />
            ) : null}
            <ChatInterface
            chatId={vm.chatId}
            initialPrompt={vm.initialPrompt}
            onCreateChat={vm.requestCreateChat}
            onSendMessage={sendMessage}
            onPromptAssistModeReset={vm.handlePromptAssistModeReset}
            isFigmaInputOpen={isFigmaInputOpen}
            onFigmaInputOpenChange={setIsFigmaInputOpen}
            isBusy={isBusy}
            isPreparingPrompt={vm.isPreparingPrompt}
            mediaEnabled={vm.mediaEnabled}
            continuePlanMode={Boolean(latestPendingReply?.planMode)}
            followUpBaseInfo={followUpBaseInfo}
            previewModes={
              vm.currentPreviewUrl
                ? {
                    composerOpen: previewSurface.composerMode,
                    onToggleComposer: previewSurface.toggleComposer,
                    composerDisabled: previewSurface.viewMode !== "preview",
                    inspectAvailable: previewSurface.inspectorEnabled,
                    inspectOpen: previewSurface.inspectMode,
                    onToggleInspect: previewSurface.toggleInspect,
                    inspectDisabled: previewSurface.viewMode !== "preview",
                  }
                : null
            }
          />
          </div>
          <BuilderShellDialogs
            vm={vm}
            githubExportOpen={githubExportOpen}
            setGithubExportOpen={setGithubExportOpen}
            hasGitHub={hasGitHub}
            githubUsername={authUser?.github_username ?? null}
          />

        </div>

        <div
          id="builder-preview-panel"
          role="tabpanel"
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            mobileTab === "preview" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PreviewPanel
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              designTheme={vm.designTheme}
              onDesignThemeChange={vm.setDesignTheme}
              themeLocked={vm.isAnyStreaming}
              previewUrl={vm.currentPreviewUrl}
              previewBuildError={vm.previewBuildError}
              previewProdBuild={vm.previewProdBuild}
              previewPending={vm.previewPending}
              activePreviewSessionId={vm.activePreviewSessionId}
              previewLifecycle={vm.previewLifecycle}
              activeVersionStatus={activeVersionStatus}
              activeVersionSummary={localizeVerificationSummary(
                activeVersionSummary?.verificationSummary ?? null,
              )}
              activeVersionIsLatest={activeVersionIsLatest}
              activeVersionRepairPassIndex={activeVersionBusStatus?.repairPassIndex ?? 0}
              onPreviewSessionSuspect={vm.handlePreviewSessionSuspect}
              onForcePreviewResync={() => vm.forcePreviewResync()}
              versionMismatchPayload={vm.versionMismatchPayload}
              onNavigatePreviewUrl={(url) => {
                // The URL change reloads the iframe by itself; bumping the
                // refresh token too caused a double load on every page-tab
                // click (PreviewPanel no longer sets iframe.src imperatively).
                vm.setCurrentPreviewUrl(url);
              }}
              isLoading={isPreviewLoading}
              isGenerating={isBusy}
              imageGenerationsEnabled={vm.enableImageGenerations}
              imageGenerationsSupported={vm.isImageGenerationsSupported}
              isBlobConfigured={vm.isMediaEnabled}
              awaitingInput={vm.isAwaitingInput}
              awaitingInputQuestion={latestPendingReply?.question ?? null}
              awaitingInputOptions={latestPendingReply?.options ?? []}
              onFixPreview={vm.handleFixPreview}
              versionlessAborted={vm.versionlessAborted}
              onRestartGeneration={vm.handleRestartGeneration}
              onFilesSaved={vm.handleFilesSaved}
              refreshToken={vm.previewRefreshToken}
              onComposerAiFallback={handleComposerAiFallback}
              onShadcnItemInsert={handleShadcnItemInsert}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              surface={previewSurface}
            />
          </div>
          {/* Versionshistoriken är en riktig drawer: helt dold när den är
              stängd (ingen tunn vertikal remsa) och öppnas/stängs via
              "Versioner"-knappen i headern eller panelens egen stängknapp. */}
          {!vm.isVersionPanelCollapsed && (
            <div className="border-border bg-background hidden h-full w-80 flex-col border-l lg:flex">
              <VersionHistory
                chatId={vm.chatId}
                selectedVersionId={vm.activeVersionId}
                activePreviewSessionId={vm.activePreviewSessionId}
                onVersionSelect={handleVersionSelect}
                onPreviewResync={(versionId) => vm.forcePreviewResync(versionId)}
                isCollapsed={false}
                onToggleCollapse={vm.handleToggleVersionPanel}
                versions={vm.effectiveVersionsList}
                mutateVersions={vm.mutateVersions}
                lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              />
            </div>
          )}
        </div>
      </div>

      {hasMountedImportModal || vm.isImportModalOpen ? (
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
            vm.setCurrentPreviewUrl(null);
          }}
        />
      ) : null}

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
