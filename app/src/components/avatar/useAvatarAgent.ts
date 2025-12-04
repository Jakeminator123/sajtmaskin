"use client";

/**
 * useAvatarAgent.ts
 * =================
 * Makes the avatar act as an intelligent agent that monitors
 * what's happening on the site and provides contextual feedback.
 *
 * Features:
 * - Monitors builder state for generation/errors
 * - Provides tips when user seems stuck
 * - Reacts to form validation errors
 * - Celebrates successes
 */

import { useEffect, useRef } from "react";
import { useAvatar } from "@/contexts/AvatarContext";
import { useBuilderStore } from "@/lib/store";

// Tips for different situations
const AGENT_TIPS = {
  emptyPrompt: [
    "Skriv vad du vill bygga! T.ex. 'En landningssida för mitt kafé'",
    "Beskriv din sajt - vad ska den göra?",
    "Prova: 'En portfolio för fotograf med bildgalleri'",
  ],
  shortPrompt: [
    "Ju mer detaljer, desto bättre resultat! 💡",
    "Lägg till mer info - färger, stil, funktioner?",
    "Beskriv målgruppen för bättre design!",
  ],
  generationTakingLong: [
    "Generering tar lite tid - v0 skapar din sajt! ⏳",
    "Snart klar! AI:n bygger din design...",
    "Håll ut! Kvalitet tar tid. 🎨",
  ],
  afterSuccess: [
    "Snyggt! Du kan förfina genom att skriva i chatten.",
    "Bra! Klicka på koden för att se detaljerna.",
    "Nu kan du ladda ner eller fortsätta justera!",
  ],
  afterError: [
    "Något gick fel - prova igen!",
    "Hmm, det funkade inte. Testa en annan formulering?",
    "Fel uppstod. Kolla din internetanslutning.",
  ],
};

/**
 * Hook that makes the avatar act as an agent
 * monitoring user activity and providing feedback
 */
export function useAvatarAgent() {
  const { triggerReaction, avatarState, isLoaded } = useAvatar();

  // Get builder state
  const { isLoading, currentCode, demoUrl, messages } = useBuilderStore();

  // Track previous states
  const prevIsLoading = useRef(isLoading);
  const prevDemoUrl = useRef(demoUrl);
  const loadingStartTime = useRef<number | null>(null);
  const hasGivenLoadingTip = useRef(false);

  // Monitor generation state changes
  useEffect(() => {
    if (!isLoaded || avatarState === "hidden") return;

    // Generation started
    if (isLoading && !prevIsLoading.current) {
      loadingStartTime.current = Date.now();
      hasGivenLoadingTip.current = false;
      triggerReaction(
        "generation_start",
        "Nu kör vi! Genererar din sajt... 🚀"
      );
    }

    // Generation completed successfully
    if (
      !isLoading &&
      prevIsLoading.current &&
      demoUrl &&
      demoUrl !== prevDemoUrl.current
    ) {
      const tip =
        AGENT_TIPS.afterSuccess[
          Math.floor(Math.random() * AGENT_TIPS.afterSuccess.length)
        ];
      triggerReaction("generation_complete", tip);
      loadingStartTime.current = null;
    }

    // Generation failed (loading stopped but no new demoUrl)
    if (
      !isLoading &&
      prevIsLoading.current &&
      !demoUrl &&
      messages.length > 0
    ) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        lastMessage?.content?.toLowerCase().includes("fel")
      ) {
        const tip =
          AGENT_TIPS.afterError[
            Math.floor(Math.random() * AGENT_TIPS.afterError.length)
          ];
        triggerReaction("generation_error", tip);
      }
    }

    prevIsLoading.current = isLoading;
    prevDemoUrl.current = demoUrl;
  }, [isLoading, demoUrl, messages, isLoaded, avatarState, triggerReaction]);

  // Give tip if generation takes too long (>15 seconds)
  useEffect(() => {
    if (!isLoading || !loadingStartTime.current || hasGivenLoadingTip.current)
      return;

    const checkTimer = setInterval(() => {
      if (loadingStartTime.current) {
        const elapsed = Date.now() - loadingStartTime.current;
        if (elapsed > 15000 && !hasGivenLoadingTip.current) {
          hasGivenLoadingTip.current = true;
          const tip =
            AGENT_TIPS.generationTakingLong[
              Math.floor(Math.random() * AGENT_TIPS.generationTakingLong.length)
            ];
          triggerReaction("form_submit", tip);
        }
      }
    }, 5000);

    return () => clearInterval(checkTimer);
  }, [isLoading, triggerReaction]);

  return {
    // Expose methods for manual triggers if needed
    suggestPromptTip: () => {
      const tip =
        AGENT_TIPS.emptyPrompt[
          Math.floor(Math.random() * AGENT_TIPS.emptyPrompt.length)
        ];
      triggerReaction("section_change", tip);
    },
    suggestDetailsTip: () => {
      const tip =
        AGENT_TIPS.shortPrompt[
          Math.floor(Math.random() * AGENT_TIPS.shortPrompt.length)
        ];
      triggerReaction("preview_toggle", tip);
    },
  };
}

export default useAvatarAgent;
