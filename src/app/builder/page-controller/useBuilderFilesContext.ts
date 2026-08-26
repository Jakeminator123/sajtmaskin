"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect } from "react";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  QUICK_EDIT_APPLIED_EVENT_NAME,
  readQuickEditAppliedEventPayload,
} from "@/lib/builder/quick-edit-applied-event";

type FilesSavedInfo = {
  versionId?: string;
  previewUrl?: string | null;
  previewSessionId?: string | null;
  previewMode?: string | null;
};

type Params = {
  chatId: string | null;
  activeVersionId: string | null;
  previewRefreshToken: number;
  filesContextKeyRef: MutableRefObject<string | null>;
  promptFetchDoneRef: MutableRefObject<string | null>;
  pendingCreatedVersionRef: MutableRefObject<{ id: string; ts: number } | null>;
  mutateVersions: () => unknown;
  onPreviewSessionMeta: (
    meta: {
      previewSessionId: string;
      versionId: string | null;
      lifecycleToken?: string | null;
    } | null,
  ) => void;
  setCurrentPageCode: Dispatch<SetStateAction<string | undefined>>;
  setExistingUiComponents: Dispatch<SetStateAction<string[]>>;
  setPreviewRefreshToken: Dispatch<SetStateAction<number>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  /**
   * Passed as whole objects (not destructured fields) so `handleFilesSaved`
   * keeps the same dependency identity it had inline in the controller.
   */
  state: { setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>> };
  vmPreview: { previewBootstrapDoneKeysRef: MutableRefObject<Set<string>> };
};

/**
 * File-level context for the active version: the prompt-assist fetch that feeds
 * the component picker, plus the `handleFilesSaved` handoff used by the preview
 * panel and OpenClaw's quick-edit card.
 */
export function useBuilderFilesContext({
  chatId,
  activeVersionId,
  previewRefreshToken,
  filesContextKeyRef,
  promptFetchDoneRef,
  pendingCreatedVersionRef,
  mutateVersions,
  onPreviewSessionMeta,
  setCurrentPageCode,
  setExistingUiComponents,
  setPreviewRefreshToken,
  setSelectedVersionId,
  state,
  vmPreview,
}: Params) {
  // Prompt assist context fetch
  useEffect(() => {
    const contextKey =
      chatId && activeVersionId
        ? `${chatId}:${activeVersionId}:${previewRefreshToken}`
        : null;
    if (!contextKey) {
      filesContextKeyRef.current = null;
      setExistingUiComponents([]);
      return;
    }
    if (filesContextKeyRef.current === contextKey) return;
    filesContextKeyRef.current = contextKey;

    let isActive = true;
    const controller = new AbortController();

    const fetchContext = async () => {
      try {
        if (!chatId || !activeVersionId) {
          return;
        }
        // Liten delay sa fetchen inte race:ar mot finalize-pipens
        // versions-persist (annars far vi 404 + console-spam pa nyligen
        // skapade versionId i ~1s-fonstret innan DB:n hunnit committa).
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        if (!isActive || controller.signal.aborted) return;
        const response = await fetch(
          `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(activeVersionId)}`,
          { signal: controller.signal },
        );
        // 404 inom kort fonster efter version.created ar normalt (race
        // mot finalize-persist). Vi tystar dem och provar igen vid nasta
        // refreshToken-tick istallet for att spamma Chrome-konsolen.
        if (response.status === 404) {
          return;
        }
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content?: string | null }>;
        } | null;
        if (!response.ok || !Array.isArray(data?.files)) {
          if (isActive) {
            setCurrentPageCode(undefined);
            setExistingUiComponents([]);
          }
          return;
        }

        const pageFile = data.files.find(
          (f) =>
            f.name === "page.tsx" ||
            f.name === "app/page.tsx" ||
            f.name.endsWith("/page.tsx") ||
            f.name === "index.tsx" ||
            f.name === "App.tsx",
        );
        if (isActive) setCurrentPageCode(pageFile?.content || undefined);

        const extractUiComponentName = (fileName: string): string | null => {
          if (!fileName) return null;
          const normalized = fileName.replace(/\\/g, "/");
          const marker = "/components/ui/";
          const idx = normalized.lastIndexOf(marker);
          if (idx === -1) return null;
          const tail = normalized.slice(idx + marker.length);
          if (!tail) return null;
          const indexMatch = tail.match(/([^/]+)\/index\.(tsx|ts|jsx|js)$/);
          if (indexMatch?.[1]) return indexMatch[1];
          const base = tail.split("/").pop() || "";
          const cleaned = base.replace(/\.(tsx|ts|jsx|js)$/, "");
          return cleaned || null;
        };

        const nextUiComponents = Array.from(
          new Set(
            data.files
              .map((file) => extractUiComponentName(file.name))
              .filter((name): name is string => Boolean(name)),
          ),
        ).sort((a, b) => a.localeCompare(b));

        if (isActive) setExistingUiComponents(nextUiComponents);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setExistingUiComponents([]);
      }
    };

    fetchContext();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, activeVersionId, previewRefreshToken, filesContextKeyRef, setExistingUiComponents, setCurrentPageCode]);

  const handleFilesSaved = useCallback(
    (info?: FilesSavedInfo) => {
      filesContextKeyRef.current = null;
      promptFetchDoneRef.current = null;
      // Fast Edit Lane: a quick edit created a new minor version — select it so
      // follow-ups build on the patched version (avoids a stale-base reject) and
      // refresh the version list so the new v.x row appears.
      if (info?.versionId) {
        // M#sel1: register the fresh id BEFORE selecting, so the versionIdSet
        // guard tolerates it while the mutateVersions refetch is in flight.
        pendingCreatedVersionRef.current = { id: info.versionId, ts: Date.now() };
        setSelectedVersionId(info.versionId);
        void mutateVersions();
        // If the live preview was patched in place (same preview session, new
        // version + URL), thread the session meta and mark the new version's
        // bootstrap as done so useBuilderVmPreview does NOT re-POST
        // /preview-session — i.e. keep the no-restart fast path. Without this the
        // version switch would clear the session meta and trigger a full VM
        // bootstrap right after the hot patch.
        if (info.previewUrl && info.previewSessionId && chatId) {
          state.setCurrentPreviewUrl(info.previewUrl);
          onPreviewSessionMeta({
            previewSessionId: info.previewSessionId,
            versionId: info.versionId,
          });
          vmPreview.previewBootstrapDoneKeysRef.current.add(`${chatId}:${info.versionId}`);
        }
      }
      setPreviewRefreshToken(Date.now());
    },
    [
      filesContextKeyRef,
      promptFetchDoneRef,
      pendingCreatedVersionRef,
      setPreviewRefreshToken,
      setSelectedVersionId,
      mutateVersions,
      chatId,
      state,
      onPreviewSessionMeta,
      vmPreview,
    ],
  );

  // OpenClaws apply_quick_edit-kort lever utanför builderns props-kedja och
  // broar sitt Fast Edit Lane-resultat hit via window-event (samma mönster som
  // sajtmaskin:auto-fix). Utan synken behåller buildern den ersatta basen och
  // nästa snabbändring får stale_base_version (Bugbot 2026-08-01).
  useEffect(() => {
    const handler = (event: Event) => {
      const payload = readQuickEditAppliedEventPayload(event);
      if (!payload || payload.chatId !== chatId) return;
      handleFilesSaved(payload);
    };
    window.addEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);
    return () => {
      window.removeEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);
    };
  }, [chatId, handleFilesSaved]);

  return handleFilesSaved;
}
