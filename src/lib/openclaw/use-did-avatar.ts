"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import {
  registerDidStreamRelease,
  releaseDidStream,
  toDidStreamIdentity,
  type DidStreamIdentity,
} from "./did-stream-release";

export type DidConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "error";

/**
 * Tak för hur länge "Startar avataren..." får stå kvar. D-ID svarar `403 Max
 * user sessions reached` när kontots samtidiga strömmar är slut, och SDK:n
 * rapporterar inte alltid det som ett kastat fel — utan deadline blir ett fullt
 * konto en evig spinner i stället för ett felläge med retry-knapp.
 */
export const DID_CONNECT_TIMEOUT_MS = 20_000;

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
const AVATAR_ENABLED = sanitizePublicEnv(process.env.NEXT_PUBLIC_AVATAR_ENABLED) === "1";

/** True when both public D-ID keys are present (regardless of the enable-flag). */
export const AVATAR_KEYS_PRESENT = Boolean(AGENT_ID && CLIENT_KEY);
/** True when the build-time enable-flag `NEXT_PUBLIC_AVATAR_ENABLED` is set to "1". */
export const AVATAR_FLAG_ENABLED = AVATAR_ENABLED;

// The avatar is active ONLY when the explicit enable-flag is "1" AND both public
// D-ID keys are present. Default (flag unset or != "1") => avatar inactive, even
// with keys, so the keys can live in every environment while staying off until
// the flag is flipped to "1" per environment.
export const DID_AVATAR_AVAILABLE = Boolean(AVATAR_ENABLED && AGENT_ID && CLIENT_KEY);

type DidClientSdk = typeof import("@d-id/client-sdk");
type DidAgentManager = Awaited<ReturnType<DidClientSdk["createAgentManager"]>>;

async function safelyDisconnectAgent(agent: DidAgentManager | null) {
  if (!agent?.disconnect) return;
  await agent.disconnect().catch(() => {});
}

