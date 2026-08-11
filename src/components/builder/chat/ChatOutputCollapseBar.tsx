"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatOutputCollapseBarProps {
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
  // Fullständigt namn bärs av aria-label + title (Del A) — själva fliken visar
  // bara chevron + räknare. Byts text mot ikon: aria-label bär namnet.
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
        aria-label={label}
        title={label}
        className="border-border hover:text-foreground hover:bg-muted/50 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors"
      >
        <Chevron className="h-3.5 w-3.5" />
        <span className="font-medium tabular-nums">{messageCount}</span>
      </button>
      {/* Statusen får aldrig gömmas i nedfällt läge (komponentens hela poäng):
          "Bygger …" och en eventuell blockerare ligger kvar i fliken-raden. */}
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
