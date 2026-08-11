"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { toast } from "sonner";
import { normalizeBuildIntent, type BuildIntent, type BuildMethod } from "@/lib/builder/build-intent";
import { resetInitBuildChoices } from "@/lib/builder/init-build-choices";
import type { ChatMessage } from "@/lib/builder/types";
import { debugLog } from "@/lib/utils/debug";
import type { BuilderEntryState } from "../builder-entry";

/** Max non-404 failures before stopping prompt handoff retries (avoids toast/network spam). */
const MAX_PROMPT_HANDOFF_RETRIES = 5;

type Params = {
  entry: BuilderEntryState;
  chatId: string | null;
  chatIdParam: string | null;
  promptId: string | null;
  promptParam: string | null;
  projectParam: string | null;
  buildIntentParam: BuildIntent;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isCreatingChat: boolean;
  fetchUser: () => Promise<unknown>;
  cancelActiveGeneration: () => void;
  pendingBriefRef: MutableRefObject<Record<string, unknown> | null>;
  promptFetchDoneRef: MutableRefObject<string | null>;
  promptFetchInFlightRef: MutableRefObject<string | null>;
  router: { replace: (url: string) => void };
  searchParams: ReadonlyURLSearchParams;
  setAppProjectId: Dispatch<SetStateAction<string | null>>;
  setAuditPromptLoaded: Dispatch<SetStateAction<boolean>>;
  setAuthModalReason: Dispatch<SetStateAction<"builder" | "save" | null>>;
  setBuildIntent: Dispatch<SetStateAction<BuildIntent>>;
  setBuildMethod: Dispatch<SetStateAction<BuildMethod | null>>;
  setChatId: Dispatch<SetStateAction<string | null>>;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setEntryIntentActive: Dispatch<SetStateAction<boolean>>;
  setExternalProjectId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setResolvedPrompt: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
};

/**
 * Route/entry hydration on mount: prompt-handoff fetch, auth bootstrap,
 * build intent/method from the URL, and the resets that keep a fresh builder
 * entry from inheriting the previous session's chat state.
 */
