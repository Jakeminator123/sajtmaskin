import type { ComposerAiFallbackPayload } from "@/components/builder/preview-panel/preview-panel-types";
import { buildPromptSourceMessage } from "@/lib/builder/prompt-builder";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import { analyzeSections } from "@/lib/builder/section-analyzer";
import { mapVersionStatusToDisplay } from "@/lib/builder/version-status-display";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { dispatchVersionStatusRefreshed } from "@/lib/builder/project-env-events";
import { shouldBlockPreviewWithLoadingOverlay } from "@/lib/builder/preview-lifecycle";
import { useVersionStatus } from "@/lib/hooks/chat/useVersionStatus";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import { isOpenClawPreparedSend } from "@/lib/openclaw/prepared-prompt";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
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
  // `sendMessage` already reports how a turn ended (`SendMessageOutcome`), but
  // nothing kept the answer around. Armed autonomy needs it: a send stopped by
  // stale-base, an F3 env gate or the credit gate leaves the focused version on
  // its previous terminal status, which otherwise reads exactly like a finished
  // build — and the handshake would wake up and spend another mandate step on a
  // turn that never ran. It is reported for EVERY outcome, not just refusals:
  // the handshake resumes only on a send that says it ran, so the absence of an
  // answer has to stop the run too.
  // Numbered per send rather than time-stamped: the builder has many senders,
  // and the handshake owns exactly one of them. A manual retry, a catalogue
  // insert or a plan decision that fails while an autonomous turn is running
  // must not end a mandate whose own send can still succeed.
  const sendSeqRef = useRef(0);

  const rawSendMessage = vm.sendMessage;
  const sendMessage = useCallback<typeof rawSendMessage>(
    async (...args) => {
      const seq = (sendSeqRef.current += 1);
      // Naming the turn from inside the send that owns it is what makes the
      // match exact: the composer awaits an attachment step between the click
      // and this call, and a predicted id could be taken by another sender in
      // that window. The armed auto-send is recognised by the text OpenClaw
      // filled into the composer — not merely by a fill being recorded, since a
      // catalogue pick landing in the same window would then claim the watch
      // and the mandate would read its own refused turn as someone else's.
      const openClaw = useOpenClawStore.getState();
      if (isOpenClawPreparedSend({ preparedFill: openClaw.preparedFill, message: args[0] })) {
        openClaw.bindArmedContinuationSend(seq);
      }
      let outcome: SendMessageOutcome | undefined;
      try {
        outcome = await rawSendMessage(...args);
        return outcome;
      } finally {
        // A send that threw or resolved with nothing did not run a turn either,
        // so it reports as a failure rather than leaving the watch waiting for
        // an answer that will never come.
        useOpenClawStore
          .getState()
          .settleArmedContinuationSend(seq, outcome?.status ?? "failed");
      }
    },
    [rawSendMessage],
  );

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
