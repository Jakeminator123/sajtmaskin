"use client";
/* eslint-disable react-hooks/refs -- useDidAvatar exposes ref-like fields for video and connection UI */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Bot,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Send,
  Square,
  Trash2,
  Video,
  VideoOff,
  X,
} from "lucide-react";
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

// Web Speech API constructor type (sv-SE recognition)
type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: null | (() => void);
  onresult: null | ((event: unknown) => void);
  onerror: null | ((event: unknown) => void);
  onend: null | (() => void);
  start: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const target = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

const DRAG_STORAGE_KEY = "sajtmaskin:openclaw-panel-offset";

function readStoredOffset(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const raw = sessionStorage.getItem(DRAG_STORAGE_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    return {
      x: typeof parsed.x === "number" ? parsed.x : 0,
      y: typeof parsed.y === "number" ? parsed.y : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

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
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevStreamingRef = useRef(isStreaming);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null,
  );

  useEffect(() => {
    setDragOffset(readStoredOffset());
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
  }, []);

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

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    void send(input);
    setInput("");
  }, [input, isStreaming, send]);

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

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition || isStreaming) return;

    recognitionRef.current?.abort?.();
    const recognition = new SpeechRecognition();
    recognition.lang = "sv-SE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
    };
    recognition.onresult = (event: unknown) => {
      const ev = event as {
        results: Array<Array<{ transcript: string; isFinal?: boolean }>>;
      };
      const result = ev.results?.[ev.results.length - 1];
      const text = result?.[0]?.transcript ?? "";
      setInterimTranscript(text);
      if (result?.[0]?.isFinal && text.trim()) {
        void send(text.trim());
        setInterimTranscript("");
      }
    };
    recognition.onerror = () => {
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isStreaming, send]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort?.();
    setListening(false);
    setInterimTranscript("");
  }, []);

  const handleHeaderPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      // Ignore drags initiated on the action buttons (header right cluster)
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-drag]")) return;
      // Only primary button / touch
      if (e.button !== 0 && e.pointerType === "mouse") return;

      e.preventDefault();
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: dragOffset.x,
        offsetY: dragOffset.y,
      };
      setIsDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [dragOffset],
  );

  const handleHeaderPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) return;
      const next = {
        x: start.offsetX + (e.clientX - start.x),
        y: start.offsetY + (e.clientY - start.y),
      };
      setDragOffset(next);
    },
    [],
  );

  const handleHeaderPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    try {
      // Snapshot current offset directly to storage
      setDragOffset((current) => {
        sessionStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(current));
        return current;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const resetPanelPosition = useCallback(() => {
    setDragOffset({ x: 0, y: 0 });
    try {
      sessionStorage.removeItem(DRAG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const showAvatar = avatarMode && DID_AVATAR_AVAILABLE;
  const avatarHeightClass = avatarExpanded ? "max-h-[380px]" : "max-h-[220px]";
  const panelWidthClass = avatarExpanded
    ? "w-[min(440px,calc(100vw-1rem))]"
    : "w-[min(380px,calc(100vw-1rem))]";

  return (
    <div
      style={{
        transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        transition: isDragging ? "none" : "transform 200ms ease-out",
      }}
      className={cn(
        "flex flex-col overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/95 text-slate-50 shadow-2xl shadow-cyan-950/35 backdrop-blur-xl",
        "h-[min(640px,calc(100vh-5rem))] max-w-[calc(100vw-1rem)]",
        panelWidthClass,
      )}
    >
      {/* Header — draggable */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        onDoubleClick={resetPanelPosition}
        title="Dra för att flytta — dubbelklicka för att återställa position"
        className={cn(
          "flex items-center justify-between gap-2 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)] px-4 py-2.5 select-none touch-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-white/5 text-cyan-200">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-white">{content.assistantLabel}</p>
            <p className="truncate text-[10px] text-slate-300">
              {listening
                ? "Lyssnar..."
                : avatar.connectionState === "speaking"
                  ? "Pratar..."
                  : avatar.connectionState === "connecting"
                    ? "Ansluter avatar..."
                    : isStreaming
                      ? "Skriver..."
                      : content.idleStatus}
            </p>
          </div>
        </div>
        <div data-no-drag className="flex items-center gap-0.5">
          {showAvatar ? (
            <button
              type="button"
              onClick={() => setAvatarExpanded((v) => !v)}
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:text-white"
              aria-label={avatarExpanded ? "Förminska avatar" : "Förstora avatar"}
              title={avatarExpanded ? "Förminska avatar" : "Förstora avatar"}
            >
              {avatarExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
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
          <div
            className={cn(
              "relative mx-auto aspect-4/3 overflow-hidden transition-all duration-300",
              avatarHeightClass,
            )}
          >
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
            {/* Floating expand toggle on the video itself (extra reachable target) */}
            <button
              type="button"
              onClick={() => setAvatarExpanded((v) => !v)}
              className="absolute right-2 top-2 rounded-md bg-black/40 p-1 text-slate-200 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              aria-label={avatarExpanded ? "Förminska avatar" : "Förstora avatar"}
              title={avatarExpanded ? "Förminska avatar" : "Förstora avatar"}
            >
              {avatarExpanded ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </button>
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
        {listening && interimTranscript ? (
          <div className="flex w-full justify-end">
            <div className="min-w-0 max-w-[85%] rounded-2xl rounded-br-md border border-cyan-400/40 bg-cyan-400/15 px-3.5 py-2.5 text-sm leading-relaxed italic text-cyan-100/90">
              {interimTranscript}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? "Lyssnar — prata på svenska..." : content.inputPlaceholder}
            rows={1}
            disabled={listening}
            className="max-h-24 min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-slate-400 disabled:opacity-60"
          />
          {speechSupported ? (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={isStreaming}
              className={cn(
                "shrink-0 rounded-full p-1.5 transition-colors",
                listening
                  ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
                "disabled:opacity-30",
              )}
              aria-label={listening ? "Stoppa inspelning" : "Tala in meddelande"}
              title={listening ? "Stoppa inspelning" : "Tala in (sv-SE)"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : null}
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
              disabled={!input.trim() || listening}
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
