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
  | "first_visit";

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
  { animation: AvatarAnimation; defaultMessage: string }
> = {
  section_change: {
    animation: "talk",
    defaultMessage: "Bra! Utforska gärna runt.",
  },
  generation_start: {
    animation: "shuffle",
    defaultMessage: "Nu genererar vi! Det tar några sekunder...",
  },
  generation_complete: {
    animation: "confident",
    defaultMessage: "Klart! Kolla in resultatet!",
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
    animation: "talk",
    defaultMessage: "Bra val! Den mallen är populär.",
  },
  code_copy: {
    animation: "confident",
    defaultMessage: "Kopierat! Klistra in i ditt projekt.",
  },
  download: {
    animation: "talk_hands",
    defaultMessage: "Laddar ner... Snart redo!",
  },
  first_visit: {
    animation: "talk",
    defaultMessage: "Välkommen! Jag hjälper dig bygga din sajt.",
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

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(avatarReducer, initialState);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

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
      clearIdleTimeout();
      dispatch({ type: "TRIGGER_REACTION", action, message: customMessage });

      // Auto-return to idle after animation
      idleTimeoutRef.current = setTimeout(() => {
        dispatch({ type: "RETURN_TO_IDLE" });
      }, 4000);
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
