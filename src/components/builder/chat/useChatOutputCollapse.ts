"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readChatOutputCollapsed,
  writeChatOutputCollapsed,
} from "@/lib/builder/chat-output-collapse";

interface ChatOutputCollapseState {
  isCollapsed: boolean;
  toggle: () => void;
  expand: () => void;
}

/**
 * Ö9: chattens utdata kan fällas ned till inputens överkant. Läget är per
 * chat och överlever omladdning (localStorage, se `chat-output-collapse.ts`).
 *
 * Läses först efter mount — servern kan inte känna till webbläsarens
 * preferens, och att rendera nedfällt på servern hade gett en hydreringsmiss
 * för alla som inte fällt ned.
 */
export function useChatOutputCollapse(chatId: string | null): ChatOutputCollapseState {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(readChatOutputCollapsed(chatId));
  }, [chatId]);

  const toggle = useCallback(() => {
    setIsCollapsed((previous) => {
      const next = !previous;
      writeChatOutputCollapsed(chatId, next);
      return next;
    });
  }, [chatId]);

  const expand = useCallback(() => {
    setIsCollapsed((previous) => {
      if (!previous) return previous;
      writeChatOutputCollapsed(chatId, false);
      return false;
    });
  }, [chatId]);

  return { isCollapsed, toggle, expand };
}
