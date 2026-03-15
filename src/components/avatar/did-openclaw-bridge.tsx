"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type BridgeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type ConnectionState = "mock-ready" | "idle" | "connecting" | "connected" | "speaking" | "error";

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: null | (() => void);
  onresult: null | ((event: any) => void);
  onerror: null | ((event: any) => void);
  onend: null | (() => void);
  start: () => void;
  abort: () => void;
};

function sanitizePublicEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed || undefined;
}

const AGENT_ID = sanitizePublicEnv(process.env.NEXT_PUBLIC_AVATAR_AGENT_ID);
const CLIENT_KEY = sanitizePublicEnv(process.env.NEXT_PUBLIC_AVATAR_CLIENT_KEY);

function createMessageId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  const storageKey = "sajtmaskin:avatar-bridge-session";
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const target = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

function connectionLabel(state: ConnectionState) {
  switch (state) {
    case "mock-ready":
      return "Mock avatar";
    case "idle":
      return "Redo att ansluta";
    case "connecting":
      return "Ansluter";
    case "connected":
      return "Ansluten";
    case "speaking":
      return "Talar";
    case "error":
      return "Fel";
    default:
      return "Okänd";
  }
}

function connectionDotClass(state: ConnectionState) {
  switch (state) {
    case "mock-ready":
      return "bg-sky-500";
    case "connected":
    case "speaking":
      return "bg-emerald-500";
    case "connecting":
      return "animate-pulse bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/50";
  }
}

