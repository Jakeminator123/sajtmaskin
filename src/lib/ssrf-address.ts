import net from "node:net";

function parseIpv4Literal(host: string): string | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const normalized = parts.map((part) => Number(part));
  if (normalized.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return normalized.join(".");
}

function extractMappedIpv4FromIpv6(host: string): string | null {
  const normalized = host.toLowerCase();
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return parseIpv4Literal(dotted[1]);

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const upper = Number.parseInt(hex[1], 16);
  const lower = Number.parseInt(hex[2], 16);
  return `${(upper >> 8) & 0xff}.${upper & 0xff}.${(lower >> 8) & 0xff}.${lower & 0xff}`;
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
  const mappedIpv4 = extractMappedIpv4FromIpv6(normalized);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
  if (normalized === "::" || normalized === "::1") return true;

  const firstHextet = normalized.split(":", 1)[0];
  const first = Number.parseInt(firstHextet, 16);
  if (!Number.isFinite(first)) return false;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * True when a resolved address must never be reachable through an SSRF-capable
 * fetch. This function is deliberately hostname-free: callers pass the exact
 * address returned to the socket lookup callback, closing DNS-rebinding TOCTOU.
 */
export function isResolvedAddressPrivate(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}
