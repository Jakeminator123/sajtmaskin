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

export const DID_STREAM_RELEASE_TIMEOUT_MS = 4_000;
export const DID_STREAM_RELEASE_BACKOFF_MS = 200;
const DID_STREAM_RELEASE_MAX_ATTEMPTS = 6;

export interface DidStreamIdentity {
  streamId: string;
  sessionId: string;
  agentId: string;
}

export type DidStreamReleaseOutcome =
  | { ok: true; status: number }
  | { ok: false; status: number }
  | { ok: false; reason: "network" };

export interface DidStreamReleaseOptions {
  retry?: boolean;
}

export interface DidStreamReleaseHandlers {
  onHide?: (stream: DidStreamIdentity, release: Promise<DidStreamReleaseOutcome>) => void;
  onPersistedShow?: () => void;
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

function releaseUrl(stream: DidStreamIdentity): string {
  return `${DID_API_BASE}/agents/${encodeURIComponent(stream.agentId)}/streams/${encodeURIComponent(stream.streamId)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function releaseDidStream(
  stream: DidStreamIdentity,
  clientKey: string | undefined,
  options?: DidStreamReleaseOptions,
): Promise<DidStreamReleaseOutcome> {
  if (!clientKey) return { ok: true, status: 0 };
  const retry = options?.retry !== false;
  const deadline = Date.now() + DID_STREAM_RELEASE_TIMEOUT_MS;
  let backoff = DID_STREAM_RELEASE_BACKOFF_MS;
  let last: DidStreamReleaseOutcome = { ok: false, reason: "network" };

  for (let attempt = 1; attempt <= DID_STREAM_RELEASE_MAX_ATTEMPTS; attempt += 1) {
    const controller = retry ? new AbortController() : null;
    const abortTimer = controller
      ? setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()))
      : undefined;
    try {
      const response = await fetch(releaseUrl(stream), {
        method: "DELETE",
        headers: {
          Authorization: `Client-Key ${clientKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: stream.sessionId }),
        keepalive: true,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (response.ok) return { ok: true, status: response.status };
      last = { ok: false, status: response.status };
      if (!retry || response.status < 500) return last;
    } catch {
      last = { ok: false, reason: "network" };
      if (!retry) return last;
    } finally {
      if (abortTimer !== undefined) clearTimeout(abortTimer);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0 || attempt === DID_STREAM_RELEASE_MAX_ATTEMPTS) return last;
    await wait(Math.min(backoff, remaining));
    backoff *= 2;
    if (Date.now() >= deadline) return last;
  }
  return last;
}

export function appendPendingRelease(
  pendingRef: { current: Promise<void> },
  release: Promise<unknown>,
): Promise<void> {
  const queued = pendingRef.current.then(
    () => release.then(() => undefined, () => undefined),
    () => release.then(() => undefined, () => undefined),
  );
  const settled = queued.then(() => undefined, () => undefined);
  pendingRef.current = settled;
  return settled;
}

/**
 * `pagehide` frigör strömmen och får inte vänta. `pageshow` med
 * `persisted === true` betyder att bfcache återställde en sida vars ström
 * redan släppts — då ska anroparen starta om i stället för att återanvända den.
 * Inte `visibilitychange`: att byta flik ska inte klippa samtalet.
 */
export function registerDidStreamRelease(
  getStream: () => DidStreamIdentity | null,
  clientKey: string | undefined,
  handlers?: DidStreamReleaseHandlers,
): () => void {
  if (typeof window === "undefined") return () => {};

  let releasedOnHide = false;

  const onPageHide = () => {
    const stream = getStream();
    if (!stream) return;
    releasedOnHide = true;
    const release = releaseDidStream(stream, clientKey, { retry: false });
    handlers?.onHide?.(stream, release);
    void release;
  };

  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted !== true || !releasedOnHide) return;
    releasedOnHide = false;
    handlers?.onPersistedShow?.();
  };

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
}
