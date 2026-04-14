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

export const DID_AVATAR_AVAILABLE = Boolean(AGENT_ID && CLIENT_KEY);

type DidClientSdk = typeof import("@d-id/client-sdk");
type DidAgentManager = Awaited<ReturnType<DidClientSdk["createAgentManager"]>>;

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

  const [connectionState, setConnectionState] =
    useState<DidConnectionState>("idle");
  const [avatarReady, setAvatarReady] = useState(false);

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

  const initAgent = useCallback(async () => {
    if (!AGENT_ID || !CLIENT_KEY) return null;
    if (agentRef.current) return agentRef.current;

    const did = await loadSdk();
    const agent = await did.createAgentManager(AGENT_ID, {
      auth: { type: "key", clientKey: CLIENT_KEY },
      callbacks: {
        onSrcObjectReady(value: MediaStream) {
          streamRef.current = value;
          setAvatarReady(true);
          syncVideoPlayback();
        },
        onConnectionStateChange(state: string) {
          if (state === "connected") setConnectionState("connected");
          else if (state === "failed") setConnectionState("error");
          else if (state === "disconnected" || state === "closed")
            setConnectionState("idle");
        },
        onVideoStateChange(state: string) {
          if (state === "STOP") setConnectionState("connected");
          else if (state === "speaking") setConnectionState("speaking");
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
  }, [loadSdk, syncVideoPlayback]);

  const connect = useCallback(async () => {
    if (!AGENT_ID || !CLIENT_KEY) return;
    if (connectionState === "connected" || connectionState === "speaking")
      return;

    try {
      setConnectionState("connecting");
      const agent = await initAgent();
      if (!agent) {
        setConnectionState("error");
        return;
      }
      await agent.connect();
      setConnectionState("connected");
    } catch {
      setConnectionState("error");
    }
  }, [connectionState, initAgent]);

  const speak = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized || !agentRef.current?.speak) return;

    try {
      setConnectionState("speaking");
      await agentRef.current.speak({ type: "text", input: normalized });
    } catch {
      if (agentRef.current) setConnectionState("connected");
    }
  }, []);

  const disconnect = useCallback(() => {
    if (agentRef.current?.disconnect) {
      void agentRef.current.disconnect().catch(() => {});
    }
    agentRef.current = null;
    streamRef.current = null;
    setConnectionState("idle");
    setAvatarReady(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      void connect();
    } else if (
      connectionState !== "idle" ||
      agentRef.current
    ) {
      disconnect();
    }
    // Only react to enabled changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (agentRef.current?.disconnect) {
        void agentRef.current.disconnect().catch(() => {});
      }
      streamRef.current = null;
    };
  }, []);

  return {
    connectionState,
    avatarReady,
    videoRef,
    connect,
    speak,
    disconnect,
    available: DID_AVATAR_AVAILABLE,
  };
}
