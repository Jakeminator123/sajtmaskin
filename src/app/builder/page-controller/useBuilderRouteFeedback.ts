"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/builder/types";
import { debugLog } from "@/lib/utils/debug";

type Params = {
  chatId: string | null;
  isAuditEntry: boolean;
  isChatError: unknown;
  promptId: string | null;
  pendingBriefRef: MutableRefObject<Record<string, unknown> | null>;
  router: { replace: (url: string) => void };
  searchParams: ReadonlyURLSearchParams;
  setAuditPromptLoaded: Dispatch<SetStateAction<boolean>>;
  setChatId: Dispatch<SetStateAction<string | null>>;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setIsIntentionalReset: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

/**
 * Feedback carried on the URL (OAuth/login/verification callbacks), the audit
 * entry's prompt-loaded flag, and the reset that starts a fresh session when
 * the routed chat cannot be loaded.
 */
export function useBuilderRouteFeedback({
  chatId,
  isAuditEntry,
  isChatError,
  promptId,
  pendingBriefRef,
  router,
  searchParams,
  setAuditPromptLoaded,
  setChatId,
  setCurrentPreviewUrl,
  setIsIntentionalReset,
  setMessages,
}: Params) {
  // OAuth callback feedback
  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get("github_connected");
    const username = searchParams.get("github_username");
    const githubError = searchParams.get("github_error");
    const githubErrorReason = searchParams.get("github_error_reason");
    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    const verified = searchParams.get("verified");
    const verificationReason = searchParams.get("reason");

    const hasGitHubFeedback = Boolean(connected || githubError);
    const hasAuthFeedback = Boolean(login || authError || verified);
    if (!hasGitHubFeedback && !hasAuthFeedback) return;

    if (connected) {
      toast.success(username ? `GitHub kopplat: @${username}` : "GitHub kopplat");
    } else if (githubError) {
      const message =
        githubError === "not_authenticated"
          ? "Logga in för att koppla GitHub"
          : githubError === "not_configured"
            ? "GitHub OAuth är inte konfigurerat"
            : githubError === "user_fetch_failed"
              ? "Kunde inte hämta GitHub-användare"
              : githubError === "no_code"
                ? "GitHub gav ingen kod"
                : "GitHub-anslutning misslyckades";
      toast.error(message);
      if (githubErrorReason === "unsafe_return") {
        debugLog("builder", "GitHub OAuth unsafe return URL sanitized");
      }
    }

    if (login === "success") {
      toast.success("Inloggningen lyckades.");
    }
    if (authError) {
      toast.error(authError);
    }
    if (verified === "success") {
      toast.success("E-postadressen är verifierad. Logga in för att fortsätta.");
    } else if (verified === "error") {
      const verificationMessage =
        verificationReason === "missing_token"
          ? "Verifieringslänken saknar token."
          : verificationReason === "invalid_or_expired"
            ? "Verifieringslänken är ogiltig eller har gått ut."
            : verificationReason === "server_error"
              ? "Något gick fel vid e-postverifiering."
              : "Kunde inte verifiera e-postadressen.";
      toast.error(verificationMessage);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("github_connected");
    nextParams.delete("github_username");
    nextParams.delete("github_error");
    nextParams.delete("github_error_reason");
    nextParams.delete("login");
    nextParams.delete("error");
    nextParams.delete("verified");
    nextParams.delete("reason");
    const query = nextParams.toString();
    router.replace(query ? `/builder?${query}` : "/builder");
  }, [searchParams, router]);

  // Audit prompt loaded
  useEffect(() => {
    if (!isAuditEntry) return;
    if (!promptId) setAuditPromptLoaded(true);
  }, [isAuditEntry, promptId, setAuditPromptLoaded]);

  // Chat not found
  useEffect(() => {
    if (!chatId || !isChatError) return;
    debugLog("builder", "Chat not found or error loading chat", chatId);
    toast.error("Chatten kunde inte hittas. Skapar ny session...");
    // Prevent a brief URL/state race where chatIdParam gets re-applied
    // before `router.replace("/builder")` has cleared query params.
    setIsIntentionalReset(true);
    try {
      localStorage.removeItem("sajtmaskin:lastChatId");
    } catch {
      /* ignore */
    }
    pendingBriefRef.current = null;
    setChatId(null);
    setCurrentPreviewUrl(null);
    setMessages([]);
    router.replace("/builder");
  }, [chatId, isChatError, router, setChatId, setCurrentPreviewUrl, setMessages, pendingBriefRef, setIsIntentionalReset]);
}
