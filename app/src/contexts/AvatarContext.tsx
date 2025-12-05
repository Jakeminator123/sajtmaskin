"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import type { AvatarAnimation } from "@/components/avatar/AvatarModel";

// User action types that trigger avatar reactions
export type UserAction =
  | "section_change"
  | "generation_start"
  | "generation_complete"
  | "generation_error"
  | "form_submit"
  | "preview_toggle"
  | "template_select"
  | "code_copy"
  | "download"
  | "first_visit"
  | "user_typing"
  | "user_stopped_typing"
  | "user_playing_game"
  | "thinking"
  | "celebrating"
  | "waiting"
  | "user_inactive";

// Avatar states
export type AvatarState =
  | "loading"
  | "walking_in"
  | "idle"
  | "reacting"
  | "hidden";

// Section types
export type AppSection =
  | "home"
  | "builder"
  | "templates"
  | "audit"
  | "projects"
  | "category";

interface AvatarContextState {
  avatarState: AvatarState;
  currentAnimation: AvatarAnimation;
  currentSection: AppSection;
  tooltipMessage: string | null;
  tooltipVisible: boolean;
  isLoaded: boolean;
  lastAction: UserAction | null;
}

type AvatarAction =
  | { type: "SET_LOADED" }
  | { type: "START_WALK_IN" }
  | { type: "FINISH_WALK_IN" }
  | { type: "SET_ANIMATION"; animation: AvatarAnimation }
  | { type: "SET_SECTION"; section: AppSection }
  | { type: "SHOW_TOOLTIP"; message: string }
  | { type: "HIDE_TOOLTIP" }
  | { type: "TRIGGER_REACTION"; action: UserAction; message?: string }
  | { type: "RETURN_TO_IDLE" }
  | { type: "HIDE_AVATAR" }
  | { type: "SHOW_AVATAR" };

const initialState: AvatarContextState = {
  avatarState: "loading",
  currentAnimation: "idle",
  currentSection: "home",
  tooltipMessage: null,
  tooltipVisible: false,
  isLoaded: false,
  lastAction: null,
};

// Map actions to animations and messages
const ACTION_REACTIONS: Record<
  UserAction,
  { animation: AvatarAnimation; defaultMessage: string; duration?: number }
> = {
  section_change: {
    animation: "talk",
    defaultMessage: "Bra! Utforska gärna runt.",
  },
  generation_start: {
    animation: "shuffle",
    defaultMessage: "Nu genererar vi! Det tar några sekunder...",
    duration: 8000,
  },
  generation_complete: {
    animation: "fun",
    defaultMessage: "Klart! Kolla in resultatet! 🎉",
  },
  generation_error: {
    animation: "talk_left",
    defaultMessage: "Oj, något gick fel. Försök igen!",
  },
  form_submit: {
    animation: "talk_hands",
    defaultMessage: "Bra jobbat!",
  },
  preview_toggle: {
    animation: "idle2",
    defaultMessage: "Snyggt! Kolla förhandsgranskningen.",
  },
  template_select: {
    animation: "confident",
    defaultMessage: "Bra val! Den mallen är populär.",
  },
  code_copy: {
    animation: "confident",
    defaultMessage: "Kopierat! Klistra in i ditt projekt.",
  },
  download: {
    animation: "fun",
    defaultMessage: "Laddar ner... Snart redo! 📦",
  },
  first_visit: {
    animation: "talk_hands",
    defaultMessage: "Välkommen! Jag hjälper dig bygga din sajt.",
  },
  user_typing: {
    animation: "idle3",
    defaultMessage: "",
    duration: 0, // No auto-return, wait for user_stopped_typing
  },
  user_stopped_typing: {
    animation: "talk_left",
    defaultMessage: "Hmm, låt mig tänka...",
    duration: 3000,
  },
  user_playing_game: {
    animation: "fun",
    defaultMessage: "Ha så kul! 🎮",
    duration: 10000,
  },
  thinking: {
    animation: "shuffle",
    defaultMessage: "Låt mig fundera...",
    duration: 5000,
  },
  celebrating: {
    animation: "fun",
    defaultMessage: "Woho! 🎉",
  },
  waiting: {
    animation: "idle2",
    defaultMessage: "Jag väntar här...",
    duration: 6000,
  },
  user_inactive: {
    animation: "sleep",
    defaultMessage: "💤 Zzz...",
    duration: 0, // Stay asleep until user interacts
  },
};

