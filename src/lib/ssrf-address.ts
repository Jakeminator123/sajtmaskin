import net from "node:net";

function parseIpv4Literal(host: string): string | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets.join(".");
}

function ipv4ToHextets(ipv4: string): [number, number] {
  const [a, b, c, d] = ipv4.split(".").map(Number);
  return [(a << 8) | b, (c << 8) | d];
}

function hextetsToIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function parseHextetList(side: string): number[] | null {
  if (side === "") return [];
  const hextets: number[] = [];
  for (const part of side.split(":")) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    hextets.push(Number.parseInt(part, 16));
  }
  return hextets;
}

/**
 * Rewrite an IPv4 tail (`::ffff:127.0.0.1`) into two hextets so the regular
 * IPv6 expander can run. DNS and Node both emit this form for mapped addresses.
 */
function normalizeIpv4Tail(host: string): string | null {
  const match = host.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!match) return host;
  const ipv4 = parseIpv4Literal(match[2]);
  if (!ipv4) return null;
  const [hi, lo] = ipv4ToHextets(ipv4);
  return `${match[1]}${hi.toString(16)}:${lo.toString(16)}`;
}

type ExpandedIpv6 = {
  hextets: readonly number[];
  mappedIpv4: string | null;
};

function expandIpv6(host: string): ExpandedIpv6 | null {
  const raw = normalizeIpv4Tail(host.toLowerCase().split("%")[0] ?? "");
  if (!raw) return null;
  if (raw.includes(":::")) return null;

  const sides = raw.split("::");
  if (sides.length > 2) return null;

  const left = parseHextetList(sides[0] ?? "");
  const right = sides.length === 2 ? parseHextetList(sides[1] ?? "") : [];
  if (!left || !right) return null;

  const explicit = left.length + right.length;
  if (explicit > 8) return null;
  if (sides.length === 1 && explicit !== 8) return null;

  const zeros = sides.length === 2 ? 8 - explicit : 0;
  const hextets = [...left, ...Array<number>(zeros).fill(0), ...right];
  if (hextets.length !== 8) return null;

  const mapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
      ? hextetsToIpv4(hextets[6] ?? 0, hextets[7] ?? 0)
      : null;

  return { hextets, mappedIpv4: mapped };
}

function matchesPrefix(hextets: readonly number[], prefix: number[], prefixBits: number): boolean {
  let bitsLeft = prefixBits;
  for (let i = 0; i < prefix.length && bitsLeft > 0; i += 1) {
    const take = Math.min(16, bitsLeft);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((hextets[i] & mask) !== (prefix[i] & mask)) return false;
    bitsLeft -= take;
  }
  return bitsLeft === 0;
}

function isPrivateIpv4(host: string): boolean {
  const parsed = parseIpv4Literal(host);
  if (!parsed) return true;
  const [a, b, c] = parsed.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8 "this" network
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 anycast
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const expanded = expandIpv6(host);
  if (!expanded) return true;
  if (expanded.mappedIpv4) return isPrivateIpv4(expanded.mappedIpv4);

  const { hextets } = expanded;
  const unspecified = hextets.every((value) => value === 0);
  const loopback = hextets.slice(0, 7).every((value) => value === 0) && hextets[7] === 1;
  if (unspecified || loopback) return true;
  // Deprecated IPv4-compatible `::a.b.c.d` (`::/96`, hextet 5 ≠ 0xffff).
  // Policy: same as mapped — classify the embedded IPv4. Public destinations
  // such as `::8.8.8.8` stay allowed; RFC1918/loopback/link-local do not.
  if (hextets.slice(0, 6).every((value) => value === 0)) {
    return isPrivateIpv4(hextetsToIpv4(hextets[6] ?? 0, hextets[7] ?? 0));
  }

  // Well-known NAT64 prefix. A local translator would turn the last 32 bits
  // into an IPv4 connect, so the prefix is never a safe global destination.
  if (matchesPrefix(hextets, [0x64, 0xff9b, 0, 0, 0, 0], 96)) return true;
  if (matchesPrefix(hextets, [0x0100, 0, 0, 0], 64)) return true; // 100::/64 discard
  if (matchesPrefix(hextets, [0x2001, 0x0db8], 32)) return true; // documentation
  // Teredo (2001:0000::/32): the client IPv4 is XOR-encoded in the last 32 bits
  // and can be loopback, RFC1918 or link-local. Fail closed — do not connect.
  if (matchesPrefix(hextets, [0x2001, 0], 32)) return true;
  if (matchesPrefix(hextets, [0xfc00], 7)) return true; // unique-local
  if (matchesPrefix(hextets, [0xfe80], 10)) return true; // link-local
  if (matchesPrefix(hextets, [0xff00], 8)) return true; // multicast
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
