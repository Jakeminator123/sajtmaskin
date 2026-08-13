import { useChatOutputCollapse } from "@/components/builder/chat/useChatOutputCollapse";
import { usePreviewSurfaceMode } from "@/components/builder/preview-panel/usePreviewSurfaceMode";
import { isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import { postPreviewDestroy } from "@/lib/builder/preview-session/api";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { saveProjectData } from "@/lib/projects/project-client";
import {
  readAutofixLocalStorageOnly,
  writeAutofixLocalStorage,
} from "@/lib/hooks/chat/useAutoFix";
import type { F3BuilderStatus, F3MissingIntegration } from "@/lib/builder/f3-status";
import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { BuilderViewModel } from "../useBuilderPageController";

export function useShellPreviewLayout(
  vm: BuilderViewModel,
  options: {
    tipPanelOpen: boolean;
    setEnableAutofix: Dispatch<SetStateAction<boolean>>;
    setF3Requirements: Dispatch<
      SetStateAction<{
        parentVersionId: string;
        projectId?: string | null;
        requestStartedAt?: number;
        missingByIntegration: F3MissingIntegration[];
      } | null>
    >;
    setF3Status: Dispatch<SetStateAction<F3BuilderStatus | null>>;
    // The outcome-reporting wrapper from `useShellVersionFollowup` — the F3
    // auto-kick must go through it so armed autonomy sees the turn settle.
    sendMessage: BuilderViewModel["sendMessage"];
  },
) {
  const { tipPanelOpen, setEnableAutofix, setF3Requirements, setF3Status, sendMessage } = options;
  const persistPreviewOverride = useCallback(
    async (url: string | null, versionId: string | null) => {
      vm.setServerProjectPreviewOverrideUrl(url);
      vm.setServerProjectPreviewOverrideVersionId(versionId);
      if (!vm.appProjectId) return;
      try {
        await saveProjectData(vm.appProjectId, {
          meta: {
            previewOverride:
              url && versionId
                ? {
                    url,
                    versionId,
                    source: "preview",
                  }
                : null,
          },
        });
      } catch (error) {
        console.warn("[Builder] Failed to persist preview override:", error);
      }
    },
    [vm],
  );

  const handleClearPreview = useCallback(() => {
    void (async () => {
      const activeVersionId = vm.activeVersionId ?? null;
      const activePreviewSessionId = vm.activePreviewSessionId?.trim() || null;

      if (vm.chatId && activeVersionId && activePreviewSessionId) {
        const destroy = await postPreviewDestroy({
          chatId: vm.chatId,
          versionId: activeVersionId,
          previewSessionId: activePreviewSessionId,
        });
        if (!destroy || destroy.ok !== true) {
          toast.error(
            destroy?.message?.trim() || "Kunde inte stänga live-preview och frigöra VM-sessionen.",
          );
          return;
        }
      }

      vm.clearPreviewSessionState(activeVersionId);
      vm.setClearedPreviewVersionId(activeVersionId);
      vm.setCurrentPreviewUrl(null);
      void persistPreviewOverride(null, null);
      void vm.mutateVersions();
    })();
  }, [vm, persistPreviewOverride]);

  const handleVersionSelect = useCallback(
    (versionId: string, demoUrl?: string) => {
      vm.clearPreviewBuildError();
      vm.setClearedPreviewVersionId(null);
      if (vm.serverProjectPreviewOverrideVersionId === versionId) {
        void persistPreviewOverride(null, null);
      }
      vm.handleVersionSelect(versionId, demoUrl);
    },
    [vm, persistPreviewOverride],
  );

  useEffect(() => {
    setEnableAutofix(readAutofixLocalStorageOnly());
  }, [setEnableAutofix]);

  const handleF3MissingEnv = useCallback(
    (payload: {
      parentVersionId: string;
      projectId?: string | null;
      chatId?: string | null;
      missingByIntegration: Array<{ key: string; name: string; missing: string[] }>;
    }) => {
      // The 412's group/key scope is owned by finalize-design — the client
      // never re-detects keys. Besides the persistent requirements surface,
      // focus the affected dossier in the Byggblock popover (owner decision
      // 2026-07-13). Chat correlation: a slow finalize-response from a previous
      // chat must not repopulate the surface after a chat switch.
      if (payload.chatId && payload.chatId !== vm.chatId) return;
      setF3Requirements(payload);
      setF3Status(null);
      openDossiersPanel(payload.missingByIntegration.flatMap((entry) => entry.missing));
    },
    [vm.chatId, setF3Requirements, setF3Status],
  );

  const handleF3Ready = useCallback(
    (payload: { parentVersionId: string }) => {
      // Auto-kick the F3 ("Bygg integrationer") generation as soon as
      // `/finalize-design` greenlights the F2 version. The server reads
      // `meta.lifecycleStage` + `meta.parentVersionId` from this send and forks
      // a new engine_versions row with `lifecycle_stage = "integrations"` and
      // `parent_version_id` set to the F2 version we just finalized.
      setF3Requirements(null);
      void sendMessage("Bygg integrationer nu utifrån den finaliserade designversionen.", {
        lifecycleStageOverride: "integrations",
        parentVersionIdOverride: payload.parentVersionId,
        engineBaseVersionIdOverride: payload.parentVersionId,
      });
    },
    [sendMessage, setF3Requirements],
  );

  // Previewens lägen (composer/inspect/vy) har EN ägare här: kontrollerna sitter
  // i chatpanelens Verktyg-rad och i headern, ytan de styr i previewpanelen.
  const previewSurface = usePreviewSurfaceMode({
    previewUrl: vm.currentPreviewUrl,
    canShowCode: Boolean(vm.chatId && vm.activeVersionId),
    inspectorEnabled: isBuilderInspectorEnabled(),
  });

  const handleEnableAutofixChange = useCallback(
    (next: boolean) => {
      writeAutofixLocalStorage(next);
      setEnableAutofix(next);
    },
    [setEnableAutofix],
  );

  const chatOutputCollapse = useChatOutputCollapse(vm.chatId);
  const isChatOutputCollapsed = chatOutputCollapse.isCollapsed && vm.messages.length > 0;
  // Tipsrutan renderas ovanpå utdataytan. Utan detta hade ett tips som öppnas
  // medan chatten är nedfälld hamnat i en dold yta och sett ut att försvinna.
  const expandChatOutput = chatOutputCollapse.expand;
  useEffect(() => {
    if (tipPanelOpen) expandChatOutput();
  }, [tipPanelOpen, expandChatOutput]);
  return {
    persistPreviewOverride,
    handleClearPreview,
    handleVersionSelect,
    handleF3MissingEnv,
    handleF3Ready,
    previewSurface,
    handleEnableAutofixChange,
    chatOutputCollapse,
    isChatOutputCollapsed,
  };
}
