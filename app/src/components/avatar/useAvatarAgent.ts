"use client";

/**
 * useAvatarAgent.ts
 * =================
 * Makes the avatar act as an intelligent agent that monitors
 * what's happening on the site and provides contextual feedback.
 *
 * ENHANCED: Now supports project analysis, points, and value tracking
 */

import { useEffect, useRef, useCallback } from "react";
import { useAvatar, AppSection } from "@/contexts/AvatarContext";
import { useBuilderStore } from "@/lib/store";

// Track which tips have been shown this session
const shownTips = new Set<string>();
let tipCount = 0;
const MAX_TIPS_PER_SESSION = 8;
const ANALYSIS_COOLDOWN_MS = 90_000; // avoid spamming analysis calls

// Tips for different scenarios
const AGENT_TIPS = {
  generationTakingLong: ["Generering pågår... ⏳", "Snart klar!"],
  afterSuccess: ["Klar! Förfina i chatten.", "Snyggt! 🎉", "Bra jobbat! ✨"],
  afterError: ["Något gick fel - prova igen."],
  projectOpened: ["Kolla igenom projektet!", "Jag kan analysera din kod."],
  firstProject: [
    "Ditt första projekt! 🎉",
    "Jag kan hjälpa dig förbättra det.",
  ],
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

interface UseAvatarAgentOptions {
  projectId?: string;
  section?: AppSection;
}

/**
 * Hook that makes the avatar act as an intelligent agent
 * monitoring user activity and providing contextual help
 */
export function useAvatarAgent(options: UseAvatarAgentOptions = {}) {
  const { projectId, section } = options;

  const {
    triggerReaction,
    avatarState,
    isLoaded,
    addPoints,
    setValueMessage,
    setCurrentProject,
    currentProjectId,
    setConversationId,
  } = useAvatar();

  // Get builder state
  const { isLoading, demoUrl, messages, currentCode } = useBuilderStore();

  // Track previous states
  const prevIsLoading = useRef(isLoading);
  const prevDemoUrl = useRef(demoUrl);
  const prevProjectId = useRef<string | undefined>(undefined);
  const loadingStartTime = useRef<number | null>(null);
  const hasGivenLoadingTip = useRef(false);
  const lastReactionTime = useRef(0);
  const hasAnalyzedProject = useRef(false);
  const lastAnalysisAt = useRef<number>(0);
  const hasRequestedForProject = useRef<string | null>(null);

  // Throttle reactions - minimum 8 seconds between
  const canReact = useCallback(() => {
    const now = Date.now();
    if (now - lastReactionTime.current < 8000) return false;
    lastReactionTime.current = now;
    return true;
  }, []);

  const canRequestAnalysis = useCallback(() => {
    const now = Date.now();
    if (now - lastAnalysisAt.current < ANALYSIS_COOLDOWN_MS) return false;
    lastAnalysisAt.current = now;
    return true;
  }, []);

  // Request proactive analysis of current project
  const requestAnalysis = useCallback(
    async (lastAction: string = "opened_project") => {
      if (!projectId) return;

      try {
        const response = await fetch("/api/avatar-guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "[PROACTIVE_TIP]",
            currentSection: section || "builder",
            lastAction,
            conversationHistory: [],
            projectId,
          }),
        });

        if (!response.ok) return;

        const data = await response.json();

        if (data.responseId) {
          setConversationId(data.responseId);
        }

        if (data.points > 0) {
          addPoints(data.points);
        }

        if (data.valueMessage) {
          setValueMessage(data.valueMessage);
        }

        if (data.message) {
          triggerReaction("form_submit", data.message);
        }
      } catch (error) {
        console.error("[AvatarAgent] Analysis request failed:", error);
      }
    },
    [
      projectId,
      section,
      triggerReaction,
      addPoints,
      setValueMessage,
      setConversationId,
    ]
  );

  // Track current project
  useEffect(() => {
    if (projectId && projectId !== currentProjectId) {
      setCurrentProject(projectId);
    }
  }, [projectId, currentProjectId, setCurrentProject]);

  // Monitor project changes - offer to analyze new projects
  useEffect(() => {
    if (!isLoaded || avatarState === "hidden") return;

    // Project just opened
    if (projectId && projectId !== prevProjectId.current && canReact()) {
      prevProjectId.current = projectId;

      // First project ever?
      if (!hasAnalyzedProject.current) {
        hasAnalyzedProject.current = true;
        const tip = getUniqueTip(AGENT_TIPS.firstProject);
        if (tip) {
          triggerReaction("celebrating", tip);
          addPoints(10);
          setValueMessage("Du har startat ditt första projekt!");
        }
      } else {
        const tip = getUniqueTip(AGENT_TIPS.projectOpened);
        if (tip) {
          triggerReaction("template_select", tip);
        }
      }

      // Fire a proactive analysis once per project
      if (projectId && canRequestAnalysis()) {
        hasRequestedForProject.current = projectId;
        requestAnalysis("opened_project");
      }
    }
  }, [
    projectId,
    isLoaded,
    avatarState,
    canReact,
    triggerReaction,
    addPoints,
    setValueMessage,
    canRequestAnalysis,
    requestAnalysis,
  ]);

  // Monitor generation state changes
  useEffect(() => {
    if (!isLoaded || avatarState === "hidden") return;

    // Generation started
    if (isLoading && !prevIsLoading.current) {
      loadingStartTime.current = Date.now();
      hasGivenLoadingTip.current = false;
      // Show thinking animation without text
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
          // Award points for successful generation
          addPoints(5);
          setValueMessage("Din sajt växer! Fortsätt så.");
        } else {
          triggerReaction("generation_complete", "");
        }
      }
      loadingStartTime.current = null;

      // Proactive follow-up after successful generation
      if (projectId && canRequestAnalysis()) {
        requestAnalysis("generation_complete");
      }
    }

    // Generation failed
    if (
      !isLoading &&
      prevIsLoading.current &&
      !demoUrl &&
      messages.length > 0
    ) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        (lastMessage?.content?.toLowerCase().includes("fel") ||
          lastMessage?.content?.toLowerCase().includes("error")) &&
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
    addPoints,
    setValueMessage,
    canReact,
    projectId,
    canRequestAnalysis,
    requestAnalysis,
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
          if (tip) triggerReaction("waiting", tip);
        }
      }
    }, 45000);

    return () => clearTimeout(checkTimer);
  }, [isLoading, triggerReaction, canReact]);

  return {
    requestAnalysis,
    hasProject: !!projectId,
    canReact,
  };
}

export default useAvatarAgent;
