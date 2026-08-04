import type { ComposerAiFallbackPayload } from "@/components/builder/preview-panel/preview-panel-types";
import { buildPromptSourceMessage } from "@/lib/builder/prompt-builder";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import { analyzeSections } from "@/lib/builder/sectionAnalyzer";
import { mapVersionStatusToDisplay } from "@/lib/builder/version-status-display";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { dispatchVersionStatusRefreshed } from "@/lib/builder/project-env-events";
import { shouldBlockPreviewWithLoadingOverlay } from "@/lib/builder/preview-lifecycle";
import { useVersionStatus } from "@/lib/hooks/chat/useVersionStatus";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { BuilderViewModel } from "../useBuilderPageController";

export function useShellVersionFollowup(vm: BuilderViewModel) {
  const isBusy = vm.isCreatingChat || vm.isAnyStreaming || vm.isTemplateLoading || vm.isPreparingPrompt;
  // Non-blocking verify/pending UX — see `shouldBlockPreviewWithLoadingOverlay`:
  // background verification/bootstrap never click-blocks a live preview.
  const isPreviewLoading = shouldBlockPreviewWithLoadingOverlay({
    isCreatingChat: vm.isCreatingChat,
    previewPending: vm.previewPending,
    previewLifecycle: vm.previewLifecycle,
    currentPreviewUrl: vm.currentPreviewUrl,
    isAnyStreaming: vm.isAnyStreaming,
  });
  const activeVersionSummary = useMemo(() => {
    return vm.activeVersionId
      ? vm.effectiveVersionsList.find(
          (version) => version.versionId === vm.activeVersionId || version.id === vm.activeVersionId,
        ) ?? null
      : null;
  }, [vm.activeVersionId, vm.effectiveVersionsList]);
  const activeVersionIsLatest =
    !vm.activeVersionId || !vm.latestVersionId || vm.activeVersionId === vm.latestVersionId;
  // OMTAG-06 / område 6-1: version status now flows from the canonical
  // event-bus projection (`selectVersionStatus`), read client-side via
  // `useVersionStatus`, instead of being inferred from DB row flags
  // through the now-removed `resolveEngineVersionDisplayStatus`.
  // `mapVersionStatusToDisplay` derives `retrying`/`promoted` and guards
  // against false-green (degraded ≠ success). VersionHistory flipped to the
  // bus in område 6-2; the legacy resolver was removed in 6-3.
  const { status: activeVersionBusStatus } = useVersionStatus({
    chatId: vm.chatId,
    versionId: vm.activeVersionId,
    // Område 6-3 punkt 1: deterministic refetch after the post-check flow
    // completes (bumped in `runPostGenerationChecks`'s `finally`), so a late
    // `version.degraded` is read even after poll-until-stable has stopped.
    refreshNonce: vm.versionStatusNonce,
  });
  const activeVersionStatus = useMemo(() => {
    return mapVersionStatusToDisplay(activeVersionBusStatus, {
      isLatest: activeVersionIsLatest,
      releaseState: activeVersionSummary?.releaseState ?? null,
    }).status;
  }, [activeVersionBusStatus, activeVersionIsLatest, activeVersionSummary]);
  // P19 Steg 3 — transparency in follow-up base. When the user is focused
  // on a version other than the preferred usable one (`latestVersionId` =
  // `selectPreferredEngineVersion`), the next `sendMessage` carries
  // `engineBaseVersionId = activeVersionId` (see useSendMessage.ts). Surface
  // that decision in the chat composer. Labels prefer human-readable version
  // numbers and fall back to a shortened id. Distinguish older-selection vs
  // newer-but-rejected — never hide the banner in the rejected case.
  const preferredVersionSummary = useMemo(() => {
    if (!vm.latestVersionId) return null;
    return (
      vm.effectiveVersionsList.find(
        (version) =>
          version.versionId === vm.latestVersionId || version.id === vm.latestVersionId,
      ) ?? null
    );
  }, [vm.latestVersionId, vm.effectiveVersionsList]);
  const followUpBaseInfo = useMemo(() => {
    if (activeVersionIsLatest) return null;
    if (!vm.activeVersionId || !vm.latestVersionId) return null;
    const toDisplay = (
      summary: { versionNumber?: number | null; versionId?: string | null; id?: string | null } | null,
      fallbackId: string | null,
    ): string => {
      if (summary?.versionNumber) return `v${summary.versionNumber}`;
      const id = summary?.versionId || summary?.id || fallbackId;
      return id ? `#${id.slice(0, 6)}` : "okänd";
    };
    const activeStatus = resolveEngineVersionLifecycleStatus({
      releaseState: activeVersionSummary?.releaseState ?? null,
      verificationState: activeVersionSummary?.verificationState ?? null,
    });
    const activeNumber =
      typeof activeVersionSummary?.versionNumber === "number"
        ? activeVersionSummary.versionNumber
        : null;
    const preferredNumber =
      typeof preferredVersionSummary?.versionNumber === "number"
        ? preferredVersionSummary.versionNumber
        : null;
    const rejectedActive =
      activeStatus === "failed" ||
      activeStatus === "superseded" ||
      (activeNumber != null && preferredNumber != null && activeNumber > preferredNumber);
    return {
      baseLabel: toDisplay(activeVersionSummary, vm.activeVersionId),
      preferredLabel: toDisplay(preferredVersionSummary, vm.latestVersionId),
      kind: rejectedActive ? ("rejected-active" as const) : ("stale-selection" as const),
    };
  }, [
    activeVersionIsLatest,
    activeVersionSummary,
    preferredVersionSummary,
    vm.activeVersionId,
    vm.latestVersionId,
  ]);
  const sendMessage = vm.sendMessage;

  // Byggblock-panelen (PreviewPanelDossiers) refetchar sin "inkopplade"-lista
  // på versionId-byte + popover-open + env-var-sparning, men INTE när en ny
  // version landar medan popovern redan är öppen (t.ex. mitt i en generation).
  // `versionStatusNonce` bumpas när en generations post-check-flöde är klart
  // (`runPostGenerationChecks`), så vi speglar den ändringen som ett fönster-
  // event i stället för att tråda nonce genom hela preview-panel-kedjan.
  const isFirstVersionStatusNonceRef = useRef(true);
  useEffect(() => {
    if (isFirstVersionStatusNonceRef.current) {
      isFirstVersionStatusNonceRef.current = false;
      return;
    }
    dispatchVersionStatusRefreshed();
  }, [vm.versionStatusNonce]);

  const handleComposerAiFallback = useCallback(
    async (payload: ComposerAiFallbackPayload) => {
      if (!vm.chatId) return;
      const block = getPageBlockById(payload.blockId);
      if (!block) {
        toast.error("Okänt sajblock.");
        return;
      }
      const sections = payload.homePageContent ? analyzeSections(payload.homePageContent) : [];
      const built = buildPromptSourceMessage(
        {
          kind: "page-block",
          label: block.label,
          description: block.description,
          implementationPrompt: block.implementationPrompt,
          placement: payload.placement,
          detectedSections: sections,
        },
        {
          placementLabel: payload.placementLabel,
          anchorLabel: payload.anchorSection?.label ?? null,
        },
      );
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage, vm.chatId],
  );
  return {
    isBusy,
    isPreviewLoading,
    activeVersionSummary,
    activeVersionIsLatest,
    activeVersionBusStatus,
    activeVersionStatus,
    followUpBaseInfo,
    sendMessage,
    handleComposerAiFallback,
  };
}
