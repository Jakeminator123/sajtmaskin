"use client";

/**
 * Reasoning Component (AI Elements)
 *
 * Displays AI thinking/reasoning process with collapsible content.
 * Based on Vercel AI Elements specification.
 */

import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/utils";

// ============================================================================
// REASONING CONTEXT
// ============================================================================

interface ReasoningContextValue {
  isOpen: boolean;
  toggle: () => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within a <Reasoning> provider");
  }
  return context;
}

// ============================================================================
// REASONING ROOT
// ============================================================================

export interface ReasoningProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Reasoning({ defaultOpen = false, children, className, ...props }: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <ReasoningContext.Provider value={{ isOpen, toggle: () => setIsOpen(!isOpen) }}>
      <div
        data-state={isOpen ? "open" : "closed"}
        className={cn(
          "overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/50",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

// ============================================================================
// REASONING TRIGGER (Collapsible header)
// ============================================================================

export interface ReasoningTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  isStreaming?: boolean;
}

export function ReasoningTrigger({
  children,
  isStreaming = false,
  className,
  onClick,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, toggle } = useReasoningContext();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    toggle();
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-expanded={isOpen}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left",
        "text-sm text-zinc-400 hover:text-zinc-200",
        "transition-colors",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        <span className="flex items-center gap-2">
          <span className="animate-pulse">💭</span>
          Tänker...
        </span>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn("transition-transform", isOpen && "rotate-90")}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          {children || "Visa resonemang"}
        </>
      )}
    </button>
  );
}

// ============================================================================
// REASONING CONTENT
// ============================================================================

export interface ReasoningContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ReasoningContent({ children, className, ...props }: ReasoningContentProps) {
  const { isOpen } = useReasoningContext();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        "px-3 pb-3 text-sm leading-relaxed text-zinc-400",
        "border-t border-zinc-800",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
