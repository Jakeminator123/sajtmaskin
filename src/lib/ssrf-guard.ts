import { lookup } from "node:dns/promises";
import net from "node:net";
import {
  fetchWithPinnedDns,
  PINNED_ADDRESS_BLOCKED_MESSAGE,
  type PinnedFetchResult,
} from "@/lib/capture/pinned-fetch";
import { isResolvedAddressPrivate } from "@/lib/ssrf-address";

export { isResolvedAddressPrivate } from "@/lib/ssrf-address";

const PREVIEW_ALLOWED_HOST_SUFFIXES = [".vusercontent.net"];
const FETCH_TIMEOUT_MS = 15_000;

function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase().trim().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

/**
 * True if `hostname` RESOLVES (DNS) to any private/internal address.
 *
 * `isDisallowedHost` only blocks LITERAL private IPs, so a public hostname that
 * resolves to e.g. `127.0.0.1` or `169.254.169.254` (cloud metadata) slips
 * through — the classic DNS-based SSRF hole (BUG-SWARM G#40). Literal IPs are
 * already covered by `isDisallowedHost`, so we only resolve real names.
 *
 * NOTE: this is a check on a NAME, so a residual TOCTOU window remains — the
 * caller re-resolves at connect time and the record could flip (DNS rebinding)
 * between this check and the actual connection. Callers that hand the name to
 * something which resolves it again must pin the address instead: see
 * `@/lib/capture/pinned-fetch`, which validates and connects to the same
 * record. Use this only as a cheap pre-filter on top of that.
 */
export async function hostResolvesToPrivate(hostname: string): Promise<boolean> {
  const host = normalizeHost(hostname);
  if (!host || net.isIP(host) !== 0) return false; // literal IP → already checked sync
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    return false; // unresolvable → fetch fails on its own, no SSRF reachable
  }
  return records.some((r) => isResolvedAddressPrivate(r.address));
}

export function isDisallowedHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (net.isIP(host) !== 0) return isResolvedAddressPrivate(host);
  return false;
}

/**
 * Narrow loopback check: `localhost` / `*.localhost` / `127.0.0.0/8` / `::1`.
 *
 * Used to re-allow the app's OWN origin (which is loopback in local dev) through
 * the SSRF guard for the compatibility preview, WITHOUT re-allowing other
 * private/metadata ranges. The argument MUST be derived from a parsed URL host
 * (e.g. `new URL(body.url).hostname`) — never from the client-controllable
 * `Host` header, or a caller could forge same-origin and bypass the guard.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  if (net.isIP(host) === 4) return host.startsWith("127.");
  return false;
}

export function isAllowedPreviewHost(url: URL): boolean {
  return PREVIEW_ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

export function validateSsrfTarget(
  target: URL,
  opts?: { allowlistOnly?: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (!["http:", "https:"].includes(target.protocol)) {
    return { ok: false, reason: "Only http/https URLs allowed" };
  }
  if (target.username || target.password) {
    return { ok: false, reason: "URL credentials are not allowed" };
  }
  if (isDisallowedHost(target.hostname)) {
    return { ok: false, reason: "Forbidden host (private/internal network)" };
  }
  if (opts?.allowlistOnly && !isAllowedPreviewHost(target)) {
    return { ok: false, reason: "Host not in allowlist (only *.vusercontent.net)" };
  }
  return { ok: true };
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = [
  "authorization",
  "cookie",
  "cookie2",
  "proxy-authorization",
] as const;
const BODY_REDIRECT_HEADERS = [
  "content-encoding",
  "content-language",
  "content-location",
  "content-type",
] as const;

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const normalized = new Headers(headers);
  const out: Record<string, string> = {};
  normalized.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function requestBodyToBuffer(body: BodyInit | null | undefined): Promise<Buffer | null> {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  // FormData needs a generated multipart boundary and ReadableStream needs
  // backpressure-aware forwarding. Neither is used by current callers; failing
  // closed is safer than silently sending a malformed or replayable body.
  throw new TypeError("safeFetch does not support FormData or streaming request bodies");
}

function responseFromPinned(result: PinnedFetchResult): Response {
  return new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

function stripHeadersForRedirect(
  headers: Record<string, string>,
  from: URL,
  to: URL,
): void {
  const crossesOrigin = from.origin !== to.origin;
  const downgradesTransport = from.protocol === "https:" && to.protocol === "http:";
  if (!crossesOrigin && !downgradesTransport) return;
  for (const header of SENSITIVE_REDIRECT_HEADERS) delete headers[header];
}

function rewriteRequestForRedirect(
  status: number,
  method: string,
  headers: Record<string, string>,
): { method: string; dropBody: boolean } {
  const dropBody =
    (status === 303 && method !== "HEAD") ||
    ((status === 301 || status === 302) && method === "POST");
  if (!dropBody) return { method, dropBody: false };
  for (const header of BODY_REDIRECT_HEADERS) delete headers[header];
  return { method: "GET", dropBody: true };
}

function isPinnedAddressBlocked(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PINNED_ADDRESS_BLOCKED_MESSAGE);
}

export async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number; allowlistOnly?: boolean },
): Promise<Response> {
  const { timeoutMs = FETCH_TIMEOUT_MS, allowlistOnly = false, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = rest.signal
    ? combineSignals(rest.signal, controller.signal)
    : controller.signal;

  try {
    let currentUrl: URL;
    try {
      currentUrl = new URL(url);
      const initialCheck = validateSsrfTarget(currentUrl, { allowlistOnly });
      if (!initialCheck.ok) {
        return new Response(`Request blocked: ${initialCheck.reason}`, { status: 403 });
      }
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    let method = (rest.method ?? "GET").toUpperCase();
    let headers = headersToRecord(rest.headers);
    let body = await requestBodyToBuffer(rest.body);
    let redirectCount = 0;

    for (;;) {
      // This DNS lookup is only an early rejection. Security does not depend on
      // its result: fetchWithPinnedDns validates the address returned to the
      // socket's own lookup callback, so the checked record is the connected
      // record even if DNS changes between these two calls.
      if (await hostResolvesToPrivate(currentUrl.hostname)) {
        const prefix = redirectCount === 0 ? "Request" : "Redirect";
        return new Response(`${prefix} blocked: hostname resolves to a private/internal IP`, {
          status: 403,
        });
      }

      let pinned: PinnedFetchResult;
      try {
        pinned = await fetchWithPinnedDns(currentUrl.toString(), {
          method,
          headers,
          body,
          timeoutMs,
          signal,
        });
      } catch (error) {
        if (!isPinnedAddressBlocked(error)) throw error;
        const prefix = redirectCount === 0 ? "Request" : "Redirect";
        return new Response(
          `${prefix} blocked: hostname resolved to a private/internal IP at connect time`,
          { status: 403 },
        );
      }

      const response = responseFromPinned(pinned);
      if (!REDIRECT_STATUSES.has(pinned.status)) return response;

      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) {
        return new Response("Too many redirects", { status: 400 });
      }

      const location = pinned.headers.location;
      if (!location) return response;

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        return response;
      }

      const check = validateSsrfTarget(redirectUrl, { allowlistOnly });
      if (!check.ok) {
        return new Response(`Redirect blocked: ${check.reason}`, { status: 403 });
      }

      stripHeadersForRedirect(headers, currentUrl, redirectUrl);
      const rewrite = rewriteRequestForRedirect(pinned.status, method, headers);
      method = rewrite.method;
      if (rewrite.dropBody) body = null;
      currentUrl = redirectUrl;
    }
  } finally {
    clearTimeout(timer);
  }
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener("abort", abort, { once: true });
  b.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