function avatarReducer(
  state: AvatarContextState,
  action: AvatarAction
): AvatarContextState {
  switch (action.type) {
    case "SET_LOADED":
      return { ...state, isLoaded: true };

    case "START_WALK_IN":
      return {
        ...state,
        avatarState: "walking_in",
        currentAnimation: "walk",
      };

    case "FINISH_WALK_IN":
      return {
        ...state,
        avatarState: "idle",
        currentAnimation: "idle",
      };

    case "SET_ANIMATION":
      return { ...state, currentAnimation: action.animation };

    case "SET_SECTION":
      return { ...state, currentSection: action.section };

    case "SHOW_TOOLTIP":
      return {
        ...state,
        tooltipMessage: action.message,
        tooltipVisible: true,
      };

    case "HIDE_TOOLTIP":
      return { ...state, tooltipVisible: false };

    case "TRIGGER_REACTION": {
      const reaction = ACTION_REACTIONS[action.action];
      return {
        ...state,
        avatarState: "reacting",
        currentAnimation: reaction.animation,
        tooltipMessage: action.message || reaction.defaultMessage,
        tooltipVisible: true,
        lastAction: action.action,
      };
    }

    case "RETURN_TO_IDLE":
      return {
        ...state,
        avatarState: "idle",
        currentAnimation: "idle",
        tooltipVisible: false,
      };

    case "HIDE_AVATAR":
      return { ...state, avatarState: "hidden" };

    case "SHOW_AVATAR":
      return {
        ...state,
        avatarState: "idle",
        currentAnimation: "idle",
      };

    default:
      return state;
  }
}

interface AvatarContextValue extends AvatarContextState {
  // Actions
  setLoaded: () => void;
  startWalkIn: () => void;
  finishWalkIn: () => void;
  setSection: (section: AppSection) => void;
  triggerReaction: (action: UserAction, customMessage?: string) => void;
  returnToIdle: () => void;
  showTooltip: (message: string) => void;
  hideTooltip: () => void;
  hideAvatar: () => void;
  showAvatar: () => void;
}

const AvatarContext = createContext<AvatarContextValue | null>(null);

// Idle animation variants for natural variation
// Common idles are weighted more heavily
const IDLE_VARIANTS: AvatarAnimation[] = ["idle", "idle2", "idle3"];

// Special animations that play occasionally when idle (less frequently)
const SPECIAL_IDLE_ANIMATIONS: AvatarAnimation[] = [
  "shuffle",
  "confident",
  "fun",
];

// Get a random idle animation with weighted probability
function getRandomIdleAnimation(): AvatarAnimation {
  // 85% chance for regular idle, 15% for special animation
  if (Math.random() < 0.85) {
    return IDLE_VARIANTS[Math.floor(Math.random() * IDLE_VARIANTS.length)];
  }
  return SPECIAL_IDLE_ANIMATIONS[
    Math.floor(Math.random() * SPECIAL_IDLE_ANIMATIONS.length)
  ];
}

// Time before avatar falls asleep (4 minutes)
const INACTIVITY_SLEEP_DELAY = 4 * 60 * 1000; // 240,000 ms

