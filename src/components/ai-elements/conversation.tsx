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
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// CONTEXT
// ============================================================================

interface ConversationContextValue {
  contentRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  setIsAtBottom: (v: boolean) => void;
  scrollToBottom: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

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

export function Conversation({ children, className, ...props }: ConversationProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({
        top: contentRef.current.scrollHeight,
        behavior: "smooth",
      });
      setIsAtBottom(true);
    }
  }, []);

  return (
    <ConversationContext.Provider value={{ contentRef, isAtBottom, setIsAtBottom, scrollToBottom }}>
      <div className={cn("relative flex flex-col", className)} {...props}>
        {children}
      </div>
    </ConversationContext.Provider>
  );
}

// ============================================================================
// CONVERSATION CONTENT — this is the scrollable element
// ============================================================================

export interface ConversationContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ConversationContent({ children, className, ...props }: ConversationContentProps) {
  const { contentRef, isAtBottom, setIsAtBottom } = useConversation();
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Scroll to bottom on initial mount
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    const el = contentRef.current;
    if (!el) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
        setIsAtBottom(true);
        userScrolledUpRef.current = false;
      }
    });
  }, [contentRef, setIsAtBottom]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const newHeight = el.scrollHeight;
    if (newHeight > prevScrollHeightRef.current && !userScrolledUpRef.current) {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
          setIsAtBottom(true);
        }
      });
    }
    prevScrollHeightRef.current = newHeight;
  });

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const threshold = 80;
    const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setIsAtBottom(atBottom);

    if (atBottom) {
      userScrolledUpRef.current = false;
    } else if (scrollTop < prevScrollTopRef.current - 2) {
      userScrolledUpRef.current = true;
    }
    prevScrollTopRef.current = scrollTop;
  }, [contentRef, setIsAtBottom]);

  return (
    <div
      ref={contentRef}
      onScroll={handleScroll}
      className={cn("flex-1 space-y-4 overflow-y-auto p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// SCROLL BUTTON
// ============================================================================

export interface ConversationScrollButtonProps extends HTMLAttributes<HTMLButtonElement> {
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
      aria-label="Scrolla ned till senaste meddelande"
      className={cn(
        "fixed bottom-24 left-1/2 z-10 -translate-x-1/2",
        "rounded-full bg-muted px-4 py-2 text-sm text-foreground shadow-lg",
        "transition-colors hover:bg-muted",
        "flex items-center gap-2",
        className,
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
