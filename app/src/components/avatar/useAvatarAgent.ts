"use client";

/**
 * useAvatarAgent.ts
 * =================
 * Makes the avatar act as an intelligent agent that monitors
 * what's happening on the site and provides contextual feedback.
 *
 * IMPROVED: Less intrusive, smarter timing, tracks shown tips
 */

import { useEffect, useRef, useCallback } from "react";
import { useAvatar } from "@/contexts/AvatarContext";
import { useBuilderStore } from "@/lib/store";

// Track which tips have been shown this session
const shownTips = new Set<string>();
let tipCount = 0;
const MAX_TIPS_PER_SESSION = 5;

// Shorter, less intrusive tips
const AGENT_TIPS = {
  generationTakingLong: ["Generering pågår... ⏳", "Snart klar!"],
  afterSuccess: ["Klar! Förfina i chatten.", "Snyggt! 🎉"],
  afterError: ["Något gick fel - prova igen."],
};

// Get a tip that hasn't been shown yet
function getUniqueTip(tips: string[]): string | null {
  if (tipCount >= MAX_TIPS_PER_SESSION) return null;

  const unshown = tips.filter((t) => !shownTips.has(t));
  if (unshown.length === 0) return null;

  const tip = unshown[Math.floor(Math.random() * unshown.length)];
  shownTips.add(tip);
  tipCount++;
  return tip;
}

/**
 * Hook that makes the avatar act as an agent
 * monitoring user activity - now less intrusive
 */
export function useAvatarAgent() {
  const { triggerReaction, avatarState, isLoaded } = useAvatar();

  // Get builder state
  const { isLoading, demoUrl, messages } = useBuilderStore();

  // Track previous states
  const prevIsLoading = useRef(isLoading);
  const prevDemoUrl = useRef(demoUrl);
  const loadingStartTime = useRef<number | null>(null);
  const hasGivenLoadingTip = useRef(false);
  const lastReactionTime = useRef(0);

  // Throttle reactions - minimum 10 seconds between
  const canReact = useCallback(() => {
    const now = Date.now();
    if (now - lastReactionTime.current < 10000) return false;
    lastReactionTime.current = now;
    return true;
  }, []);

  // Monitor generation state changes - less chatty
  useEffect(() => {
    if (!isLoaded || avatarState === "hidden") return;

    // Generation started - just animate, no message
    if (isLoading && !prevIsLoading.current) {
      loadingStartTime.current = Date.now();
      hasGivenLoadingTip.current = false;
      // Silent reaction - just animation change
      triggerReaction("generation_start", "");
    }

    // Generation completed successfully
    if (
      !isLoading &&
      prevIsLoading.current &&
      demoUrl &&
      demoUrl !== prevDemoUrl.current
    ) {
      if (canReact()) {
        const tip = getUniqueTip(AGENT_TIPS.afterSuccess);
        if (tip) {
          triggerReaction("generation_complete", tip);
        } else {
          // Just animate without text
          triggerReaction("generation_complete", "");
        }
      }
      loadingStartTime.current = null;
    }

    // Generation failed - only react if clear error
    if (
      !isLoading &&
      prevIsLoading.current &&
      !demoUrl &&
      messages.length > 0
    ) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        lastMessage?.content?.toLowerCase().includes("fel") &&
        canReact()
      ) {
        const tip = getUniqueTip(AGENT_TIPS.afterError);
        if (tip) triggerReaction("generation_error", tip);
      }
    }

    prevIsLoading.current = isLoading;
    prevDemoUrl.current = demoUrl;
  }, [
    isLoading,
    demoUrl,
    messages,
    isLoaded,
    avatarState,
    triggerReaction,
    canReact,
  ]);

  // Give tip only if generation takes very long (>45 seconds)
  useEffect(() => {
    if (!isLoading || !loadingStartTime.current || hasGivenLoadingTip.current)
      return;

    const checkTimer = setTimeout(() => {
      if (loadingStartTime.current && canReact()) {
        const elapsed = Date.now() - loadingStartTime.current;
        if (elapsed > 45000 && !hasGivenLoadingTip.current) {
          hasGivenLoadingTip.current = true;
          const tip = getUniqueTip(AGENT_TIPS.generationTakingLong);
          if (tip) triggerReaction("form_submit", tip);
        }
      }
    }, 45000);

    return () => clearTimeout(checkTimer);
  }, [isLoading, triggerReaction, canReact]);

  return {
    suggestPromptTip: () => {
      // Disabled - less intrusive
    },
    suggestDetailsTip: () => {
      // Disabled - less intrusive
    },
  };
}

export default useAvatarAgent;
