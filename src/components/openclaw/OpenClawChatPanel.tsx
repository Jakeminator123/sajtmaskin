"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawMessage } from "./OpenClawMessage";

const DEFAULT_STARTER_PROMPTS = [
  "Hur kan Sajtagenten hjalpa ett smaforetag pa sajten?",
  "Vad kan jag senare kundanpassa for ett specifikt foretag?",
  "Hur fungerar OpenClaw i buildern i dag?",
] as const;

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
  idleStatus: "Guidar, forklarar och visar mojligheter",
  emptyTitle: "Hej! Jag ar Sajtagenten.",
  emptyBody:
    "Jag kan forklara hur OpenClaw-sparet fungerar, hur det kan presenteras pa sajten och hur du bygger vidare pa integrationen i Sajtmaskin.",
  inputPlaceholder: "Skriv ett meddelande...",
  starterPrompts: DEFAULT_STARTER_PROMPTS,
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

  const handleStarterPrompt = (prompt: string) => {
    if (isStreaming) return;
    void send(prompt);
    setInput("");
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/95 text-slate-50 shadow-2xl shadow-cyan-950/35 backdrop-blur-xl",
        "h-[min(500px,80vh)] w-[380px]",
      )}
    >
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)] px-4 py-3">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200">
          <Sparkles className="h-3.5 w-3.5" />
          {content.badgeLabel}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-white/5 text-cyan-200">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{content.assistantLabel}</p>
              <p className="text-[11px] text-slate-300">
                {isStreaming ? "Skriver ett svar..." : content.idleStatus}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={clearConversation}
                className="rounded-md p-1.5 text-slate-300 transition-colors hover:text-white"
                aria-label="Rensa chatt"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:text-white"
              aria-label="Stang"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-300">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-cyan-400/20 bg-cyan-400/10">
              <Bot className="h-6 w-6 text-cyan-200" />
            </div>
            <p className="font-medium text-white">{content.emptyTitle}</p>
            <p className="max-w-[290px] text-xs leading-5 text-slate-300/80">{content.emptyBody}</p>
            <div className="mt-2 flex w-full flex-col gap-2">
              {content.starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  disabled={isStreaming}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-100 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((msg) => (
          <OpenClawMessage key={msg.id} msg={msg} />
        ))}
      </div>

      <div className="border-t border-white/10 px-3 py-2.5">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={content.inputPlaceholder}
            rows={1}
            className="max-h-24 flex-1 resize-none bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-slate-400"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 p-1 text-slate-300 transition-colors hover:text-white"
              aria-label="Stoppa"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 p-1 text-cyan-200 transition-colors hover:text-cyan-100 disabled:opacity-30"
              aria-label="Skicka"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
