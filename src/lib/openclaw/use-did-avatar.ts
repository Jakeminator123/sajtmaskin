"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DidConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "error";

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const agentRef = useRef<DidAgentManager | null>(null);
  const sdkModuleRef = useRef<DidClientSdk | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  const syncVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, []);

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
        onSrcObjectReady(value: MediaStream) {
          if (agentRef.current !== createdAgent) return;
          streamRef.current = value;
          setAvatarReady(true);
          syncVideoPlayback();
        },
        onConnectionStateChange(state: string) {
          if (agentRef.current !== createdAgent) return;
          if (state === "connected") updateConnectionState("connected");
          else if (state === "failed") updateConnectionState("error");
          else if (state === "disconnected" || state === "closed")
            updateConnectionState("idle");
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
  }, [loadSdk, syncVideoPlayback, updateConnectionState]);

  const connect = useCallback(async () => {
    if (!AGENT_ID || !CLIENT_KEY) return;
    if (
      connectionStateRef.current === "connecting" ||
      connectionStateRef.current === "connected" ||
      connectionStateRef.current === "speaking"
    )
      return;

    const generation = ++connectionGenerationRef.current;
    try {
      updateConnectionState("connecting");
      const agent = await initAgent(generation);
      if (generation !== connectionGenerationRef.current) return;
      if (!agent) {
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
        updateConnectionState("error");
      }
    }
  }, [initAgent, updateConnectionState]);

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
    const agent = agentRef.current;
    agentRef.current = null;
    streamRef.current = null;
    void safelyDisconnectAgent(agent);
    updateConnectionState("idle");
    setAvatarReady(false);
  }, [updateConnectionState]);

  const reconnect = useCallback(async () => {
    const generation = ++connectionGenerationRef.current;
    const previousAgent = agentRef.current;
    agentRef.current = null;
    streamRef.current = null;
    setAvatarReady(false);
    updateConnectionState("idle");
    await safelyDisconnectAgent(previousAgent);
    if (generation !== connectionGenerationRef.current) return;
    await connect();
  }, [connect, updateConnectionState]);

  useEffect(() => {
    if (enabled) {
      void connect();
    } else {
      disconnect();
    }
  }, [connect, disconnect, enabled]);

  useEffect(() => {
    const generation = connectionGenerationRef;
    const activeAgent = agentRef;
    const activeStream = streamRef;
    return () => {
      ++generation.current;
      const agent = activeAgent.current;
      activeAgent.current = null;
      activeStream.current = null;
      void safelyDisconnectAgent(agent);
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
