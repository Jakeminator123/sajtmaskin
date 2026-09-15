import { getVercelToken } from "@/lib/vercel";
import {
  type DnsRecord,
  type DomainConnectionStatus,
  type DomainObservation,
  type DomainOwnershipStatus,
} from "@/lib/domains/domain-observation";

const VERCEL_API_BASE = "https://api.vercel.com";
const PROVIDER_TIMEOUT_MS = 10_000;

type VercelDomainConfig = {
  misconfigured?: unknown;
  recommendedIPv4?: unknown;
  recommendedCNAME?: unknown;
};

type VercelProjectDomain = {
  name?: unknown;
  apexName?: unknown;
  projectId?: unknown;
  verified?: unknown;
  verification?: unknown;
};

type ProviderRead<T> = { kind: "ok"; data: T } | { kind: "not_found" } | { kind: "unknown" };

type RankedIpv4 = { rank: number; value: string[] };
type RankedCname = { rank: number; value: string };

async function readProvider<T>(url: string): Promise<ProviderRead<T>> {
  let token: string;
  try {
    token = getVercelToken();
  } catch {
    return { kind: "unknown" };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "unknown" };
    return { kind: "ok", data: (await response.json()) as T };
  } catch {
    return { kind: "unknown" };
  }
}

function normalizedProviderHostname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  return hostname || null;
}

function rankedIpv4(value: unknown): RankedIpv4[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rank = "rank" in item && typeof item.rank === "number" ? item.rank : null;
    const rawValues = "value" in item && Array.isArray(item.value) ? item.value : [];
    const values = rawValues.filter(
      (entry: unknown): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
    return rank === null || values.length === 0 ? [] : [{ rank, value: values }];
  });
}

function rankedCname(value: unknown): RankedCname[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rank = "rank" in item && typeof item.rank === "number" ? item.rank : null;
    const target = "value" in item && typeof item.value === "string" ? item.value.trim() : "";
    return rank === null || !target ? [] : [{ rank, value: target }];
  });
}

function preferred<T extends { rank: number }>(items: T[]): T[] {
  if (items.length === 0) return [];
  const rankOne = items.filter((item) => item.rank === 1);
  if (rankOne.length > 0) return rankOne;
  const lowestRank = Math.min(...items.map((item) => item.rank));
  return items.filter((item) => item.rank === lowestRank);
}

function configurationRecords(
  config: VercelDomainConfig,
  domain: string,
  mode: "apex_or_unknown" | "subdomain",
): DnsRecord[] {
  if (mode === "subdomain") {
    return preferred(rankedCname(config.recommendedCNAME)).map((entry) => ({
      type: "CNAME",
      host: domain,
      value: entry.value,
      purpose: "configuration" as const,
    }));
  }

  // Before the project-domain GET proves an apex relationship, an A record is
  // the only safe recommendation: a CNAME at a zone apex is not generally
  // valid. The exact FQDN avoids guessing at public suffixes such as co.uk.
  return preferred(rankedIpv4(config.recommendedIPv4)).flatMap((entry) =>
    entry.value.map((address) => ({
      type: "A",
      host: domain,
      value: address,
      purpose: "configuration" as const,
    })),
  );
}

function ownershipRecords(projectDomain: VercelProjectDomain): DnsRecord[] {
  if (!Array.isArray(projectDomain.verification)) return [];
  return projectDomain.verification.flatMap((challenge) => {
    if (!challenge || typeof challenge !== "object") return [];
    const type =
      "type" in challenge && typeof challenge.type === "string"
        ? challenge.type.trim().toUpperCase()
        : "";
    const host =
      "domain" in challenge && typeof challenge.domain === "string"
        ? challenge.domain.trim().toLowerCase().replace(/\.$/, "")
        : "";
    const value =
      "value" in challenge && typeof challenge.value === "string" ? challenge.value.trim() : "";
    // The project-domain contract documents TXT as the DNS ownership
    // challenge. Never turn an unknown future challenge kind into a DNS
    // instruction merely because its name happens to look record-like.
    if (type !== "TXT" || !host || !value) return [];
    return [{ type, host, value, purpose: "ownership" as const }];
  });
}

function uniqueRecords(records: DnsRecord[]): DnsRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.purpose}:${record.type}:${record.host}:${record.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Read-only Vercel observation. Both requests are GETs and all response fields
 * are reduced to the public C2 status contract before crossing the API route.
 */
export async function observeVercelDomain(params: {
  projectId: string;
  domain: string;
  teamId?: string;
}): Promise<DomainObservation> {
  const { projectId, domain, teamId } = params;
  const teamQuery = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
  const projectQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const configUrl =
    `${VERCEL_API_BASE}/v6/domains/${encodeURIComponent(domain)}/config` +
    `?projectIdOrName=${encodeURIComponent(projectId)}${teamQuery}`;
  const projectDomainUrl =
    `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectId)}` +
    `/domains/${encodeURIComponent(domain)}${projectQuery}`;

  const [configRead, projectDomainRead] = await Promise.all([
    readProvider<VercelDomainConfig>(configUrl),
    readProvider<VercelProjectDomain>(projectDomainUrl),
  ]);

  let connection: DomainConnectionStatus = "unknown";
  let ownership: DomainOwnershipStatus = "unknown";
  let projectDomain: VercelProjectDomain | null = null;
  let recordMode: "apex_or_unknown" | "subdomain" = "apex_or_unknown";

  if (projectDomainRead.kind === "not_found") {
    connection = "not_connected";
  } else if (projectDomainRead.kind === "ok") {
    const returnedProjectId =
      typeof projectDomainRead.data.projectId === "string"
        ? projectDomainRead.data.projectId.trim()
        : "";
    const returnedName = normalizedProviderHostname(projectDomainRead.data.name);
    if (returnedProjectId === projectId && returnedName === domain) {
      connection = "connected";
      projectDomain = projectDomainRead.data;
      ownership =
        projectDomainRead.data.verified === true
          ? "verified"
          : projectDomainRead.data.verified === false
            ? "pending"
            : "unknown";
      const apexName = normalizedProviderHostname(projectDomainRead.data.apexName);
      if (apexName && domain !== apexName && domain.endsWith(`.${apexName}`)) {
        recordMode = "subdomain";
      }
    }
  }

  const dns =
    configRead.kind !== "ok"
      ? "unknown"
      : configRead.data.misconfigured === true
        ? "invalid"
        : configRead.data.misconfigured === false
          ? "valid"
          : "unknown";

  const configuration =
    configRead.kind === "ok" ? configurationRecords(configRead.data, domain, recordMode) : [];
  const challenges =
    projectDomain && ownership === "pending" ? ownershipRecords(projectDomain) : [];

  return {
    domain,
    connection,
    ownership,
    dns,
    https: "not_checked",
    activation: "not_started",
    records: uniqueRecords([...configuration, ...challenges]),
  };
}
