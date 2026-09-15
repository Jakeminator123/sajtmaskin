import { normalizeDomainHostname, RESERVED_BRANDED_SLUGS } from "@/lib/live-site-url";

export type DomainOwnershipStatus = "pending" | "verified" | "unknown";
export type DomainDnsStatus = "pending" | "valid" | "invalid" | "unknown";
export type DomainConnectionStatus = "connected" | "not_connected" | "unknown";
export type DomainHttpsStatus = "not_checked" | "valid" | "invalid" | "unknown";
export type DomainActivationStatus = "not_started" | "live" | "pending" | "paused";

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
  https: DomainHttpsStatus;
  activation: DomainActivationStatus;
  records: DnsRecord[];
};

/** Human-facing portal labels. Never leak provider jargon. */
export type HumanDomainStatus =
  | "live"
  | "waiting_dns"
  | "checking_https"
  | "connected"
  | "problem"
  | "paused"
  | "unknown";

export const HUMAN_DOMAIN_STATUS_SV: Record<HumanDomainStatus, string> = {
  live: "Live",
  waiting_dns: "Väntar på DNS",
  checking_https: "Kontrollerar HTTPS",
  connected: "Ansluten",
  problem: "Problem",
  paused: "Pausad",
  unknown: "Okänd status",
};

export type CustomerHostPair = {
  entered: string;
  apex: string;
  www: string | null;
};

/**
 * Apex + www is the supported pair. A www-host picks the apex as companion.
 * Other subdomains stay single-host — we do not invent www.blog.example.com.
 */
export function customerHostPair(domain: string): CustomerHostPair {
  const labels = domain.split(".");
  if (domain.startsWith("www.") && labels.length >= 3) {
    return { entered: domain, apex: domain.slice(4), www: domain };
  }
  if (labels.length === 2) {
    return { entered: domain, apex: domain, www: `www.${domain}` };
  }
  return { entered: domain, apex: domain, www: null };
}

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

  const brandedParent = domain.split(".").slice(1).join(".");
  const brandedLabel = domain.split(".")[0] ?? "";
  if (
    RESERVED_DOMAIN_BASES.some((base) => brandedParent === base || brandedParent.endsWith(`.${base}`)) &&
    (RESERVED_BRANDED_SLUGS as readonly string[]).includes(brandedLabel)
  ) {
    return { ok: false, error: "Den adressen är reserverad av plattformen." };
  }

  return { ok: true, domain };
}

/**
 * Derive a customer-facing status from the three separate checks.
 * A transient unknown never becomes Problem — that would look like a revoked domain.
 */
export function humanDomainStatus(input: {
  observation: Pick<DomainObservation, "connection" | "ownership" | "dns" | "https">;
  isLivePrimary: boolean;
  paused?: boolean;
}): HumanDomainStatus {
  if (input.paused) return "paused";
  const { connection, ownership, dns, https } = input.observation;
  if (connection === "unknown" || ownership === "unknown" || dns === "unknown") {
    return "unknown";
  }
  if (dns === "invalid") return "problem";
  if (https === "invalid" && ownership === "verified" && dns === "valid") return "problem";
  if (
    input.isLivePrimary &&
    connection === "connected" &&
    ownership === "verified" &&
    dns === "valid" &&
    https === "valid"
  ) {
    return "live";
  }
  if (connection === "connected" && ownership === "verified" && dns === "valid") {
    if (https === "not_checked" || https === "unknown") return "checking_https";
    return "connected";
  }
  if (connection === "connected" && (ownership === "pending" || dns === "pending" || dns !== "valid")) {
    return "waiting_dns";
  }
  if (connection === "connected") return "connected";
  if (connection === "not_connected") return "waiting_dns";
  return "unknown";
}

/**
 * Seam for Entri (or equivalent) automatic DNS. Returns null until a provider
 * account exists — the manual instructions stay the working path.
 */
export function automaticDnsConnector(): null {
  return null;
}

export type HostCheck = {
  domain: string;
  role: "primary" | "redirect";
  connection: DomainConnectionStatus;
  ownership: DomainOwnershipStatus;
  dns: DomainDnsStatus;
  https: DomainHttpsStatus;
  status: HumanDomainStatus;
  statusLabel: string;
  records: DnsRecord[];
};

export type CustomerDomainSnapshot = {
  primary: HostCheck | null;
  companion: HostCheck | null;
  liveDomain: string | null;
  candidateDomain: string | null;
  canActivate: boolean;
  canUnlink: boolean;
  redirectArmed: boolean;
  publishedSlug: string | null;
  slugLocked: boolean;
  automaticDns: null;
  message: string | null;
};

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
