import net from "node:net";

/**
 * SSRF guard for server-side fetches/navigations to a client-supplied URL host.
 *
 * Returns `true` when the hostname must NOT be reached from the server:
 * loopback/link-local names, and private / reserved / metadata IP ranges.
 * Shared by the inspector capture + element-map routes (Playwright `page.goto`)
 * so both server-side navigation surfaces enforce the same allow/deny policy.
 */
function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase().trim().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
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
