import { lookup } from "node:dns/promises";
import net from "node:net";

const PREVIEW_ALLOWED_HOST_SUFFIXES = [".vusercontent.net"];
const FETCH_TIMEOUT_MS = 15_000;

function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase().trim().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

/** True if a single resolved IP literal is private/internal. Handles
 *  IPv4-mapped IPv6 (`::ffff:a.b.c.d`) by checking the embedded v4. */
function isResolvedAddressPrivate(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return isPrivateIpv6(address);
  }
  return true; // unparseable → treat as disallowed (defensive)
}

/**
 * True if `hostname` RESOLVES (DNS) to any private/internal address.
 *
 * `isDisallowedHost` only blocks LITERAL private IPs, so a public hostname that
 * resolves to e.g. `127.0.0.1` or `169.254.169.254` (cloud metadata) slips
 * through — the classic DNS-based SSRF hole (BUG-SWARM G#40). Literal IPs are
 * already covered by `isDisallowedHost`, so we only resolve real names.
 *
 * NOTE: a residual TOCTOU window remains — `fetch` re-resolves at connect time
 * and the record could flip (DNS rebinding) between this check and the actual
 * connection. Closing that fully needs connect-time IP pinning (follow-up); this
 * closes the common static-resolution hole that the routes are exposed to today.
 */
async function hostResolvesToPrivate(hostname: string): Promise<boolean> {
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

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
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
  if (isDisallowedHost(target.hostname)) {
    return { ok: false, reason: "Forbidden host (private/internal network)" };
  }
  if (opts?.allowlistOnly && !isAllowedPreviewHost(target)) {
    return { ok: false, reason: "Host not in allowlist (only *.vusercontent.net)" };
  }
  return { ok: true };
}

const MAX_REDIRECTS = 5;

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
    let currentUrl: string;
    let currentHostname: string;
    try {
      const initialUrl = new URL(url);
      const initialCheck = validateSsrfTarget(initialUrl, { allowlistOnly });
      if (!initialCheck.ok) {
        return new Response(`Request blocked: ${initialCheck.reason}`, { status: 403 });
      }
      currentUrl = initialUrl.toString();
      currentHostname = initialUrl.hostname;
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    if (await hostResolvesToPrivate(currentHostname)) {
      return new Response("Request blocked: hostname resolves to a private/internal IP", {
        status: 403,
      });
    }

    let redirectCount = 0;

    for (;;) {
      const res = await fetch(currentUrl, { ...rest, signal, redirect: "manual" });

      if (res.status < 300 || res.status >= 400) {
        return res;
      }

      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        return new Response("Too many redirects", { status: 400 });
      }

      const location = res.headers.get("location");
      if (!location) return res;

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        return res;
      }

      const check = validateSsrfTarget(redirectUrl, { allowlistOnly });
      if (!check.ok) {
        return new Response(`Redirect blocked: ${check.reason}`, { status: 403 });
      }

      if (await hostResolvesToPrivate(redirectUrl.hostname)) {
        return new Response("Redirect blocked: hostname resolves to a private/internal IP", {
          status: 403,
        });
      }

      currentUrl = redirectUrl.toString();
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
