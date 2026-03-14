"use client";

import { useState } from "react";

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

function buildShareUrl(agentId: string, clientKey: string): string {
  return `https://studio.d-id.com/agents/share?id=${encodeURIComponent(agentId)}&key=${encodeURIComponent(clientKey)}`;
}

export function DidAvatarEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!AGENT_ID || !CLIENT_KEY) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
        Saknar publika env-vars: <code>NEXT_PUBLIC_AVATAR_AGENT_ID</code> eller{" "}
        <code>NEXT_PUBLIC_AVATAR_CLIENT_KEY</code>.
      </div>
    );
  }

  const src = buildShareUrl(AGENT_ID, CLIENT_KEY);

  return (
    <div className="relative min-h-[720px] w-full overflow-hidden rounded-2xl bg-background/80">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm text-muted-foreground">Laddar avatar...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            D-ID-embedden kunde inte laddas. Testa{" "}
            <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
              direktlänken
            </a>{" "}
            istället.
          </div>
        </div>
      )}
      <iframe
        src={src}
        allow="camera; microphone; autoplay; clipboard-write"
        className={`h-full min-h-[720px] w-full border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
