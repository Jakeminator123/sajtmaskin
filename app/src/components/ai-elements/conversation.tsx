"use client";

/**
 * Conversation Component (AI Elements)
 *
 * Container for chat messages with auto-scroll functionality.
 * Based on Vercel AI Elements specification.
 */

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// CONTEXT
// ============================================================================

interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(
  null
);

export function useConversation() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("useConversation must be used within a Conversation");
  }
  return context;
}

// ============================================================================
// CONVERSATION ROOT
// ============================================================================

export interface ConversationProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Conversation({
  children,
  className,
  ...props
}: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const threshold = 100;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold);
    }
  };

  return (
    <ConversationContext.Provider
      value={{ scrollRef, isAtBottom, scrollToBottom }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn("relative flex flex-col", className)}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
}

// ============================================================================
// CONVERSATION CONTENT
// ============================================================================

export interface ConversationContentProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ConversationContent({
  children,
  className,
  ...props
}: ConversationContentProps) {
  const { scrollRef, isAtBottom } = useConversation();

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children, isAtBottom, scrollRef]);

  return (
    <div
      className={cn("flex-1 overflow-y-auto space-y-4 p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// SCROLL BUTTON
// ============================================================================

export interface ConversationScrollButtonProps
  extends HTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

export function ConversationScrollButton({
  children,
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useConversation();

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      onClick={scrollToBottom}
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-10",
        "rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg",
        "hover:bg-zinc-700 transition-colors",
        "flex items-center gap-2",
        className
      )}
      {...props}
    >
      {children || (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          Scrolla ned
        </>
      )}
    </button>
  );
}

