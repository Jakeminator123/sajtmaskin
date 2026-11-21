"use client";

import { ChatInterface } from "@/components/builder/chat/ChatInterface";
import { MessageList } from "@/components/builder/chat/MessageList";
import { PreviewPanel } from "@/components/builder/preview-panel/PreviewPanel";
import { BuilderPreviewTools } from "@/components/builder/shell/BuilderPreviewTools";
import { FloatingCollapsedChatInput } from "@/components/builder/chat/FloatingCollapsedChatInput";
import { Relocatable, useRelocationSlot } from "@/components/builder/cube/relocation";
import { BuilderHeader } from "@/components/builder/shell/BuilderHeader";
import { ModelTraceOverlay } from "@/components/builder/diagnostics/ModelTraceOverlay";
import {
  F3RequirementsSurface,
  F3StatusSurface,
} from "@/components/builder/readiness/F3RequirementsSurface";
import { SajtagentProvider } from "@/components/builder/chat/sajtagent/SajtagentProvider";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { registerBuilderBridge } from "@/lib/openclaw/builder-bridge";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { CampaignAccountBanner } from "@/components/kostnadsfri/campaign-account-banner";
import { currentBuilderReturnTo } from "@/lib/builder/pending-builder-draft";
import { useAuthStore } from "@/lib/auth/auth-store";
import { requestF3Rebuild } from "@/lib/builder/project-env-events";
import { setBuilderCubeEnabled, useBuilderCubeEnabled } from "@/lib/builder/builder-cube-preference";
import { resolveChatCollapseStatusText } from "@/lib/builder/chat-collapse-status";
import { localizeVerificationSummary } from "@/lib/builder/version-history-status-labels";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { LG_UP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { ChevronLeft, Eye, MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuilderLayout } from "../BuilderLayout";
import type { BuilderViewModel } from "../useBuilderPageController";
import {
  BuilderCubeSurface,
  focusAfterLayoutSwitch,
  type BuilderCubeSlots,
} from "./cube-surface";
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

/**
 * Chattpanelens innehåll medan byggkuben visar det: osynligt och ur flödet,
 * men utlagt med den dockade panelens mått (`lg:w-96` med höger kant).
 * Layouten måste finnas kvar och vara densamma som nyss: rullägena läses när
 * innehållet flyttas till kuben, och en tidslinje som just lagts om i en
 * annan bredd svarar med ett annat läge än det användaren stod på.
 */
const CHAT_PANEL_PARKED_CLASS =
  "pointer-events-none invisible absolute inset-y-0 left-0 flex w-96 flex-col border-r border-transparent";

export function BuilderShellContent(vm: BuilderViewModel) {
  const [hasMountedImportModal, setHasMountedImportModal] = useState(vm.isImportModalOpen);
  // Under `lg` (mobilflikarna) bor previewverktygen i förhandsvisningsfliken
  // och versionshistoriken öppnas som ett ark från Mer (rigg V-10, § 9).
  const isDesktopShell = useMediaQuery(LG_UP_MEDIA_QUERY, true);
  const [isVersionSheetOpen, setIsVersionSheetOpen] = useState(false);

  const {
    isBusy,
    isInteractionLocked,
    isPreviewLoading,
    activeVersionSummary,
    activeVersionIsLatest,
    activeVersionBusStatus,
    activeVersionStatusIdentity,
    activeVersionStatus,
    preferredVersionStatus,
    followUpBaseInfo,
    sendMessage,
    handleComposerAiFallback,
  } = useShellVersionFollowup(vm);

  const {
    isDeployActionBusy,
    hasPublication,
    canDeploy,
    deployDisabledReason,
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
    handleApproveBuildPlan,
  } = useShellF3TipsChrome(vm, sendMessage);

  const {
    latestPendingReply,
    catalogPickDisabled,
    handleShadcnItemInsert,
    handleRequestDossier,
  } = useShellRegistryInsert(vm, sendMessage, isInteractionLocked);

  useShellDevContextEffects(vm, {
    activeVersionStatus,
    activeVersionIsLatest,
    latestPendingReply,
  });

  const {
    handleVersionSelect,
    handleF3MissingEnv,
    handleF3Ready,
    previewSurface,
    handleEnableAutofixChange,
    chatOutputCollapse,
    isChatOutputCollapsed,
  } = useShellPreviewLayout(vm, {
    setEnableAutofix,
    setF3Requirements,
    setF3Status,
    sendMessage,
    isInteractionLocked,
  });

  // Builder-brygga (plan 2026-10-22 «En chatt», E4): Sajtagentens byggkommandon
  // går genom samma INLINDADE `sendMessage` som Skicka-knappen — den binder
  // armerad continuation — i stället för att fylla komposern via DOM:en.
  // Omregistrering är bara en modulvariabel-tilldelning, och korten läser
  // bryggan färskt per poll, så effekten får följa sina inputs rakt av.
  const bridgeChatId = vm.chatId;
  const bridgeVersionId = vm.activeVersionId;
  const bridgeCancel = vm.cancelActiveGeneration;
  useEffect(
    () =>
      registerBuilderBridge({
        getChatId: () => bridgeChatId,
        getActiveVersionId: () => bridgeVersionId,
        canSend: () => Boolean(bridgeChatId) && !isInteractionLocked,
        sendMessage: (message, options) => sendMessage(message, options),
        cancelGeneration: () => bridgeCancel(),
      }),
    [bridgeChatId, bridgeVersionId, bridgeCancel, isInteractionLocked, sendMessage],
  );

  // Byggkuben (valfri, lg+): chattpanelens innehåll som sex sidor i en
  // flyttbar panel över förhandsvisningen. Under lg och utan chatt gäller den
  // vanliga panelen: kuben har ingen mobil form, och välkomstläget har bara
  // inmatningen att visa.
  const cubeEnabled = useBuilderCubeEnabled();
  const cubeActive = cubeEnabled && isDesktopShell && Boolean(vm.chatId);
  // Fokus följer bytet. Knappen som öppnade kuben blir osynlig och knappen
  // som stängde den avmonteras; utan det här hamnar fokus på <body> och den
  // som använder tangentbordet tappar sin plats. Bara när användaren själv
  // bytte: ett smalare fönster eller en omladdning flyttar inget fokus.
  const focusAfterCubeSwitchRef = useRef(false);
  const openCube = useCallback(() => {
    focusAfterCubeSwitchRef.current = true;
    setBuilderCubeEnabled(true);
  }, []);
  const closeCube = useCallback(() => {
    focusAfterCubeSwitchRef.current = true;
    setBuilderCubeEnabled(false);
  }, []);
  useEffect(() => {
    if (!focusAfterCubeSwitchRef.current) return;
    focusAfterCubeSwitchRef.current = false;
    // En bild senare: kuben är osynlig tills den har mätt sin yta, och det
    // sker i renderingen efter monteringen. Ett osynligt element tar inte
    // emot fokus.
    const frame = requestAnimationFrame(() => {
      const panel = document.getElementById("builder-chat-panel");
      if (panel) focusAfterLayoutSwitch(panel);
    });
    return () => cancelAnimationFrame(frame);
  }, [cubeActive]);
  // Komposerns egna utskick, inte Sajtagentens via bryggan: kuben vrider fram
  // Svar på dem och på inget annat. Ett utskick som avvisas innan det skrivs
  // ner vrider tillbaka till Chatt, där utkastet ligger kvar.
  const [composerTurns, setComposerTurns] = useState(0);
  const [composerTurnsKept, setComposerTurnsKept] = useState(0);
  const handleComposerTurn = useCallback(() => setComposerTurns((count) => count + 1), []);
  const handleComposerTurnKept = useCallback(
    () => setComposerTurnsKept((count) => count + 1),
    [],
  );

  // En nedfälld chatt döljer utdatan men inte den flytande komposern, som kan
  // skicka till Sajtagenten. Svaret får inte landa i en dold yta: fäll ut när
  // en ny agentrad kommer (samma skäl som tips-popovern förut expanderade).
  // Hydrerad historik räknas inte — att öppna en chatt får inte skriva över
  // användarens sparade nedfällda läge. Inte heller kuben: där syns svaret
  // under Svar, och panelens sparade läge gäller när man går tillbaka.
  const agentMessageCount = useOpenClawStore((s) =>
    s.messages.reduce((count, message) => count + (message.hydrated ? 0 : 1), 0),
  );
  const prevAgentMessageCountRef = useRef(agentMessageCount);
  const expandChatOutput = chatOutputCollapse.expand;
  useEffect(() => {
    const grew = agentMessageCount > prevAgentMessageCountRef.current;
    prevAgentMessageCountRef.current = agentMessageCount;
    if (grew && isChatOutputCollapsed && !cubeActive) expandChatOutput();
  }, [agentMessageCount, isChatOutputCollapsed, cubeActive, expandChatOutput]);

  // Ett stopp är ett stopp: headerns «Avbryt» avbryter bygget OCH släpper ett
  // aktivt agentmandat, så continuation-slingan inte skickar nästa steg på en
  // tur användaren just avbröt.
  const handleCancelGeneration = useCallback(() => {
    useOpenClawStore.getState().setArmedMandate(null);
    vm.cancelActiveGeneration();
  }, [vm]);

  // Publiceringsspärrar (postcheck-overlay, fake_form, …) visas inte i chatten
  // — de bor i error-log + Versionsdiagnostik (ägare 2026-08-19).
  const chatCollapseStatusText = resolveChatCollapseStatusText({
    activeVersionStatus,
    preferredVersionStatus,
    f3Status: visibleF3Status,
  });

  // Ett enda kluster åt gången: i headern på desktop, i förhandsvisnings-
  // fliken under `lg` (där headern är en rad).
  const previewTools = (className?: string) => (
    <BuilderPreviewTools
      className={className}
      surface={previewSurface}
      chatId={vm.chatId}
      versionId={vm.activeVersionId}
      previewUrl={vm.currentPreviewUrl}
      lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
      isBusy={isInteractionLocked}
      onClear={() => vm.forcePreviewResync()}
      clearDisabled={isPreviewLoading}
      onRequestDossier={handleRequestDossier}
      catalogPickDisabled={catalogPickDisabled}
      onF3MissingEnv={handleF3MissingEnv}
      onF3Status={setF3Status}
      onF3Ready={handleF3Ready}
      onF3ReleaseSettled={vm.handleDeterministicF3Settled}
      f3RequiresRealBuildKeys={vm.deployReadiness?.info?.hasRealBuildIntegrations ?? null}
      onDossierCountsChange={handleDossierCountsChange}
      activeVersionMeta={activeVersionSummary}
    />
  );

  // Komposern, tidslinjen och F3-ytorna renderas en gång, i panelen nedan.
  // Kuben visar samma instanser genom utlopp i stället för att rendera egna,
  // så ett layoutbyte avmonterar ingenting (`relocation.tsx`).
  const composerSlot = useRelocationSlot();
  const timelineSlot = useRelocationSlot();
  const noticesSlot = useRelocationSlot();
  const cubeSlots = useMemo<BuilderCubeSlots>(
    () => ({ composer: composerSlot, timeline: timelineSlot, notices: noticesSlot }),
    [composerSlot, timelineSlot, noticesSlot],
  );

  return (
    <BuilderLayout chatId={vm.chatId} versionId={vm.activeVersionId}>
      <BuilderHeader
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
        onCancelGeneration={handleCancelGeneration}
        isDeploying={vm.isDeploying}
        isCreatingChat={vm.isCreatingChat}
        isAnyStreaming={vm.isAnyStreaming}
        pipelineLocked={isInteractionLocked}
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
        previewTools={isDesktopShell ? previewTools() : null}
        onOpenVersionHistory={isDesktopShell ? undefined : () => setIsVersionSheetOpen(true)}
      />
      <ModelTraceOverlay
        selectedModelTier={vm.selectedModelTier}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        enableThinking={vm.enableThinking}
        canUseDeepBrief={!vm.chatId}
      />

      <CampaignAccountBanner />

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
          Chatt
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
          Förhandsvisning
          {vm.currentPreviewUrl && mobileTab !== "preview" && (
            <span className="bg-brand-blue h-2 w-2 rounded-full" />
          )}
        </button>
      </div>

      {/* Ö9: nedfälld chat på desktop (lg+) är en flytande dragbar box över
          previewen — inte en dockad bottenremsa. Mobil behåller flödeslayout. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 overflow-hidden",
        )}
      >
        <div
          id="builder-chat-panel"
          role="tabpanel"
          className={cn(
            "border-border bg-background min-h-0 w-full flex-col lg:flex",
            // Kuben använder samma överlägg som den nedfällda chatten:
            // panelen täcker ytan utan att fånga klick, kuben fångar sina egna.
            isChatOutputCollapsed || cubeActive
              ? "lg:pointer-events-none lg:absolute lg:inset-0 lg:z-30 lg:border-0 lg:bg-transparent"
              : "border-r lg:w-96",
            isChatOutputCollapsed && "max-lg:border-t",
            mobileTab === "chat" ? "flex" : "hidden",
          )}
        >
          {/* Sajtagenten bor i samma chatt som byggmotorn (plan 2026-10-22).
              Providern äger agentens samtal, continuation och «nästa steg»
              efter bygget; MessageList och ChatInterface läser den. */}
          <SajtagentProvider
            chatId={vm.chatId}
            activeVersionId={vm.activeVersionId}
            activeVersionStatus={activeVersionStatus ?? null}
            activeVersionIsLatest={activeVersionIsLatest}
            isAnyStreaming={vm.isAnyStreaming}
            digestEnabled={vm.tipsEnabled}
          >
          {cubeActive ? (
            <BuilderCubeSurface
              // Nycklad på chatten: en ny chatt börjar på Chatt-sidan, utan
              // den förra chattens olästa svar.
              key={vm.chatId}
              vm={vm}
              slots={cubeSlots}
              locked={isInteractionLocked}
              statusText={chatCollapseStatusText}
              noticesPending={Boolean(visibleF3Requirements)}
              composerTurns={composerTurns}
              composerTurnsKept={composerTurnsKept}
              onExit={closeCube}
            />
          ) : null}
          {/* Panelens innehåll är alltid monterat. I kubläget syns det inte här
              utan genom kubens utlopp. Utan kub ger `contents` omslaget ingen
              egen ruta, så panelens flexlayout är densamma som utan det. */}
          <div
            className={cubeActive ? CHAT_PANEL_PARKED_CLASS : "contents"}
            data-testid="builder-chat-panel-content"
          >
          {/* F3 stannar utanför float-boxen; göms i collapsed lg+. */}
          <div className={cn(isChatOutputCollapsed && "lg:hidden")}>
            <Relocatable slot={noticesSlot}>
            {/* Lucka 3 (ägarbeslut 2026-08-11): render while an F3-blocked
                episode is tracked at all — NOT only while `missingByIntegration`
                is still non-empty. `visibleF3Requirements` shrinks that list
                client-side as keys are saved, but "Fortsätt integrationsbygget"
                (the only caller of `requestF3Rebuild`) must stay reachable right
                after the user fills the LAST key too (Bugbot, 4th pass on this
                diff — gating on the empty list here removed the button, not
                just the surface's own now-removed "allt klart"-text). The
                surface itself hides its short notice when nothing is
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
            </Relocatable>
          </div>
          {/* Ägarbeslut 2026-07-22: ProjectEnvVarsPanel är borttagen — Byggblock-
              popovern (PreviewPanelDossiers) är den enda env-ytan i både F2 och F3. */}
          <div
            id="builder-chat-output"
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              isChatOutputCollapsed && "hidden",
            )}
          >
            <Relocatable slot={timelineSlot}>
            <MessageList
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              canonicalVersionStatus={activeVersionStatusIdentity ? {
                ...activeVersionStatusIdentity,
                status: activeVersionStatus,
                isLatest: activeVersionIsLatest,
              } : null}
              previewVisible={vm.previewLifecycle === "live"}
              messages={vm.messages}
              showStructuredParts={vm.showStructuredChat}
              onQuickReply={async (text, options) => {
                await sendMessage(text, options);
              }}
              onApproveBuildPlan={handleApproveBuildPlan}
              quickReplyDisabled={isInteractionLocked}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              isStreaming={vm.isAnyStreaming}
            />
            </Relocatable>
          </div>
          <FloatingCollapsedChatInput
            // I kubläget är panelen dold; då ska den inte flyta.
            floatEnabled={isChatOutputCollapsed && !cubeActive}
            chatId={vm.chatId}
            isCollapsed={isChatOutputCollapsed}
            onToggleCollapse={chatOutputCollapse.toggle}
            builderMessages={vm.messages}
            isStreaming={vm.isAnyStreaming}
            statusText={chatCollapseStatusText}
            onOpenCube={openCube}
          >
            <Relocatable slot={composerSlot}>
            <ChatInterface
              chatId={vm.chatId}
              initialPrompt={vm.initialPrompt}
              auditHandoff={vm.auditHandoff}
              onCreateChat={vm.requestCreateChat}
              onSendMessage={sendMessage}
              isFigmaInputOpen={isFigmaInputOpen}
              onFigmaInputOpenChange={setIsFigmaInputOpen}
              isBusy={isInteractionLocked}
              isPreparingPrompt={vm.isPreparingPrompt}
              mediaEnabled={vm.mediaEnabled}
              continuePlanMode={Boolean(latestPendingReply?.planMode)}
              builderAwaitingReply={vm.isAwaitingInput || Boolean(latestPendingReply)}
              followUpBaseInfo={followUpBaseInfo}
              selectedModelTier={vm.selectedModelTier}
              onSelectedModelTierChange={vm.setSelectedModelTier}
              // I kuben har avataren en egen sida; komposern visar då ingen egen knapp.
              avatarElsewhere={cubeActive}
              onTurnSent={handleComposerTurn}
              onTurnKept={handleComposerTurnKept}
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
            </Relocatable>
          </FloatingCollapsedChatInput>
          </div>
          <BuilderShellDialogs
            vm={vm}
            githubExportOpen={githubExportOpen}
            setGithubExportOpen={setGithubExportOpen}
            hasGitHub={hasGitHub}
            githubUsername={authUser?.github_username ?? null}
          />
          </SajtagentProvider>
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
            {isDesktopShell ? null : previewTools("bg-background m-1.5 self-end")}
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
              activePreviewLifecycleToken={vm.activePreviewLifecycleToken}
              previewLifecycle={vm.previewLifecycle}
              activeVersionStatus={activeVersionStatus}
              activeVersionSummary={localizeVerificationSummary(
                activeVersionSummary?.verificationSummary ?? null,
              )}
              activeVersionPromotedAt={activeVersionSummary?.promotedAt ?? null}
              activeVersionNumber={activeVersionSummary?.versionNumber ?? null}
              activeVersionIsLatest={activeVersionIsLatest}
              activeVersionRepairPassIndex={activeVersionBusStatus?.repairPassIndex ?? 0}
              onPreviewSessionSuspect={vm.handlePreviewSessionSuspect}
              onPreviewSessionRotated={vm.handlePreviewSessionRotated}
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
              awaitingPlanApproval={vm.isAwaitingPlanApproval}
              onFixPreview={vm.handleFixPreview}
              versionlessAborted={vm.versionlessAborted}
              onRestartGeneration={vm.handleRestartGeneration}
              templateInitError={vm.templateInitError}
              onRetryTemplateInit={vm.retryTemplateInit}
              hasPrefilledPrompt={Boolean(vm.initialPrompt)}
              onFilesSaved={vm.handleFilesSaved}
              refreshToken={vm.previewRefreshToken}
              onComposerAiFallback={handleComposerAiFallback}
              onShadcnItemInsert={handleShadcnItemInsert}
              lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
              surface={previewSurface}
            />
          </div>
          {/* Versionshistoriken öppnas/stängs via panelens egen knapp. Infällt
              läge är en smal fäll-ut-yta så header-knappen "Versioner" inte
              behövs. */}
          {vm.isVersionPanelCollapsed ? (
            <div className="border-border bg-background hidden h-full w-10 flex-col items-center border-l px-1 py-2 lg:flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={vm.handleToggleVersionPanel}
                title="Fäll ut versioner"
                aria-label="Fäll ut versioner"
                className="h-7 w-7"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          ) : (
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
                selectDisabled={isInteractionLocked}
              />
            </div>
          )}
        </div>
      </div>

      {isDesktopShell ? null : (
        <Sheet open={isVersionSheetOpen} onOpenChange={setIsVersionSheetOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-sm">
            <SheetTitle className="sr-only">Versionshistorik</SheetTitle>
            <SheetDescription className="sr-only">
              Välj en version för att visa den i förhandsvisningen.
            </SheetDescription>
            {isVersionSheetOpen ? (
              <VersionHistory
                chatId={vm.chatId}
                selectedVersionId={vm.activeVersionId}
                activePreviewSessionId={vm.activePreviewSessionId}
                onVersionSelect={(versionId, demoUrl) => {
                  handleVersionSelect(versionId, demoUrl);
                  setIsVersionSheetOpen(false);
                  setMobileTab("preview");
                }}
                onPreviewResync={(versionId) => vm.forcePreviewResync(versionId)}
                isCollapsed={false}
                onToggleCollapse={() => setIsVersionSheetOpen(false)}
                versions={vm.effectiveVersionsList}
                mutateVersions={vm.mutateVersions}
                lifecycleStage={vm.deployReadiness?.info?.lifecycleStage ?? null}
                selectDisabled={isInteractionLocked}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      )}

      {hasMountedImportModal || vm.isImportModalOpen ? (
        <InitFromRepoModal
          isOpen={vm.isImportModalOpen}
          onClose={() => vm.setIsImportModalOpen(false)}
          onSuccess={(result) => {
            vm.handleImportedRepoSuccess(result);
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
        returnTo={currentBuilderReturnTo()}
      />
    </BuilderLayout>
  );
}