export function useBuilderEntryHydration({
  entry,
  chatId,
  chatIdParam,
  promptId,
  promptParam,
  projectParam,
  buildIntentParam,
  isAuthenticated,
  isAuthLoading,
  isCreatingChat,
  fetchUser,
  cancelActiveGeneration,
  pendingBriefRef,
  promptFetchDoneRef,
  promptFetchInFlightRef,
  router,
  searchParams,
  setAppProjectId,
  setAuditPromptLoaded,
  setAuthModalReason,
  setBuildIntent,
  setBuildMethod,
  setChatId,
  setCurrentPreviewUrl,
  setEntryIntentActive,
  setExternalProjectId,
  setMessages,
  setResolvedPrompt,
  setSelectedVersionId,
}: Params) {
  const [promptFetchRetryNonce, setPromptFetchRetryNonce] = useState(0);

  // Reset handoff retry counter when navigating to a different prompt id.
  useEffect(() => {
    setPromptFetchRetryNonce(0);
  }, [promptId]);

  // Prompt fetch
  useEffect(() => {
    if (entry.isTemplateEntry) return;
    if (!entry.shouldFetchPromptHandoff || !promptId) return;
    if (promptFetchDoneRef.current === promptId) return;
    if (promptFetchInFlightRef.current === promptId) return;
    promptFetchInFlightRef.current = promptId;
    let isActive = true;
    const controller = new AbortController();
    let retryTimer: number | null = null;

    const fetchPrompt = async () => {
      let shouldClearPromptId = false;
      try {
        const response = await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          prompt?: string;
          error?: string;
          projectId?: string | null;
        } | null;
        if (!response.ok || !data?.prompt) {
          const failure = new Error(data?.error || "Prompten hittades inte") as Error & {
            status?: number;
          };
          failure.status = response.status;
          throw failure;
        }
        if (!isActive) return;
        promptFetchDoneRef.current = promptId;
        setEntryIntentActive(true);
        setResolvedPrompt(data.prompt);
        if (data.projectId) {
          setAppProjectId((prev) => prev ?? data.projectId!);
        }
        shouldClearPromptId = true;
      } catch (error) {
        if (!isActive) return;
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        const status = typeof (error as { status?: unknown })?.status === "number"
          ? ((error as { status?: number }).status ?? null)
          : null;
        if (status === 404) {
          debugLog("builder", "Prompt handoff missing", error);
          toast.error("Prompten hittades inte eller har redan använts.");
          setResolvedPrompt(null);
          setEntryIntentActive(false);
          promptFetchDoneRef.current = promptId;
          shouldClearPromptId = true;
          return;
        }
        debugLog("builder", "Prompt handoff fetch failed", error);
        if (promptFetchRetryNonce >= MAX_PROMPT_HANDOFF_RETRIES) {
          toast.error("Kunde inte hämta prompten efter flera försök. Ladda om sidan eller försök senare.", {
            id: "prompt-handoff-gave-up",
          });
          promptFetchDoneRef.current = promptId;
          shouldClearPromptId = true;
          return;
        }
        toast.error("Kunde inte hämta prompten just nu. Försök igen.", {
          id: "prompt-handoff-retry",
        });
        const delayMs = Math.min(1500 * 2 ** promptFetchRetryNonce, 12_000);
        retryTimer = window.setTimeout(() => {
          if (!isActive) return;
          setPromptFetchRetryNonce((value) => value + 1);
        }, delayMs);
      } finally {
        if (promptFetchInFlightRef.current === promptId) {
          promptFetchInFlightRef.current = null;
        }
        if (isActive) {
          setAuditPromptLoaded(true);
          if (shouldClearPromptId) {
            const nextParams = new URLSearchParams(searchParams.toString());
            nextParams.delete("promptId");
            const query = nextParams.toString();
            router.replace(query ? `/builder?${query}` : "/builder");
          }
        }
      }
    };

    void fetchPrompt();
    return () => {
      isActive = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      controller.abort();
      if (promptFetchInFlightRef.current === promptId) {
        promptFetchInFlightRef.current = null;
      }
    };
  }, [
    entry.isTemplateEntry,
    entry.shouldFetchPromptHandoff,
    promptId,
    promptFetchDoneRef,
    promptFetchInFlightRef,
    promptFetchRetryNonce,
    setEntryIntentActive,
    setResolvedPrompt,
    setAppProjectId,
    setAuditPromptLoaded,
    router,
    searchParams,
  ]);

  // Auth fetch
  useEffect(() => {
    fetchUser().catch(() => {});
  }, [fetchUser]);

  // Build intent / method sync
  useEffect(() => {
    setBuildIntent(normalizeBuildIntent(buildIntentParam));
  }, [buildIntentParam, setBuildIntent]);

  useEffect(() => {
    setBuildMethod(entry.buildMethodParam);
  }, [entry.buildMethodParam, setBuildMethod]);

  // Auth modal
  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated) setAuthModalReason(null);
  }, [isAuthLoading, isAuthenticated, setAuthModalReason]);

  // Project param -> appProjectId
  useEffect(() => {
    if (projectParam) {
      setAppProjectId(projectParam);
    }
  }, [projectParam, setAppProjectId]);

  // Route entries without an explicit chatId must not inherit stale chat state
  // from the previous builder session. This is especially important when we
  // arrive via prompt handoff (`promptId`) or a fresh project URL.
  // Skip this reset if a create-chat request is in flight (chatId will arrive via SSE).
  useEffect(() => {
    if (chatIdParam) return;
    if (isCreatingChat) return;

    const routeRepresentsFreshBuilderEntry =
      entry.entryKind === "prompt-handoff" ||
      entry.entryKind === "template" ||
      entry.entryKind === "audit" ||
      Boolean(projectParam);
    if (!routeRepresentsFreshBuilderEntry) return;

    const shouldResetChatState = Boolean(chatId);
    const shouldResetResolvedPrompt = promptId !== null || promptParam !== null;
    if (!shouldResetChatState && !shouldResetResolvedPrompt) return;

    pendingBriefRef.current = null;
    // Drop abandoned Byggval (plan/contract never produced a version) so the
    // next new chat in this SPA session cannot inherit the previous panel.
    resetInitBuildChoices();

    if (shouldResetChatState) {
      // PR #355-triage #7 (backlog): en pågående generation-stream från den
      // förra sessionen måste avbrytas INNAN chat-state nollställs — annars
      // fortsätter den gamla streamen skriva meddelanden/versioner in i den
      // färska sessionens tomma state. Abort är idempotent (no-op utan
      // aktiv stream) och triggar client-abort-vägen, inte ett fel-svar.
      cancelActiveGeneration();
      setChatId(null);
      setMessages([]);
      setCurrentPreviewUrl(null);
      setSelectedVersionId(null);
      setExternalProjectId(null);
    }

    if (shouldResetResolvedPrompt) {
      promptFetchDoneRef.current = null;
      setResolvedPrompt(promptParam?.trim() || null);
    }
  }, [
    chatIdParam,
    projectParam,
    entry.entryKind,
    chatId,
    isCreatingChat,
    promptId,
    promptParam,
    pendingBriefRef,
    promptFetchDoneRef,
    cancelActiveGeneration,
    setChatId,
    setMessages,
    setCurrentPreviewUrl,
    setSelectedVersionId,
    setExternalProjectId,
    setResolvedPrompt,
  ]);

  // Load latest chat for project when project is in URL but chatId is not
  useEffect(() => {
    if (!projectParam || chatIdParam || chatId) return;
    if (entry.entryKind !== "project-restore") return;
    let isActive = true;
    const controller = new AbortController();

    const loadProjectChat = async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectParam!)}/chat`,
          { signal: controller.signal },
        );
        if (!res.ok || !isActive) return;
        const data = (await res.json()) as {
          chatId?: string | null;
        };
        const restoredChatId =
          typeof data.chatId === "string" && data.chatId.trim().length > 0
            ? data.chatId
            : null;

        if (restoredChatId && isActive) {
          setChatId(restoredChatId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", projectParam!);
          params.set("chatId", restoredChatId);
          router.replace(`/builder?${params.toString()}`);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("builder", "Failed to load project chat", error);
      }
    };

    void loadProjectChat();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [projectParam, chatIdParam, chatId, entry.entryKind, setChatId, router, searchParams]);
}
