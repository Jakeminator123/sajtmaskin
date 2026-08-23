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
import { useOpenClawArmedContinuation } from "./useOpenClawArmedContinuation";
import { OpenClawMessage } from "./OpenClawMessage";
import { OpenClawPowersControl } from "./OpenClawPowersControl";
import { describeMandate, isMandateActive } from "@/lib/openclaw/debug/armed-mandate";

export interface OpenClawChatPanelContent {
  badgeLabel: string;
  assistantLabel: string;
  idleStatus: string;
  emptyTitle: string;
  emptyBody: string;
  inputPlaceholder: string;
}

export const DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT: OpenClawChatPanelContent = {
  badgeLabel: "AI-assistent",
  assistantLabel: "Sajtagenten",
  idleStatus: "Guidar, förklarar och visar möjligheter",
  emptyTitle: "Hej! Jag är Sajtagenten.",
  emptyBody: "Fråga om din sajt, funktionerna eller vad som är smartast att göra härnäst.",
  inputPlaceholder: "Fråga Sajtagenten...",
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
  stop: () => void;
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
  powersAvailable = false,
}: {
  onClose: () => void;
  content?: OpenClawChatPanelContent;
  isOpen?: boolean;
  /** True only on surfaces where extra powers can act (the builder). Landing
   * and kostnadsfri have no builder target, so a grant there could only
   * produce failure cards — the control is not rendered at all. */
  powersAvailable?: boolean;
}) {
  const { messages, isStreaming, send, stop, clearConversation } = useOpenClawChat();
  // Closes the armed-autonomy loop: an auto-send registers a watch and this
  // resumes OpenClaw once the builder turn it started is done. The panel stays
  // mounted while collapsed, so a running mandate survives a closed chat.
  useOpenClawArmedContinuation(send);
  const { avatarMode, setAvatarMode, setDebugEnabled, setEditEnabled, armedMandate } =
    useOpenClawStore();
  const avatar = useDidAvatar({ enabled: avatarMode && isOpen });
  const [input, setInput] = useState("");
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  // True while the user is at (or near) the bottom of the chat. Streaming
  // growth only auto-scrolls while pinned, so scrolling up to read is never
  // yanked back down mid-stream.
  const pinnedToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevStreamingRef = useRef(isStreaming);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null,
  );
  const liveDragOffsetRef = useRef(dragOffset);

  useEffect(() => {
    const storedOffset = readStoredOffset();
    liveDragOffsetRef.current = storedOffset;
    setDragOffset(storedOffset);
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  // Learn the server OC_DEBUG state once so the armed-autonomy auto-send path is
  // gated client-side too (defense in depth). Best-effort: failure leaves debug
  // off, which means OpenClaw stays passive (fill-but-never-send).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/openclaw/health");
        const data = (await res.json().catch(() => null)) as {
          debugEnabled?: boolean;
          editEnabled?: boolean;
        } | null;
        if (!cancelled) {
          setDebugEnabled(data?.debugEnabled === true);
          setEditEnabled(data?.editEnabled === true);
        }
      } catch {
        if (!cancelled) {
          setDebugEnabled(false);
          setEditEnabled(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDebugEnabled, setEditEnabled]);

  // A brand-new message (sent or received) always re-pins and jumps to the
  // bottom; content GROWTH during streaming is handled by the ResizeObserver
  // below and respects the pinned state.
  useEffect(() => {
    pinnedToBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!pinnedToBottomRef.current) return;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  // Focus only when the panel is actually opened — the panel is mounted even in
  // collapsed state, and stealing focus on page load pulls keyboard users into
  // the chat before they've interacted with the page.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

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

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition || isStreaming) return;

    recognitionRef.current?.abort?.();
    const recognition = new SpeechRecognition();
    recognition.lang = "sv-SE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Track the best transcript seen so a pause or manual stop still submits it.
    // Chrome frequently fires onend WITHOUT a trailing isFinal result when the
    // user stops talking, which previously dropped the whole utterance.
    let capturedTranscript = "";
    let submitted = false;
    const submitTranscript = (text: string) => {
      const trimmed = text.trim();
      if (submitted || !trimmed) return;
      submitted = true;
      void send(trimmed);
    };

    recognition.onstart = () => {
      setListening(true);
    };
    recognition.onresult = (event: unknown) => {
      const ev = event as {
        results: Array<Array<{ transcript: string; isFinal?: boolean }>>;
      };
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0];
        const chunk = alt?.transcript ?? "";
        if (alt?.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      capturedTranscript = `${finalText} ${interimText}`.trim();
      setInterimTranscript(capturedTranscript);
      if (finalText.trim()) {
        submitTranscript(finalText);
        setInterimTranscript("");
      }
    };
    recognition.onerror = () => {
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      // Fallback: no isFinal result flushed — submit whatever we captured.
      submitTranscript(capturedTranscript);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isStreaming, send]);

  const stopListening = useCallback(() => {
    // Graceful stop() (not abort) so the recognizer can flush its result;
    // onend then submits the captured transcript. Keep the interim text
    // visible until onend clears it so the user sees what will be sent.
    const recognition = recognitionRef.current;
    if (recognition?.stop) recognition.stop();
    else recognition?.abort?.();
    setListening(false);
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

  const handleHeaderPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const next = {
      x: start.offsetX + (e.clientX - start.x),
      y: start.offsetY + (e.clientY - start.y),
    };
    liveDragOffsetRef.current = next;
    if (panelRef.current) {
      panelRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    }
  }, []);

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
      const current = liveDragOffsetRef.current;
      setDragOffset(current);
      sessionStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }, []);

  const resetPanelPosition = useCallback(() => {
    liveDragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
    try {
      sessionStorage.removeItem(DRAG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const showAvatar = avatarMode && DID_AVATAR_AVAILABLE;
  const panelWidthClass = avatarExpanded
    ? "w-[min(520px,calc(100vw-1rem))]"
    : "w-[min(380px,calc(100vw-1rem))]";

  return (
    <div
      ref={panelRef}
      role={isOpen ? "dialog" : undefined}
      aria-label={isOpen ? `${content.assistantLabel} chatt` : undefined}
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{
        transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        transition: isDragging ? "none" : "transform 200ms ease-out",
      }}
      className={cn(
        "flex flex-col overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/[0.98] text-slate-50 shadow-2xl shadow-cyan-950/35",
        "h-[min(580px,calc(100dvh-4.5rem))] max-w-[calc(100vw-1rem)]",
        "transition-[width] duration-300 ease-out",
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
          "flex touch-none items-center justify-between gap-2 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)] px-4 py-2.5 select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-white/5 text-cyan-200">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold text-white">
              {content.assistantLabel}
            </p>
            <p
              className={cn(
                "truncate text-[10px]",
                isMandateActive(armedMandate) ? "text-fuchsia-300" : "text-slate-300",
              )}
            >
              {isMandateActive(armedMandate)
                ? describeMandate(armedMandate)
                : listening
                  ? "Lyssnar..."
                  : avatar.connectionState === "speaking"
                    ? "Pratar..."
                    : avatar.connectionState === "connecting"
                      ? "Ansluter avatar..."
                      : avatar.connectionState === "error"
                        ? "Avatar offline · textchatten fungerar"
                        : isStreaming
                          ? "Skriver..."
                          : content.idleStatus}
            </p>
          </div>
        </div>
        <div data-no-drag className="flex items-center gap-0.5">
          {powersAvailable ? <OpenClawPowersControl /> : null}
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
              {avatarMode ? (
                <VideoOff className="h-3.5 w-3.5" />
              ) : (
                <Video className="h-3.5 w-3.5" />
              )}
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

      {/* Avatar video. Anslutningsfel tar aldrig över halva chatten: textchatten
          fortsätter fungera och avataren kan startas om eller stängas av. */}
      {showAvatar ? (
        avatar.avatarReady ? (
          <div className="shrink-0 border-b border-white/10 bg-slate-950/40 p-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-lg shadow-black/20">
              <video
                ref={avatar.videoRef}
                autoPlay
                playsInline
                muted={avatar.connectionState !== "speaking"}
                className="h-full w-full object-cover"
              />
              {avatar.connectionState === "speaking" ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-linear-to-r from-cyan-400 via-purple-400 to-cyan-400 opacity-80" />
              ) : null}
              <button
                type="button"
                onClick={() => setAvatarExpanded((v) => !v)}
                className="absolute top-2 right-2 rounded-md bg-black/55 p-1 text-slate-200 transition-colors hover:bg-black/75 hover:text-white"
                aria-label={avatarExpanded ? "Förminska panel" : "Förstora panel"}
                title={avatarExpanded ? "Förminska panel" : "Förstora panel"}
              >
                {avatarExpanded ? (
                  <Minimize2 className="h-3 w-3" />
                ) : (
                  <Maximize2 className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3"
            aria-live="polite"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  avatar.connectionState === "error" ? "bg-amber-400" : "animate-pulse bg-cyan-300",
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-100">
                  {avatar.connectionState === "error"
                    ? "Avataren kunde inte ansluta"
                    : "Startar avataren..."}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  Textchatten fungerar under tiden.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {avatar.connectionState === "error" ? (
                <button
                  type="button"
                  onClick={() => void avatar.reconnect()}
                  className="rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-slate-100 transition-colors hover:bg-white/10"
                >
                  Försök igen
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAvatarMode(false)}
                className="rounded-full px-2.5 py-1.5 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                Endast text
              </button>
            </div>
          </div>
        )
      ) : null}

      <div ref={scrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto px-4 py-3">
        <div ref={scrollContentRef} className="flex min-h-full flex-col space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 text-center text-sm text-slate-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_28px_rgba(34,211,238,0.08)]">
                <Bot className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <p className="font-medium text-white">{content.emptyTitle}</p>
                <p className="mx-auto mt-1.5 max-w-[270px] text-xs leading-5 text-slate-300/80">
                  {content.emptyBody}
                </p>
              </div>
              {DID_AVATAR_AVAILABLE && !avatarMode ? (
                <button
                  type="button"
                  onClick={() => setAvatarMode(true)}
                  className="mt-1 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-400/15"
                >
                  <Video className="h-3.5 w-3.5" />
                  Starta med avatar
                </button>
              ) : null}
            </div>
          ) : null}
          {messages.map((msg, index) => (
            <OpenClawMessage
              key={msg.id}
              msg={msg}
              streaming={isStreaming && index === messages.length - 1 && msg.role === "assistant"}
            />
          ))}
          {listening && interimTranscript ? (
            <div className="flex w-full justify-end">
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md border border-cyan-400/40 bg-cyan-400/15 px-3.5 py-2.5 text-sm leading-relaxed text-cyan-100/90 italic">
                {interimTranscript}
              </div>
            </div>
          ) : null}
        </div>
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
