"use client";

import type { ChatMessage } from "@/lib/builder/types";
import type { PaletteState } from "@/lib/builder/palette";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_IMAGE_GENERATIONS,
  DEFAULT_MODEL_TIER,
} from "@/lib/builder/defaults";
import { clearPersistedMessages } from "@/lib/builder/messagesStorage";
import { createProject, saveProjectData } from "@/lib/project-client";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction, type TransitionStartFunction } from "react";
import toast from "react-hot-toast";

type Args = {
  chatId: string | null;
  chatIdParam: string | null;
  projectParam: string | null;
  appProjectId: string | null;
  appProjectName: string | null;
  pendingProjectName: string | null;
  isAuthenticated: boolean;
  isSavingProject: boolean;
  messages: ChatMessage[];
  resolvedPrompt: string | null;
  currentDemoUrl: string | null;
  activeVersionId: string | null;
  mediaEnabled: boolean;
  paletteState: PaletteState;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
  hasLoadedInstructions: MutableRefObject<boolean>;
  hasLoadedInstructionsOnce: MutableRefObject<boolean>;
  router: { replace: (url: string) => void; push: (url: string) => void };
  searchParams: { toString: () => string; get: (key: string) => string | null };
  startUiTransition: TransitionStartFunction;
  setChatId: Dispatch<SetStateAction<string | null>>;
  setAppProjectId: Dispatch<SetStateAction<string | null>>;
  setAppProjectName: Dispatch<SetStateAction<string | null>>;
  setPendingProjectName: Dispatch<SetStateAction<string | null>>;
  setCurrentDemoUrl: Dispatch<SetStateAction<string | null>>;
  setPreviewRefreshToken: Dispatch<SetStateAction<number>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsImportModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsSandboxModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsSavingProject: Dispatch<SetStateAction<boolean>>;
  setSelectedModelTier: Dispatch<SetStateAction<ModelTier>>;
  setEnableImageGenerations: Dispatch<SetStateAction<boolean>>;
  setCustomInstructions: Dispatch<SetStateAction<string>>;
  setApplyInstructionsOnce: Dispatch<SetStateAction<boolean>>;
  setDeployNameInput: Dispatch<SetStateAction<string>>;
  setDeployNameDialogOpen: Dispatch<SetStateAction<boolean>>;
  setV0ProjectId: Dispatch<SetStateAction<string | null>>;
  setIsIntentionalReset: Dispatch<SetStateAction<boolean>>;
  setAuthModalReason: Dispatch<SetStateAction<"builder" | "save" | null>>;
};

