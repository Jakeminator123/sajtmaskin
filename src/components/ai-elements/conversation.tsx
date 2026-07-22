"use client";

/**
 * Conversation Component (AI Elements)
 *
 * Container for chat messages with auto-scroll functionality.
 *
 * Two implementations live behind the `NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER`
 * feature flag (default ON, see `@/lib/builder/message-scroller-feature`):
 *
 *  - **MessageScroller path (default):** built on the headless
 *    `@shadcn/react` MessageScroller primitive via `@/components/ui/message-scroller`.
 *    Gives streaming without jump, turn anchoring at user messages (via
 *    `ConversationItem scrollAnchor`), preserved read position when history is
 *    prepended, and a scroll-to-bottom control.
 *  - **Legacy path (flag off):** the previous simple overflow-scroll
 *    implementation, kept for instant reversibility.
 *
 * The public API is a drop-in for both paths: `Conversation`,
 * `ConversationContent`, `ConversationScrollButton`, `useConversation`, plus the
 * additive `ConversationItem` (a no-op fragment in the legacy path).
 */

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMessageScrollerEnabled } from "@/lib/builder/message-scroller-feature";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";

// ============================================================================
// CONTEXT (shared by both paths so `useConversation` keeps its shape)
// ============================================================================

interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
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
// SHARED PROP TYPES
// ============================================================================

export interface ConversationProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ConversationContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ConversationScrollButtonProps extends HTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

export interface ConversationItemProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Stable id so the scroller can anchor, preserve position and jump to this row. */
  messageId?: string;
  /** Mark this row as the start of a turn (e.g. a user message). */
  scrollAnchor?: boolean;
}

// ============================================================================
// MESSAGE SCROLLER PATH (default)
// ============================================================================

/**
 * Bridges the MessageScroller hooks into the legacy `ConversationContext` shape
 * so `useConversation()` keeps working for any external consumer. Renders no DOM
 * of its own, so its children stay direct children of the `MessageScroller`
 * frame (the scroll button must be a sibling of the viewport to stay pinned).
 */
function ScrollerContextBridge({ children }: { children: ReactNode }) {
  const { scrollToEnd } = useMessageScroller();
  const { end } = useMessageScrollerScrollable();
  const scrollRef = useRef<HTMLDivElement>(null);
  const value = useMemo<ConversationContextValue>(
    () => ({
      scrollRef,
      // `end` = the viewport can still scroll toward the latest message, so
      // "at bottom" is its negation.
      isAtBottom: !end,
      scrollToBottom: () => {
        scrollToEnd();
      },
    }),
    [end, scrollToEnd],
  );
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

function ScrollerConversation({ children, className, ...props }: ConversationProps) {
  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollPreviousItemPeek={64}
    >
      <MessageScroller
        className={cn("relative flex flex-col overflow-hidden", className)}
        {...props}
      >
        <ScrollerContextBridge>{children}</ScrollerContextBridge>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function ScrollerConversationContent({
  children,
  className,
  ...props
}: ConversationContentProps) {
  return (
    <MessageScrollerViewport>
      <MessageScrollerContent className={cn("flex-1 space-y-4 p-4", className)} {...props}>
        {children}
      </MessageScrollerContent>
    </MessageScrollerViewport>
  );
}

function ScrollerConversationScrollButton({
  children,
  className,
  ...props
}: ConversationScrollButtonProps) {
  return (
    <MessageScrollerButton
      size="sm"
      aria-label="Scrolla ned till senaste meddelande"
      className={cn("z-10 gap-2 rounded-full px-4 text-sm", className)}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDown className="h-4 w-4" />
          Scrolla ned
        </>
      )}
    </MessageScrollerButton>
  );
}

// ============================================================================
// LEGACY PATH (flag off) — previous simple overflow-scroll implementation
// ============================================================================

function LegacyConversation({ children, className, ...props }: ConversationProps) {
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
    <ConversationContext.Provider value={{ scrollRef, isAtBottom, scrollToBottom }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn("relative flex flex-col overflow-y-auto", className)}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
}

function LegacyConversationContent({ children, className, ...props }: ConversationContentProps) {
  const { scrollRef, isAtBottom } = useConversation();

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children, isAtBottom, scrollRef]);

  return (
    <div className={cn("flex-1 space-y-4 p-4", className)} {...props}>
      {children}
    </div>
  );
}

function LegacyConversationScrollButton({
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
        "rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg",
        "transition-colors hover:bg-zinc-700",
        "flex items-center gap-2",
        className,
      )}
      {...props}
    >
      {children || (
        <>
          <ArrowDown className="h-4 w-4" />
          Scrolla ned
        </>
      )}
    </button>
  );
}

// ============================================================================
// PUBLIC EXPORTS (flag-gated drop-in)
// ============================================================================

export function Conversation(props: ConversationProps) {
  return isMessageScrollerEnabled() ? (
    <ScrollerConversation {...props} />
  ) : (
    <LegacyConversation {...props} />
  );
}

export function ConversationContent(props: ConversationContentProps) {
  return isMessageScrollerEnabled() ? (
    <ScrollerConversationContent {...props} />
  ) : (
    <LegacyConversationContent {...props} />
  );
}

export function ConversationScrollButton(props: ConversationScrollButtonProps) {
  return isMessageScrollerEnabled() ? (
    <ScrollerConversationScrollButton {...props} />
  ) : (
    <LegacyConversationScrollButton {...props} />
  );
}

/**
 * A transcript row. In the MessageScroller path it wraps the row in a
 * `MessageScrollerItem` so the scroller can anchor/measure/jump to it; in the
 * legacy path it renders its children unchanged (no extra DOM).
 */
export function ConversationItem({
  children,
  className,
  messageId,
  scrollAnchor,
  ...props
}: ConversationItemProps) {
  if (!isMessageScrollerEnabled()) {
    return <>{children}</>;
  }
  return (
    <MessageScrollerItem
      messageId={messageId}
      scrollAnchor={scrollAnchor}
      className={className}
      {...props}
    >
      {children}
    </MessageScrollerItem>
  );
}
