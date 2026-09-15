import { normalizeDomainHostname } from "@/lib/live-site-url";

export type DomainOwnershipStatus = "pending" | "verified" | "unknown";
export type DomainDnsStatus = "pending" | "valid" | "invalid" | "unknown";
export type DomainConnectionStatus = "connected" | "not_connected" | "unknown";

export type DnsRecord = {
  type: string;
  host: string;
  value: string;
  purpose: "configuration" | "ownership";
};

export type DomainObservation = {
  domain: string;
  connection: DomainConnectionStatus;
  ownership: DomainOwnershipStatus;
  dns: DomainDnsStatus;
  https: "not_checked";
  activation: "not_started";
  records: DnsRecord[];
};

const RESERVED_DOMAIN_BASES = [
  "sajtmaskin.se",
  "sajtmaskin.com",
  "vercel.app",
  "vercel.com",
  "vercel.sh",
  "now.sh",
] as const;

function isAtOrBelow(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

function isProviderDnsHostname(hostname: string): boolean {
  return /^(?:.+\.)?vercel-dns(?:-\d+)?\.com$/.test(hostname);
}

/**
 * Normalize one customer-supplied hostname without accepting a URL, IP or a
 * platform-owned address. The label-boundary comparison matters here:
 * `notsajtmaskin.se` is a customer domain, while `x.sajtmaskin.se` is not.
 */
export function normalizeObservedDomain(
  value: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  const raw = value.trim();
  if (!raw || raw.includes("://") || /[\s/@?#]/.test(raw)) {
    return { ok: false, error: "Ange ett giltigt domännamn utan protokoll eller sökväg." };
  }

  const domain = normalizeDomainHostname(raw);
  if (
    !domain ||
    !domain.includes(".") ||
    /^\d+(?:\.\d+){3}$/.test(domain) ||
    /\.\d+$/.test(domain)
  ) {
    return { ok: false, error: "Ange ett giltigt publikt domännamn." };
  }

  if (
    RESERVED_DOMAIN_BASES.some((base) => isAtOrBelow(domain, base)) ||
    isProviderDnsHostname(domain)
  ) {
    return { ok: false, error: "Den adressen är reserverad av plattformen." };
  }

  return { ok: true, domain };
}

export function unknownDomainObservation(domain: string): DomainObservation {
  return {
    domain,
    connection: "unknown",
    ownership: "unknown",
    dns: "unknown",
    https: "not_checked",
    activation: "not_started",
    records: [],
  };
}
