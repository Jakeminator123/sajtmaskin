"use client";

import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { Send, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawMessage } from "./OpenClawMessage";

export function OpenClawChatPanel({ onClose }: { onClose: () => void }) {
  const { messages, isStreaming, send, stop } = useOpenClawChat();
  const clearMessages = useOpenClawStore((s) => s.clearMessages);
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
    send(input);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "border-border bg-background/95 flex flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-sm",
        "h-[min(500px,80vh)] w-[380px]",
      )}
    >
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white">
            S
          </div>
          <div>
            <p className="text-sm font-semibold">Sajtagenten</p>
            <p className="text-muted-foreground text-[11px]">
              {isStreaming ? "Skriver..." : "Sitemaskin-hjalp"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearMessages}
              className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
              aria-label="Rensa chatt"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
            aria-label="Stang"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
              <span className="text-primary text-lg">S</span>
            </div>
            <p className="font-medium">Hej! Jag ar Sajtagenten.</p>
            <p className="max-w-[260px] text-xs opacity-70">
              Fraga mig vad som helst om Sitemaskin — hur du bygger din sajt, vad knapparna gor, eller vad som hander i din builder.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <OpenClawMessage key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Input */}
      <div className="border-border border-t px-3 py-2.5">
        <div className="bg-muted/50 flex items-end gap-2 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv ett meddelande..."
            rows={1}
            className="bg-transparent text-foreground placeholder:text-muted-foreground max-h-24 flex-1 resize-none text-sm leading-relaxed outline-none"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="text-muted-foreground hover:text-foreground shrink-0 p-1 transition-colors"
              aria-label="Stoppa"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="text-primary hover:text-primary/80 shrink-0 p-1 transition-colors disabled:opacity-30"
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
