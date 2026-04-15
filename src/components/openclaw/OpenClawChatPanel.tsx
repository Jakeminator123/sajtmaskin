"use client";
/* eslint-disable react-hooks/refs -- useDidAvatar exposes ref-like fields for video and connection UI */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HelpCircle, Send, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawMessage } from "./OpenClawMessage";
import { OpenClawHelpSuggestions } from "./OpenClawHelpSuggestions";

export interface OpenClawChatPanelContent {
  badgeLabel: string;
  assistantLabel: string;
  idleStatus: string;
  emptyTitle: string;
  emptyBody: string;
  inputPlaceholder: string;
  starterPrompts: readonly string[];
}

export const DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT: OpenClawChatPanelContent = {
  badgeLabel: "OpenClaw-assistent",
  assistantLabel: "Sajtagenten",
  idleStatus: "",
  emptyTitle: "Fråga mig vad som helst.",
  emptyBody: "",
  inputPlaceholder: "Skriv ett meddelande...",
  starterPrompts: [],
};

export function OpenClawChatPanel({
  onClose,
  content = DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT,
}: {
  onClose: () => void;
  content?: OpenClawChatPanelContent;
}) {
  const { messages, isStreaming, send, stop, clearConversation } = useOpenClawChat();
  const [input, setInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    void send(input);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    if (!isStreaming) {
      void send(text);
      setInput("");
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl",
          "h-[min(560px,70vh)] w-[min(540px,calc(100vw-2rem))]",
        )}
      >
        {/* Minimal header: name + help + clear + close */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground">{content.assistantLabel}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
              aria-label="Hjälpförslag"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearConversation}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                aria-label="Rensa chatt"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">{content.emptyTitle}</p>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Visa förslag
              </button>
            </div>
          ) : null}
          {messages.map((msg) => (
            <OpenClawMessage key={msg.id} msg={msg} />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={content.inputPlaceholder}
              rows={1}
              className="max-h-24 flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Stoppa"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 p-1 text-primary transition-colors hover:text-primary/90 disabled:opacity-30"
                aria-label="Skicka"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <OpenClawHelpSuggestions
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        onSelect={handleSuggestion}
      />
    </>
  );
}
