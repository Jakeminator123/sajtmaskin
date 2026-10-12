"use client";

/**
 * D-ID räknar samtidiga agent-strömmar mot ett hårt tak per konto — två på den
 * plan vi kör. En flik som stängs eller laddas om kör aldrig Reacts cleanup, så
 * den övergivna strömmen behåller sin plats tills D-ID:s egen timeout löper ut
 * (upp till fem minuter). Två sådana läckor räcker för att nästa besökare ska
 * mötas av `403 {kind: "Forbidden", description: "Max user sessions reached"}`.
 *
 * `keepalive` är det som gör skillnaden: en vanlig fetch avbryts när sidan
 * unloadar, medan en keepalive-request får leva vidare tills den är skickad.
 */

const DID_API_BASE = "https://api.d-id.com";

export interface DidStreamIdentity {
  streamId: string;
  sessionId: string;
  agentId: string;
}

/** Plockar ut strömidentiteten ur SDK:ns `onStreamCreated`-payload. */
export function toDidStreamIdentity(value: unknown): DidStreamIdentity | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const streamId = typeof raw.stream_id === "string" ? raw.stream_id : "";
  const sessionId = typeof raw.session_id === "string" ? raw.session_id : "";
  const agentId = typeof raw.agent_id === "string" ? raw.agent_id : "";
  if (!streamId || !sessionId || !agentId) return null;
  return { streamId, sessionId, agentId };
}

/**
 * Best-effort-frigörning av en ström. Anropas på unload-vägen där
 * `agent.disconnect()` inte hinner klart. Misslyckas den faller vi tillbaka på
 * D-ID:s egen timeout, så den får aldrig kasta.
 */
export function releaseDidStream(
  stream: DidStreamIdentity,
  clientKey: string | undefined,
): void {
  if (!clientKey) return;
  try {
    void fetch(
      `${DID_API_BASE}/agents/${encodeURIComponent(stream.agentId)}/streams/${encodeURIComponent(stream.streamId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Client-Key ${clientKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: stream.sessionId }),
        keepalive: true,
      },
    ).catch(() => {});
  } catch {
    /* unload-vägen — ett misslyckat släpp faller tillbaka på D-ID:s timeout */
  }
}

/**
 * Registrerar en unload-handler som frigör strömmen.
 *
 * Bara `pagehide` — inte `visibilitychange`. Att byta flik ska inte klippa en
 * pågående konversation, och `pagehide` täcker både stängning och navigering.
 */
export function registerDidStreamRelease(
  getStream: () => DidStreamIdentity | null,
  clientKey: string | undefined,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onPageHide = () => {
    const stream = getStream();
    if (stream) releaseDidStream(stream, clientKey);
  };

  window.addEventListener("pagehide", onPageHide);
  return () => window.removeEventListener("pagehide", onPageHide);
}
