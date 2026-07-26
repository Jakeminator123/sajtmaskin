"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatOutputCollapseBarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  /** Antal meddelanden i chatten — visas som "N meddelanden" i nedfällt läge. */
  messageCount: number;
  isStreaming: boolean;
  /**
   * Kort status som måste synas även nedfällt (t.ex. en blockerare). Ligger i
   * raden, aldrig inne i det nedfällda — annars gömmer läget fel som
   * användaren behöver se.
   */
  statusText?: string | null;
}

function formatMessageCount(count: number): string {
  return count === 1 ? "1 meddelande" : `${count} meddelanden`;
}

/**
 * Tunn rad mellan chattens utdata och inputen (Ö9). Fäller ned utdata till
 * inputens överkant och tillbaka igen, och bär den status som måste synas
 * även när utdata är dolt.
 */
export function ChatOutputCollapseBar({
  isCollapsed,
  onToggle,
  messageCount,
  isStreaming,
  statusText = null,
}: ChatOutputCollapseBarProps) {
  const Chevron = isCollapsed ? ChevronUp : ChevronDown;
  const label = isCollapsed
    ? `Visa chatten (${formatMessageCount(messageCount)})`
    : "Fäll ned chatten";

  return (
    <div
      className={cn(
        "border-border text-muted-foreground flex items-center gap-2 border-t px-3 py-1 text-xs",
        isCollapsed && "bg-muted/30",
      )}
      data-testid="chat-output-collapse-bar"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls="builder-chat-output"
        className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
      >
        <Chevron className="h-3.5 w-3.5" />
        {label}
      </button>
      {isStreaming ? (
        <span className="text-foreground/80 ml-auto inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Bygger …
        </span>
      ) : statusText ? (
        <span className="ml-auto truncate">{statusText}</span>
      ) : null}
    </div>
  );
}
