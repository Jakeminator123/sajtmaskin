"use client";

/**
 * useAvatarBehavior.ts
 * ====================
 * Custom hook that manages avatar behavior and state transitions.
 *
 * Handles:
 * - Initial walk-in animation sequence
 * - Section change reactions
 * - Welcome message on first visit
 * - Proper cleanup of timers to prevent memory leaks
 */

import { useEffect, useRef, useCallback } from "react";
import { useAvatar, AppSection } from "@/contexts/AvatarContext";

// ============================================================================
// TYPES
// ============================================================================

interface UseAvatarBehaviorOptions {
  /** Current section the user is viewing */
  section: AppSection;
  /** Delay before walk-in animation starts (ms) */
  walkInDelay?: number;
  /** Duration of walk-in animation (ms) */
  walkInDuration?: number;
  /** Whether to show welcome message on first visit */
  showWelcome?: boolean;
}

// ============================================================================
// SECTION MESSAGES
// ============================================================================

/** Messages shown when user navigates to different sections */
const SECTION_MESSAGES: Record<AppSection, string> = {
  home: "Välkommen tillbaka! Redo att bygga?",
  builder: "Byggaren! Här skapar vi magi. ✨",
  templates: "Kolla in våra färdiga mallar!",
  audit: "Låt oss analysera din nuvarande sajt.",
  projects: "Här är dina sparade projekt.",
  category: "Utforska våra kategorier!",
};

// ============================================================================
// HOOK
// ============================================================================

export function useAvatarBehavior({
  section,
  walkInDelay = 1500,
  walkInDuration = 2500,
  showWelcome = true,
}: UseAvatarBehaviorOptions) {
  const {
    avatarState,
    isLoaded,
    currentSection,
    setLoaded,
    startWalkIn,
    finishWalkIn,
    setSection,
    triggerReaction,
  } = useAvatar();

  // Refs for tracking state and timers
  const hasShownWelcome = useRef(false);
  const walkInTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finishWalkTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Called when the 3D model is ready.
   * Triggers the walk-in animation sequence.
   */
  const handleModelLoaded = useCallback(() => {
    if (isLoaded) return; // Already loaded

    setLoaded();

    // Start walk-in animation after delay
    walkInTimerRef.current = setTimeout(() => {
      startWalkIn();

      // Finish walk-in and show welcome message
      finishWalkTimerRef.current = setTimeout(() => {
        finishWalkIn();

        // Show welcome message on first visit
        if (showWelcome && !hasShownWelcome.current) {
          hasShownWelcome.current = true;
          setTimeout(() => triggerReaction("first_visit"), 500);
        }
      }, walkInDuration);
    }, walkInDelay);
  }, [
    isLoaded,
    setLoaded,
    startWalkIn,
    finishWalkIn,
    showWelcome,
    triggerReaction,
    walkInDelay,
    walkInDuration,
  ]);

  // Handle section changes
  useEffect(() => {
    if (section !== currentSection) {
      setSection(section);

      // Trigger reaction only if avatar is idle and loaded
      if (avatarState === "idle" && isLoaded) {
        triggerReaction("section_change", SECTION_MESSAGES[section]);
      }
    }
  }, [
    section,
    currentSection,
    avatarState,
    isLoaded,
    setSection,
    triggerReaction,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (walkInTimerRef.current) clearTimeout(walkInTimerRef.current);
      if (finishWalkTimerRef.current) clearTimeout(finishWalkTimerRef.current);
    };
  }, []);

  return {
    handleModelLoaded,
    avatarState,
    isLoaded,
  };
}

export default useAvatarBehavior;