export function DidOpenClawBridge({
  testMode = false,
  iframeHref = "/avatar?mode=iframe",
}: {
  testMode?: boolean;
  iframeHref?: string;
}) {
  const sessionIdRef = useRef("");
  const agentRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const sdkModuleRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingSpeechRef = useRef<string | null>(null);
  const messagesRef = useRef<BridgeMessage[]>([]);

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    testMode ? "mock-ready" : "idle",
  );
  const [messages, setMessages] = useState<BridgeMessage[]>([
    {
      id: "bridge-welcome",
      role: "assistant",
      content:
        "Hej! Här testar vi avataren med OpenClaw som hjärna. Skriv eller tala så skickas innehållet till avatar-bridgen.",
    },
  ]);
  const [textInput, setTextInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [avatarReady, setAvatarReady] = useState(testMode);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSpokenText, setLastSpokenText] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);

  messagesRef.current = messages;

  useEffect(() => {
    sessionIdRef.current = getSessionId();
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      if (agentRef.current?.disconnect) {
        void agentRef.current.disconnect().catch(() => {});
      }
      streamRef.current = null;
    };
  }, []);

  const syncVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, []);

  const loadDidSdk = useCallback(async () => {
    if (sdkModuleRef.current) return sdkModuleRef.current;
    sdkModuleRef.current = await import("@d-id/client-sdk");
    return sdkModuleRef.current;
  }, []);

  const initAgent = useCallback(async () => {
    if (testMode) return null;
    if (!AGENT_ID || !CLIENT_KEY) return null;
    if (agentRef.current) return agentRef.current;

    const did = await loadDidSdk();
    const agent = await did.createAgentManager(AGENT_ID, {
      auth: { type: "key", clientKey: CLIENT_KEY },
      callbacks: {
        onSrcObjectReady(value: MediaStream) {
          streamRef.current = value;
          setAvatarReady(true);
          syncVideoPlayback();
        },
        onConnectionStateChange(state: string) {
          if (state === "connected") {
            setConnectionState("connected");
          } else if (state === "failed") {
            setConnectionState("error");
            setLastError("D-ID-klienten kunde inte ansluta.");
          } else if (state === "disconnected" || state === "closed") {
            setConnectionState("idle");
          }
        },
        onVideoStateChange(state: string) {
          if (state === "STOP") {
            setConnectionState("connected");
          } else if (state === "speaking") {
            setConnectionState("speaking");
          }
          syncVideoPlayback();
        },
      },
      streamOptions: {
        compatibilityMode: "auto",
        streamWarmup: true,
      },
    });
    agentRef.current = agent;
    return agent;
  }, [loadDidSdk, syncVideoPlayback, testMode]);

  const ensureConnected = useCallback(async () => {
    if (testMode) {
      setConnectionState("mock-ready");
      setAvatarReady(true);
      return;
    }
    if (!AGENT_ID || !CLIENT_KEY) return;
    if (connectionState === "connected" || connectionState === "speaking") return;

    try {
      setConnectionState("connecting");
      setLastError(null);
      const agent = await initAgent();
      if (!agent) {
        setConnectionState("error");
        setLastError("D-ID-klienten kunde inte initieras.");
        return;
      }
      await agent.connect();
      setConnectionState("connected");
    } catch (error) {
      setConnectionState("error");
      setLastError(error instanceof Error ? error.message : "Kunde inte ansluta avataren.");
    }
  }, [connectionState, initAgent, testMode]);

  const speakText = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
      setLastSpokenText(normalized);

      if (testMode) {
        setConnectionState("mock-ready");
        return;
      }

      await ensureConnected();
      if (!agentRef.current?.speak) return;

      try {
        setConnectionState("speaking");
        await agentRef.current.speak({ type: "text", input: normalized });
      } catch {
        pendingSpeechRef.current = normalized;
        setConnectionState("connected");
      }
    },
    [ensureConnected, testMode],
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const message = rawText.trim();
      if (!message || thinking) return;

      setThinking(true);
      setInterimTranscript("");
      setLastError(null);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "user",
          content: message,
        },
      ]);

      try {
        const recentMessages = messagesRef.current.map(({ role, content }) => ({ role, content }));
        const res = await fetch("/api/did/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message,
            recentMessages,
          }),
        });

        const payload = (await res.json().catch(() => null)) as
          | {
              reply?: string;
              text?: string;
              error?: string;
            }
          | null;

        if (!res.ok) {
          throw new Error(payload?.error || `Status ${res.status}`);
        }

        const reply = payload?.reply?.trim() || payload?.text?.trim() || "Inget svar från avatar-bridgen.";
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: reply,
          },
        ]);
        await speakText(reply);
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Kunde inte nå avatar-bridgen just nu.";
        setLastError(messageText);
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: `Bryggan svarade inte: ${messageText}`,
            isError: true,
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [speakText, thinking],
  );

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition || thinking) return;

    recognitionRef.current?.abort?.();
    const recognition = new SpeechRecognition();
    recognition.lang = "sv-SE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setLastError(null);
    };
    recognition.onresult = (event: any) => {
      const result = event.results?.[event.results.length - 1];
      const text = result?.[0]?.transcript ?? "";
      setInterimTranscript(text);
      if (result?.isFinal && text.trim()) {
        void sendMessage(text.trim());
      }
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      if (event?.error && event.error !== "aborted" && event.error !== "no-speech") {
        setLastError(`Mikrofonfel: ${event.error}`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage, thinking]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort?.();
    setListening(false);
    setInterimTranscript("");
  }, []);

  const missingEnv = !testMode && (!AGENT_ID || !CLIENT_KEY);

  return (
    <div
      className="overflow-hidden rounded-[28px] border border-border/20 bg-background/70"
      data-testid="avatar-bridge-shell"
    >
      <div className="flex items-center justify-between border-b border-border/20 bg-card/40 px-4 py-3">
        <div>
          <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
            OpenClaw bridge
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            D-ID avatar som presentatör, OpenClaw som hjärna.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-2 rounded-full border border-border/30 px-3 py-1 text-xs"
          data-testid="avatar-bridge-status"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${connectionDotClass(connectionState)}`} />
          <span>{connectionLabel(connectionState)}</span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[24px] border border-border/20 bg-black/80">
          <div className="relative aspect-4/5 min-h-[320px]">
            {!testMode ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={connectionState !== "speaking"}
                className="h-full w-full object-contain object-top"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#1e293b,transparent_55%),linear-gradient(180deg,#0f172a,#020617)] p-6 text-center">
                <div>
                  <div className="mx-auto h-20 w-20 rounded-full border border-sky-400/30 bg-sky-400/10" />
                  <p className="mt-4 text-sm font-medium text-sky-100">Mockad avatartransport</p>
                  <p className="mt-2 text-xs text-sky-100/70">
                    E2E-läge utan riktig D-ID-anslutning.
                  </p>
                </div>
              </div>
            )}

            {!avatarReady && !missingEnv && !testMode && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm text-muted-foreground">
                Förbered D-ID-klienten...
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-[320px] flex-col">
          {missingEnv ? (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
              Saknar publika env-vars för bridge-läget: <code>NEXT_PUBLIC_AVATAR_AGENT_ID</code>{" "}
              eller <code>NEXT_PUBLIC_AVATAR_CLIENT_KEY</code>.
              <div className="mt-3">
                <Link className="underline" href={iframeHref} data-testid="avatar-bridge-fallback-link">
                  Byt till iframe-fallback
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {!testMode && (
                  <button
                    type="button"
                    onClick={() => void ensureConnected()}
                    className="rounded-xl border border-border/30 bg-card/50 px-3 py-2 text-sm"
                    data-testid="avatar-bridge-connect"
                  >
                    Anslut avatar
                  </button>
                )}
                <Link
                  href={iframeHref}
                  className="rounded-xl border border-border/30 bg-card/50 px-3 py-2 text-sm"
                  data-testid="avatar-bridge-fallback-link"
                >
                  Öppna iframe-fallback
                </Link>
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border/20 bg-card/20 p-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : message.isError
                            ? "border border-red-500/20 bg-red-500/10 text-foreground"
                            : "bg-muted/70 text-foreground"
                      }`}
                    >
                      <p
                        data-testid={
                          message.role === "assistant" ? "avatar-bridge-last-assistant" : undefined
                        }
                      >
                        {message.content}
                      </p>
                    </div>
                  </div>
                ))}

                {interimTranscript && listening && (
                  <div className="rounded-xl border border-dashed border-primary/30 px-3 py-2 text-sm text-muted-foreground">
                    Lyssnar: {interimTranscript}
                  </div>
                )}

                {thinking && (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40" />
                    Tänker...
                  </div>
                )}
              </div>

              {(lastError || testMode) && (
                <div
                  className="mt-4 rounded-2xl border border-border/20 bg-card/30 p-3 text-xs text-muted-foreground"
                  data-testid="avatar-bridge-debug"
                >
                  {lastError ? `Senaste fel: ${lastError}` : "Testläge aktivt: mockad D-ID-transport."}
                  {lastSpokenText ? ` Senaste tal: ${lastSpokenText}` : ""}
                </div>
              )}

              <form
                className="mt-4 flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(textInput);
                  setTextInput("");
                }}
              >
                {speechSupported && (
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={thinking}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      listening ? "bg-red-500 text-white" : "border border-border/30 bg-card/50"
                    }`}
                    data-testid="avatar-bridge-mic"
                  >
                    {listening ? "Stoppa" : "Tala"}
                  </button>
                )}
                <input
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  placeholder="Skriv till avataren..."
                  className="h-11 flex-1 rounded-xl border border-border/30 bg-background px-3 text-sm outline-none"
                  data-testid="avatar-bridge-input"
                />
                <button
                  type="submit"
                  disabled={thinking || !textInput.trim()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  data-testid="avatar-bridge-send"
                >
                  Skicka
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