// Debounce time for reactions (prevents duplicate triggers)
const REACTION_DEBOUNCE_MS = 500;

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(avatarReducer, initialState);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleVariationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isSleepingRef = useRef(false);
  const lastReactionTimeRef = useRef<number>(0);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  // Randomly vary idle animation for natural feel
  useEffect(() => {
    const varyIdleAnimation = () => {
      if (state.avatarState === "idle" && state.isLoaded) {
        const randomAnimation = getRandomIdleAnimation();
        dispatch({ type: "SET_ANIMATION", animation: randomAnimation });

        // If it's a special animation, return to regular idle after it plays
        if (SPECIAL_IDLE_ANIMATIONS.includes(randomAnimation)) {
          setTimeout(() => {
            if (state.avatarState === "idle") {
              const regularIdle =
                IDLE_VARIANTS[Math.floor(Math.random() * IDLE_VARIANTS.length)];
              dispatch({ type: "SET_ANIMATION", animation: regularIdle });
            }
          }, 4000); // Special animations play for ~4 seconds
        }
      }
    };

    // Change idle variant every 6-12 seconds for more liveliness
    const scheduleNextVariation = () => {
      const delay = 6000 + Math.random() * 6000; // 6-12 seconds
      idleVariationRef.current = setTimeout(() => {
        varyIdleAnimation();
        scheduleNextVariation();
      }, delay);
    };

    if (state.avatarState === "idle" && state.isLoaded) {
      scheduleNextVariation();
    }

    return () => {
      if (idleVariationRef.current) {
        clearTimeout(idleVariationRef.current);
      }
    };
  }, [state.avatarState, state.isLoaded]);

  // Inactivity detection - avatar falls asleep after 4 minutes
  useEffect(() => {
    const resetInactivityTimer = () => {
      lastActivityRef.current = Date.now();

      // Clear existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // If sleeping, wake up
      if (isSleepingRef.current && state.avatarState === "reacting") {
        isSleepingRef.current = false;
        dispatch({ type: "RETURN_TO_IDLE" });
      }

      // Start new timer
      inactivityTimerRef.current = setTimeout(() => {
        if (
          state.avatarState === "idle" &&
          state.isLoaded &&
          !isSleepingRef.current
        ) {
          isSleepingRef.current = true;
          dispatch({
            type: "TRIGGER_REACTION",
            action: "user_inactive",
            message: "💤 Zzz...",
          });
        }
      }, INACTIVITY_SLEEP_DELAY);
    };

    // Track user activity
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((event) =>
      window.addEventListener(event, resetInactivityTimer)
    );

    // Start initial timer
    resetInactivityTimer();

    return () => {
      events.forEach((event) =>
        window.removeEventListener(event, resetInactivityTimer)
      );
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [state.avatarState, state.isLoaded]);

  const setLoaded = useCallback(() => {
    dispatch({ type: "SET_LOADED" });
  }, []);

  const startWalkIn = useCallback(() => {
    dispatch({ type: "START_WALK_IN" });
  }, []);

  const finishWalkIn = useCallback(() => {
    dispatch({ type: "FINISH_WALK_IN" });
  }, []);

  const setSection = useCallback((section: AppSection) => {
    dispatch({ type: "SET_SECTION", section });
  }, []);

  const triggerReaction = useCallback(
    (action: UserAction, customMessage?: string) => {
      // Debounce rapid reactions to prevent duplicates
      const now = Date.now();
      if (now - lastReactionTimeRef.current < REACTION_DEBOUNCE_MS) {
        return; // Skip if too soon after last reaction
      }
      lastReactionTimeRef.current = now;

      clearIdleTimeout();
      dispatch({ type: "TRIGGER_REACTION", action, message: customMessage });

      const reaction = ACTION_REACTIONS[action];
      const duration = reaction.duration ?? 4000;

      // Only auto-return to idle if duration > 0
      if (duration > 0) {
        idleTimeoutRef.current = setTimeout(() => {
          dispatch({ type: "RETURN_TO_IDLE" });
        }, duration);
      }
    },
    [clearIdleTimeout]
  );

  const returnToIdle = useCallback(() => {
    clearIdleTimeout();
    dispatch({ type: "RETURN_TO_IDLE" });
  }, [clearIdleTimeout]);

  const showTooltip = useCallback((message: string) => {
    dispatch({ type: "SHOW_TOOLTIP", message });
  }, []);

  const hideTooltip = useCallback(() => {
    dispatch({ type: "HIDE_TOOLTIP" });
  }, []);

  const hideAvatar = useCallback(() => {
    dispatch({ type: "HIDE_AVATAR" });
  }, []);

  const showAvatar = useCallback(() => {
    dispatch({ type: "SHOW_AVATAR" });
  }, []);

  useEffect(() => {
    return () => {
      clearIdleTimeout();
    };
  }, [clearIdleTimeout]);

  const value: AvatarContextValue = {
    ...state,
    setLoaded,
    startWalkIn,
    finishWalkIn,
    setSection,
    triggerReaction,
    returnToIdle,
    showTooltip,
    hideTooltip,
    hideAvatar,
    showAvatar,
  };

  return (
    <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>
  );
}

export function useAvatar() {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error("useAvatar must be used within an AvatarProvider");
  }
  return context;
}

// Export action types for use in other components
export { ACTION_REACTIONS };
