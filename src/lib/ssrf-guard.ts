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

export function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = FETCH_TIMEOUT_MS, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = rest.signal
    ? combineSignals(rest.signal, controller.signal)
    : controller.signal;

  return fetch(url, { ...rest, signal, redirect: "manual" }).then(
    async (res) => {
      clearTimeout(timer);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return res;
        let redirectUrl: URL;
        try {
          redirectUrl = new URL(location, url);
        } catch {
          return res;
        }
        const check = validateSsrfTarget(redirectUrl);
        if (!check.ok) {
          return new Response(`Redirect blocked: ${check.reason}`, { status: 403 });
        }
        return fetch(redirectUrl.toString(), { ...rest, signal: controller.signal, redirect: "follow" }).finally(
          () => clearTimeout(timer),
        );
      }
      return res;
    },
    (err) => {
      clearTimeout(timer);
      throw err;
    },
  );
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
