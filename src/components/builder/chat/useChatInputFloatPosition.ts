"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import {
  clearChatInputFloatPosition,
  clampChatInputFloatPosition,
  defaultChatInputFloatPosition,
  readChatInputFloatPosition,
  writeChatInputFloatPosition,
  type ChatInputFloatBoxSize,
  type ChatInputFloatPosition,
} from "@/lib/builder/chat-input-float-position";

export interface ChatInputFloatPositionState {
  position: ChatInputFloatPosition | null;
  /** Apply a raw position, clamp against current box/viewport, persist. */
  setPosition: (next: ChatInputFloatPosition, box: ChatInputFloatBoxSize) => void;
  /** Place at default bottom-center (and persist when chatId exists). */
  placeDefault: (box: ChatInputFloatBoxSize) => ChatInputFloatPosition;
  /** Drop in-memory + stored position (e.g. when expanding chat). */
  resetPosition: () => void;
}

function viewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Desktop float position for the collapsed chat composer. Per chat, survives
 * reload. Null until placed (saved or default after measure).
 */
export function useChatInputFloatPosition(chatId: string | null): ChatInputFloatPositionState {
  const [position, setPositionState] = useState<ChatInputFloatPosition | null>(null);

  // Layout (not paint) so float placement never writes the previous chat's
  // coords into the new chatId key on a same-tick chat switch.
  useLayoutEffect(() => {
    setPositionState(readChatInputFloatPosition(chatId));
  }, [chatId]);

  const setPosition = useCallback(
    (next: ChatInputFloatPosition, box: ChatInputFloatBoxSize) => {
      const clamped = clampChatInputFloatPosition(next, box, viewportSize());
      setPositionState((previous) => {
        if (previous && previous.x === clamped.x && previous.y === clamped.y) {
          return previous;
        }
        writeChatInputFloatPosition(chatId, clamped);
        return clamped;
      });
    },
    [chatId],
  );

  const placeDefault = useCallback(
    (box: ChatInputFloatBoxSize) => {
      const next = defaultChatInputFloatPosition(box, viewportSize());
      setPositionState((previous) => {
        if (previous && previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        writeChatInputFloatPosition(chatId, next);
        return next;
      });
      return next;
    },
    [chatId],
  );

  const resetPosition = useCallback(() => {
    setPositionState(null);
    clearChatInputFloatPosition(chatId);
  }, [chatId]);

  return { position, setPosition, placeDefault, resetPosition };
}