export function truncateForSpeech(text: string, maxSentences = 3): string {
  const clean = text
    .replace(/[*_`#\[\]]/g, "")
    .replace(/\n{2,}/g, " ")
    .trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return clean.slice(0, 200);
  return sentences.slice(0, maxSentences).join(" ").trim();
}

export function useDidAvatar(options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && DID_AVATAR_AVAILABLE;

  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const agentRef = useRef<DidAgentManager | null>(null);
  const sdkModuleRef = useRef<DidClientSdk | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Strömmens serveridentitet, så en stängd flik kan lämna tillbaka platsen i
  // D-ID:s samtidighetskvot i stället för att ockupera den till timeout.
  const didStreamRef = useRef<DidStreamIdentity | null>(null);
  const connectDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Varje connect/reconnect/disconnect får en ny generation. Asynkrona SDK-
  // steg som blir klara efter att användaren valt "Endast text" får då aldrig
  // återaktivera eller lämna en D-ID-session levande i bakgrunden.
  const connectionGenerationRef = useRef(0);
  const connectionStateRef = useRef<DidConnectionState>("idle");

  const [connectionState, setConnectionState] =
    useState<DidConnectionState>("idle");
  const [avatarReady, setAvatarReady] = useState(false);

  const updateConnectionState = useCallback((state: DidConnectionState) => {
    connectionStateRef.current = state;
    setConnectionState(state);
  }, []);

  const clearConnectDeadline = useCallback(() => {
    if (connectDeadlineRef.current === null) return;
    clearTimeout(connectDeadlineRef.current);
    connectDeadlineRef.current = null;
  }, []);

  const syncVideoPlayback = useCallback(() => {
    const video = videoNodeRef.current;
    if (!video) return;
    const stream = streamRef.current;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  }, []);

  // <video> renderas först när avatarReady är true, så onSrcObjectReady
  // hinner köra medan noden fortfarande saknas. Callback-ref fäster
  // streamen vid mount; ny MediaStream ersätter den gamla.
  const videoRef = useCallback<RefCallback<HTMLVideoElement>>((node) => {
    videoNodeRef.current = node;
    if (node) syncVideoPlayback();
  }, [syncVideoPlayback]);

  const loadSdk = useCallback(async () => {
    if (sdkModuleRef.current) return sdkModuleRef.current;
    sdkModuleRef.current = await import("@d-id/client-sdk");
    return sdkModuleRef.current;
  }, []);

  const initAgent = useCallback(async (generation: number) => {
    if (!AGENT_ID || !CLIENT_KEY) return null;
    if (agentRef.current) return agentRef.current;

    const did = await loadSdk();
    if (generation !== connectionGenerationRef.current) return null;

    let createdAgent: DidAgentManager | null = null;
    const agent = await did.createAgentManager(AGENT_ID, {
      auth: { type: "key", clientKey: CLIENT_KEY },
      callbacks: {
        onStreamCreated(value: unknown) {
          if (agentRef.current !== createdAgent) return;
          didStreamRef.current = toDidStreamIdentity(value);
        },
        onSrcObjectReady(value: MediaStream) {
          if (agentRef.current !== createdAgent) return;
          // Videon är framme — deadlinen har gjort sitt.
          clearConnectDeadline();
          streamRef.current = value;
          setAvatarReady(true);
          syncVideoPlayback();
        },
        onConnectionStateChange(state: string) {
          if (agentRef.current !== createdAgent) return;
          if (state === "connected") updateConnectionState("connected");
          else if (state === "failed") {
            clearConnectDeadline();
            updateConnectionState("error");
          } else if (state === "disconnected" || state === "closed") {
            clearConnectDeadline();
            updateConnectionState("idle");
          }
        },
        onVideoStateChange(state: string) {
          if (agentRef.current !== createdAgent) return;
          if (state === "STOP") updateConnectionState("connected");
          else if (state === "speaking") updateConnectionState("speaking");
          syncVideoPlayback();
        },
      },
      streamOptions: {
        compatibilityMode: "auto",
        streamWarmup: true,
      },
    });
    createdAgent = agent;

    if (generation !== connectionGenerationRef.current) {
      await safelyDisconnectAgent(agent);
      return null;
    }
    agentRef.current = agent;
    return agent;
  }, [clearConnectDeadline, loadSdk, syncVideoPlayback, updateConnectionState]);

  const connect = useCallback(async () => {
    if (!AGENT_ID || !CLIENT_KEY) return;
    if (
      connectionStateRef.current === "connecting" ||
      connectionStateRef.current === "connected" ||
      connectionStateRef.current === "speaking"
    )
      return;

    const generation = ++connectionGenerationRef.current;
    // Deadlinen löper från första försöket till att videon faktiskt är framme,
    // inte bara till att connect() resolvar: ett fullt D-ID-konto kan ge en
    // ansluten agent som aldrig levererar någon MediaStream.
    clearConnectDeadline();
    connectDeadlineRef.current = setTimeout(() => {
      connectDeadlineRef.current = null;
      if (generation !== connectionGenerationRef.current) return;
      if (connectionStateRef.current === "speaking") return;
      const stalled = agentRef.current;
      agentRef.current = null;
      streamRef.current = null;
      void safelyDisconnectAgent(stalled);
      setAvatarReady(false);
      updateConnectionState("error");
    }, DID_CONNECT_TIMEOUT_MS);

    try {
      updateConnectionState("connecting");
      const agent = await initAgent(generation);
      if (generation !== connectionGenerationRef.current) return;
      if (!agent) {
        clearConnectDeadline();
        updateConnectionState("error");
        return;
      }
      await agent.connect();
      if (generation !== connectionGenerationRef.current) {
        if (agentRef.current === agent) agentRef.current = null;
        await safelyDisconnectAgent(agent);
        return;
      }
      updateConnectionState("connected");
    } catch {
      if (generation === connectionGenerationRef.current) {
        clearConnectDeadline();
        updateConnectionState("error");
      }
    }
  }, [clearConnectDeadline, initAgent, updateConnectionState]);

  const speak = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized || !agentRef.current?.speak) return;

    try {
      updateConnectionState("speaking");
      await agentRef.current.speak({ type: "text", input: normalized });
    } catch {
      if (agentRef.current) updateConnectionState("connected");
    }
  }, [updateConnectionState]);

  const disconnect = useCallback(() => {
    ++connectionGenerationRef.current;
    clearConnectDeadline();
    const agent = agentRef.current;
    agentRef.current = null;
    streamRef.current = null;
    didStreamRef.current = null;
    void safelyDisconnectAgent(agent);
    updateConnectionState("idle");
    setAvatarReady(false);
  }, [clearConnectDeadline, updateConnectionState]);

  const reconnect = useCallback(async () => {
    const generation = ++connectionGenerationRef.current;
    clearConnectDeadline();
    const previousAgent = agentRef.current;
    agentRef.current = null;
    streamRef.current = null;
    didStreamRef.current = null;
    setAvatarReady(false);
    updateConnectionState("idle");
    // Vänta in att den gamla strömmen är släppt innan en ny begärs. Med bara
    // två samtidiga platser skulle ett parallellt försök annars tävla mot sin
    // egen föregångare om den sista platsen.
    await safelyDisconnectAgent(previousAgent);
    if (generation !== connectionGenerationRef.current) return;
    await connect();
  }, [clearConnectDeadline, connect, updateConnectionState]);

  useEffect(() => {
    if (enabled) {
      void connect();
    } else {
      disconnect();
    }
  }, [connect, disconnect, enabled]);

  useEffect(() => {
    if (!avatarReady) return;
    syncVideoPlayback();
  }, [avatarReady, syncVideoPlayback]);

  // Stängd flik och omladdning kör ingen React-cleanup. Utan det här släppet
  // ockuperar den övergivna strömmen en av kontots två platser tills D-ID:s
  // egen timeout löper ut, och nästa besökare får 403.
  useEffect(
    () => registerDidStreamRelease(() => didStreamRef.current, CLIENT_KEY),
    [],
  );

  useEffect(() => {
    const generation = connectionGenerationRef;
    const activeAgent = agentRef;
    const activeStream = streamRef;
    const activeDidStream = didStreamRef;
    const deadline = connectDeadlineRef;
    return () => {
      ++generation.current;
      if (deadline.current !== null) {
        clearTimeout(deadline.current);
        deadline.current = null;
      }
      // React StrictMode kör setup → cleanup → setup i utveckling. Nollställ
      // den synkrona vakten utan en state-uppdatering på den avmonterade
      // instansen, så nästa legitima setup inte fastnar bakom "connecting".
      connectionStateRef.current = "idle";
      const agent = activeAgent.current;
      const stream = activeDidStream.current;
      activeAgent.current = null;
      activeStream.current = null;
      activeDidStream.current = null;
      if (agent) {
        void safelyDisconnectAgent(agent);
      } else if (stream) {
        // Unmount mitt i uppkopplingen: agenten hann aldrig landa i refen, men
        // strömmen kan redan finnas hos D-ID. Släpp den direkt.
        releaseDidStream(stream, CLIENT_KEY);
      }
    };
  }, []);

  return {
    connectionState,
    avatarReady,
    videoRef,
    connect,
    reconnect,
    speak,
    disconnect,
    available: DID_AVATAR_AVAILABLE,
  };
}
