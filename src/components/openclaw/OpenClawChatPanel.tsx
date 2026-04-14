"use client";
/* eslint-disable react-hooks/refs -- useDidAvatar exposes ref-like fields for video and connection UI */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Send, Square, Trash2, Video, VideoOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import {
  DID_AVATAR_AVAILABLE,
  useDidAvatar,
  truncateForSpeech,
} from "@/lib/openclaw/use-did-avatar";
import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawMessage } from "./OpenClawMessage";

const DEFAULT_STARTER_PROMPTS = [
  "Hur kan Sajtagenten hjälpa ett småföretag på sajten?",
  "Vad kan jag senare kundanpassa för ett specifikt företag?",
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
  idleStatus: "Guidar, förklarar och visar möjligheter",
  emptyTitle: "Hej! Jag är Sajtagenten.",
  emptyBody:
    "Jag kan förklara hur OpenClaw-spåret fungerar, hur det kan presenteras på sajten och hur du bygger vidare på integrationen i Sajtmaskin.",
  inputPlaceholder: "Skriv ett meddelande...",
  starterPrompts: DEFAULT_STARTER_PROMPTS,
};

export function OpenClawChatPanel({
  onClose,
  content = DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT,
  isOpen = true,
}: {
  onClose: () => void;
  content?: OpenClawChatPanelContent;
  isOpen?: boolean;
}) {
  const { messages, isStreaming, send, stop, clearConversation } = useOpenClawChat();
  const { avatarMode, setAvatarMode } = useOpenClawStore();
  const avatar = useDidAvatar({ enabled: avatarMode && isOpen });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (!wasStreaming || isStreaming) return;
    if (!avatarMode) return;
    if (avatar.connectionState !== "connected") return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;
    const speechText = truncateForSpeech(lastAssistant.content);
    if (speechText) void avatar.speak(speechText);
  }, [isStreaming, avatarMode, avatar, messages]);

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

  const showAvatar = avatarMode && DID_AVATAR_AVAILABLE;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/95 text-slate-50 shadow-2xl shadow-cyan-950/35 backdrop-blur-xl",
        "h-[min(580px,calc(100vh-7rem))] w-[min(380px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/20 bg-white/5 text-cyan-200">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">{content.assistantLabel}</p>
            <p className="text-[10px] text-slate-300">
              {avatar.connectionState === "speaking"
                ? "Pratar..."
                : avatar.connectionState === "connecting"
                  ? "Ansluter avatar..."
                  : isStreaming
                    ? "Skriver..."
                    : content.idleStatus}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {DID_AVATAR_AVAILABLE ? (
            <button
              type="button"
              onClick={() => setAvatarMode(!avatarMode)}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                avatarMode
                  ? "text-cyan-200 hover:text-cyan-100"
                  : "text-slate-300 hover:text-white",
              )}
              aria-label={avatarMode ? "Stäng av avatar" : "Aktivera avatar"}
            >
              {avatarMode ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={clearConversation}
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:text-white"
              aria-label="Rensa chatt"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-300 transition-colors hover:text-white"
            aria-label="Stäng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Avatar video */}
      {showAvatar ? (
        <div className="relative shrink-0 border-b border-white/10 bg-black/60">
          <div className="relative mx-auto aspect-4/3 max-h-[140px] overflow-hidden">
            {avatar.avatarReady ? (
              <video
                ref={avatar.videoRef}
                autoPlay
                playsInline
                muted={avatar.connectionState !== "speaking"}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  {avatar.connectionState === "error" ? (
                    <>
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <p className="text-[10px] text-red-300">Kunde inte ansluta</p>
                      <button
                        type="button"
                        onClick={() => void avatar.connect()}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-200 hover:bg-white/5"
                      >
                        Försök igen
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="h-3 w-3 animate-pulse rounded-full bg-cyan-400" />
                      <p className="text-[10px] text-slate-400">Ansluter till mAIa...</p>
                    </>
                  )}
                </div>
              </div>
            )}
            {avatar.connectionState === "speaking" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-linear-to-r from-cyan-400 via-purple-400 to-cyan-400 opacity-80" />
            )}
          </div>
        </div>
      ) : null}

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
