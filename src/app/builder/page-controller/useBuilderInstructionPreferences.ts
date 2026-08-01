"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import { useLocalStorageBooleanSync } from "@/lib/hooks/useLocalStorageSync";

type Params = {
  chatId: string | null;
  showStructuredChat: boolean;
  setShowStructuredChat: Dispatch<SetStateAction<boolean>>;
  tipsEnabled: boolean;
  setTipsEnabled: Dispatch<SetStateAction<boolean>>;
  customInstructions: string;
  setCustomInstructions: Dispatch<SetStateAction<string>>;
  applyInstructionsOnce: boolean;
  setApplyInstructionsOnce: Dispatch<SetStateAction<boolean>>;
  hasLoadedInstructionsRef: MutableRefObject<boolean>;
  hasLoadedInstructionsOnceRef: MutableRefObject<boolean>;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
};

/**
 * Chat-scoped UI/instruction preferences in localStorage: structured chat,
 * OpenClaw tips and the per-chat custom instructions (plus the apply-once flag).
 */
export function useBuilderInstructionPreferences({
  chatId,
  showStructuredChat,
  setShowStructuredChat,
  tipsEnabled,
  setTipsEnabled,
  customInstructions,
  setCustomInstructions,
  applyInstructionsOnce,
  setApplyInstructionsOnce,
  hasLoadedInstructionsRef,
  hasLoadedInstructionsOnceRef,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
}: Params) {
  useLocalStorageBooleanSync("sajtmaskin:structuredChat", showStructuredChat, setShowStructuredChat);
  useLocalStorageBooleanSync("sajtmaskin:openclawTipsEnabled", tipsEnabled, setTipsEnabled);

  // Custom instructions load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructionsRef.current = false;
      return;
    }
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsRef.current;
    if (stored !== null) {
      setCustomInstructions(stored);
    } else if (pending) {
      const normalized = pending.trim();
      setCustomInstructions(normalized);
      try {
        localStorage.setItem(storageKey, normalized);
      } catch {
        /* ignore */
      }
    } else {
      setCustomInstructions("");
    }
    pendingInstructionsRef.current = null;
    hasLoadedInstructionsRef.current = true;
  }, [chatId, hasLoadedInstructionsRef, pendingInstructionsRef, setCustomInstructions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructionsRef.current) return;
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    const normalized = customInstructions.trim();
    try {
      if (normalized) {
        localStorage.setItem(storageKey, normalized);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [chatId, customInstructions, hasLoadedInstructionsRef]);

  // Apply-instructions-once load / save
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructionsOnceRef.current = false;
      setApplyInstructionsOnce(false);
      return;
    }
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsOnceRef.current;
    if (stored !== null) {
      setApplyInstructionsOnce(stored === "true");
    } else if (pending !== null) {
      setApplyInstructionsOnce(pending);
      try {
        localStorage.setItem(storageKey, String(pending));
      } catch {
        /* ignore */
      }
    } else {
      setApplyInstructionsOnce(false);
    }
    pendingInstructionsOnceRef.current = null;
    hasLoadedInstructionsOnceRef.current = true;
  }, [chatId, hasLoadedInstructionsOnceRef, pendingInstructionsOnceRef, setApplyInstructionsOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructionsOnceRef.current) return;
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    try {
      if (applyInstructionsOnce) {
        localStorage.setItem(storageKey, "true");
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [chatId, applyInstructionsOnce, hasLoadedInstructionsOnceRef]);
}