export function useBuilderProjectActions({
  chatId,
  chatIdParam,
  projectParam,
  appProjectId,
  appProjectName: _appProjectName,
  pendingProjectName,
  isAuthenticated,
  isSavingProject,
  messages,
  resolvedPrompt,
  currentDemoUrl,
  activeVersionId,
  mediaEnabled,
  paletteState,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
  hasLoadedInstructions,
  hasLoadedInstructionsOnce,
  router,
  searchParams,
  startUiTransition,
  setChatId,
  setAppProjectId,
  setAppProjectName,
  setPendingProjectName,
  setCurrentDemoUrl,
  setPreviewRefreshToken,
  setMessages,
  setIsImportModalOpen,
  setIsSandboxModalOpen,
  setIsSavingProject,
  setSelectedModelTier,
  setEnableImageGenerations,
  setCustomInstructions,
  setApplyInstructionsOnce,
  setDeployNameInput,
  setDeployNameDialogOpen,
  setV0ProjectId,
  setIsIntentionalReset,
  setAuthModalReason,
}: Args) {
  const applyAppProjectId = useCallback(
    (nextProjectId: string | null, options: { chatId?: string | null } = {}) => {
      if (!nextProjectId) return;
      setAppProjectId((prev) => (prev === nextProjectId ? prev : nextProjectId));
      const resolvedChatId = options.chatId ?? chatId;
      if (!resolvedChatId) return;
      if (projectParam === nextProjectId && chatIdParam === resolvedChatId) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("chatId", resolvedChatId);
      params.set("project", nextProjectId);
      router.replace(`/builder?${params.toString()}`);
    },
    [chatId, chatIdParam, projectParam, router, searchParams, setAppProjectId],
  );

  const resolveSuggestedProjectName = useCallback(() => {
    const preferred = pendingProjectName?.trim();
    if (preferred) return preferred;
    const firstUserMessage = messages.find(
      (m) => m.role === "user" && typeof m.content === "string",
    );
    const base =
      firstUserMessage?.content?.trim() ||
      resolvedPrompt?.trim() ||
      (chatId ? `sajtmaskin-${chatId}` : "sajtmaskin");
    const singleLine = base.split("\n")[0]?.trim();
    return singleLine || "sajtmaskin";
  }, [pendingProjectName, messages, resolvedPrompt, chatId]);

  const handleSaveProject = useCallback(async () => {
    if (isSavingProject) return;
    if (!isAuthenticated) {
      setAuthModalReason("save");
      return;
    }
    if (!chatId) {
      toast.error("Ingen chat att spara ännu.");
      return;
    }

    setIsSavingProject(true);
    try {
      let targetProjectId = appProjectId;
      if (!targetProjectId) {
        const dateLabel = new Date().toLocaleDateString("sv-SE");
        const firstUserMessage = messages.find(
          (m) => m.role === "user" && typeof m.content === "string",
        );
        const preferredName = pendingProjectName?.trim();
        const baseTitle = preferredName || firstUserMessage?.content?.trim().slice(0, 40);
        const name = preferredName
          ? preferredName
          : baseTitle
            ? `${baseTitle} - ${dateLabel}`
            : `Projekt ${dateLabel}`;
        const description = firstUserMessage?.content?.trim().slice(0, 100);

        const created = await createProject(name, undefined, description);
        targetProjectId = created.id;
        setAppProjectId(created.id);
        setAppProjectName(created.name);

        const params = new URLSearchParams(searchParams.toString());
        params.set("project", created.id);
        params.set("chatId", chatId);
        router.replace(`/builder?${params.toString()}`);
      }

      let files: Array<{ name: string; content: string }> = [];
      if (activeVersionId) {
        const materializeParam = mediaEnabled ? "&materialize=1" : "";
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            activeVersionId,
          )}${materializeParam}`,
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content: string }>;
        } | null;
        if (response.ok && Array.isArray(data?.files)) {
          files = data.files;
        }
      }

      await saveProjectData(targetProjectId, {
        chatId,
        demoUrl: currentDemoUrl ?? undefined,
        files,
        messages,
        meta: { palette: paletteState },
      });
      toast.success("Projekt sparat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte spara projektet.");
    } finally {
      setIsSavingProject(false);
    }
  }, [
    isSavingProject,
    isAuthenticated,
    chatId,
    appProjectId,
    activeVersionId,
    currentDemoUrl,
    mediaEnabled,
    messages,
    paletteState,
    pendingProjectName,
    router,
    searchParams,
    setAppProjectId,
    setAppProjectName,
    setIsSavingProject,
    setAuthModalReason,
  ]);

  const resetToNewChat = useCallback(() => {
    setIsIntentionalReset(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("sajtmaskin:lastChatId");
    }
    if (chatId) {
      clearPersistedMessages(chatId);
    }
    router.replace("/builder");
    pendingInstructionsRef.current = null;
    pendingInstructionsOnceRef.current = null;
    hasLoadedInstructions.current = false;
    hasLoadedInstructionsOnce.current = false;
    startUiTransition(() => {
      setChatId(null);
      setAppProjectId(null);
      setAppProjectName(null);
      setPendingProjectName(null);
      setDeployNameInput("");
      setDeployNameDialogOpen(false);
      setV0ProjectId(null);
      setCurrentDemoUrl(null);
      setPreviewRefreshToken(0);
      setMessages([]);
      setIsImportModalOpen(false);
      setIsSandboxModalOpen(false);
      setSelectedModelTier(DEFAULT_MODEL_TIER);
      setEnableImageGenerations(DEFAULT_IMAGE_GENERATIONS);
      setCustomInstructions(DEFAULT_CUSTOM_INSTRUCTIONS);
      setApplyInstructionsOnce(false);
    });
  }, [
    router,
    chatId,
    startUiTransition,
    pendingInstructionsRef,
    pendingInstructionsOnceRef,
    hasLoadedInstructions,
    hasLoadedInstructionsOnce,
    setChatId,
    setAppProjectId,
    setAppProjectName,
    setPendingProjectName,
    setDeployNameInput,
    setDeployNameDialogOpen,
    setV0ProjectId,
    setCurrentDemoUrl,
    setPreviewRefreshToken,
    setMessages,
    setIsImportModalOpen,
    setIsSandboxModalOpen,
    setSelectedModelTier,
    setEnableImageGenerations,
    setCustomInstructions,
    setApplyInstructionsOnce,
    setIsIntentionalReset,
  ]);

  return {
    applyAppProjectId,
    resolveSuggestedProjectName,
    handleSaveProject,
    resetToNewChat,
  };
}
