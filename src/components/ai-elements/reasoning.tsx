"use client";

/**
 * Reasoning Component (AI Elements)
 *
 * Displays AI reasoning with auto-open/close while streaming.
 * Based on Vercel AI Elements specification.
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils/utils";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type ReasoningContextValue = {
  isOpen: boolean;
  isStreaming: boolean;
  durationMs: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within a <Reasoning> provider");
  }
  return context;
}

export interface ReasoningProps extends Omit<
  ComponentPropsWithoutRef<typeof Collapsible>,
  "open" | "defaultOpen" | "onOpenChange"
> {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  children: ReactNode;
}

export function Reasoning({
  isStreaming = false,
  open,
  defaultOpen = false,
  onOpenChange,
  duration,
  className,
  children,
  ...props
}: ReasoningProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = isControlled ? Boolean(open) : internalOpen;
  const autoOpenedRef = useRef(false);
  const streamStartRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      if (!streamStartRef.current) {
        streamStartRef.current = Date.now();
      }
      if (!resolvedOpen) {
        if (isControlled) {
          onOpenChange?.(true);
        } else {
          setInternalOpen(true);
        }
        autoOpenedRef.current = true;
      }
      return;
    }

    streamStartRef.current = null;
    setElapsedMs(0);
    if (autoOpenedRef.current) {
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setInternalOpen(false);
      }
      autoOpenedRef.current = false;
    }
  }, [isStreaming, resolvedOpen, isControlled, onOpenChange]);

  useEffect(() => {
    if (!isStreaming || duration !== undefined) return undefined;
    const timer = window.setInterval(() => {
      if (streamStartRef.current) {
        setElapsedMs(Date.now() - streamStartRef.current);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isStreaming, duration]);

  const durationMs = duration ?? elapsedMs;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    if (!next) {
      autoOpenedRef.current = false;
    }
    onOpenChange?.(next);
  };

  const contextValue = useMemo(
    () => ({ isOpen: resolvedOpen, isStreaming, durationMs }),
    [resolvedOpen, isStreaming, durationMs],
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <Collapsible
        open={resolvedOpen}
        onOpenChange={handleOpenChange}
        className={cn(
          "overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/50",
          className,
        )}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

export interface ReasoningTriggerProps extends ComponentPropsWithoutRef<typeof CollapsibleTrigger> {
  getThinkingMessage?: (durationMs: number) => ReactNode;
}

export function ReasoningTrigger({
  children,
  getThinkingMessage,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, isStreaming, durationMs } = useReasoningContext();

  const defaultThinking = useMemo(() => {
    if (!isStreaming) return null;
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    return (
      <span className="flex items-center gap-2">
        <span className="animate-pulse">💭</span>
        {durationMs ? `Tänker (${seconds}s)...` : "Tänker..."}
      </span>
    );
  }, [isStreaming, durationMs]);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left",
        "text-sm text-zinc-400 hover:text-zinc-200",
        "transition-colors",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        getThinkingMessage ? (
          getThinkingMessage(durationMs)
        ) : (
          defaultThinking
        )
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
    </CollapsibleTrigger>
  );
}

export interface ReasoningContentProps extends ComponentPropsWithoutRef<typeof CollapsibleContent> {
  children: ReactNode;
}

export function ReasoningContent({ children, className, ...props }: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn("px-3 pb-3 text-sm leading-relaxed text-zinc-400", className)}
      {...props}
    >
      <div className="border-t border-zinc-800 pt-2">{children}</div>
    </CollapsibleContent>
  );
}
