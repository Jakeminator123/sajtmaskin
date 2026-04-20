/**
 * RDAP / WHOIS client
 * ===================
 *
 * RDAP (RFC 7480/9082) is the modern, JSON-based replacement for WHOIS.
 * No API key required — registries publish their endpoints via the IANA
 * bootstrap file and respond with structured registration metadata.
 *
 * This module is the TypeScript counterpart to the standalone Python
 * tools under `scripts/domains/` (`domain_lookup.py`,
 * `svenskadomaner_playwright_gui.py`) and exposes the same RDAP fields
 * to the Next.js runtime so the builder UI can show whether a domain is
 * taken, when it expires, and who the registrar is — without spawning a
 * Python subprocess.
 *
 * Bootstrap is cached per-process for 24h.
 */

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

interface BootstrapCacheEntry {
  data: BootstrapData;
  fetchedAt: number;
}

interface BootstrapData {
  services: Array<[string[], string[]]>;
}

let bootstrapCache: BootstrapCacheEntry | null = null;
let bootstrapInflight: Promise<BootstrapData> | null = null;

async function loadBootstrap(): Promise<BootstrapData> {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrapCache.data;
  }
  if (bootstrapInflight) return bootstrapInflight;

  bootstrapInflight = (async () => {
    const res = await fetch(IANA_BOOTSTRAP_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`[RDAP] bootstrap failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as BootstrapData;
    bootstrapCache = { data, fetchedAt: Date.now() };
    return data;
  })();

  try {
    return await bootstrapInflight;
  } finally {
    bootstrapInflight = null;
  }
}

function getTld(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) {
    throw new Error(`Ogiltig domän: ${domain}`);
  }
  return parts[parts.length - 1]!;
}

function getRdapBaseUrl(tld: string, bootstrap: BootstrapData): string | null {
  for (const service of bootstrap.services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const tlds = service[0] || [];
    const baseUrls = service[1] || [];
    if (tlds.includes(tld) && baseUrls.length > 0) {
      const base = String(baseUrls[0]);
      return base.endsWith("/") ? base : `${base}/`;
    }
  }
  return null;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapVcardItem extends Array<unknown> {
  0: string;
  3: string | string[];
}

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: [string, RdapVcardItem[]];
}

interface RdapNameserver {
  ldhName?: string;
}

interface RdapResponseBody {
  ldhName?: string;
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
}

function eventMap(events: RdapEvent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const event of events) {
    if (event.eventAction && event.eventDate) {
      out[event.eventAction] = event.eventDate;
    }
  }
  return out;
}

function vcardField(vcard: RdapEntity["vcardArray"], name: string): string[] {
  if (!Array.isArray(vcard) || vcard.length < 2) return [];
  const items = vcard[1];
  if (!Array.isArray(items)) return [];
  const results: string[] = [];
  for (const item of items) {
    if (!Array.isArray(item) || item.length < 4) continue;
    if (item[0] !== name) continue;
    const value = item[3];
    if (typeof value === "string") {
      results.push(value);
    } else if (Array.isArray(value)) {
      results.push(...value.map(String));
    }
  }
  return results;
}

interface ParsedEntities {
  registrar: { handle?: string; name?: string; emails: string[] } | null;
  registrant: { handle?: string; name?: string; emails: string[] } | null;
}

function parseEntities(entities: RdapEntity[]): ParsedEntities {
  const result: ParsedEntities = { registrar: null, registrant: null };
  for (const entity of entities) {
    const roles = entity.roles ?? [];
    const names = vcardField(entity.vcardArray, "fn");
    const emails = vcardField(entity.vcardArray, "email");
    const info = {
      handle: entity.handle,
      name: names[0],
      emails,
    };
    if (roles.includes("registrar") && !result.registrar) {
      result.registrar = info;
    }
    if (roles.includes("registrant") && !result.registrant) {
      result.registrant = info;
    }
  }
  return result;
}

export interface WhoisLookupResult {
  /** Was the lookup itself successful (i.e. we got a definitive yes/no)? */
  ok: boolean;
  /** True if the domain is registered, false if NXDOMAIN/404 from RDAP, null if unknown. */
  registered: boolean | null;
  domain: string;
  queryUrl: string | null;
  registrarName: string | null;
  registrarHandle: string | null;
  registrarEmails: string[];
  /** ISO 8601 string when the domain was first registered. */
  created: string | null;
  /** ISO 8601 string of the most recent update. */
  updated: string | null;
  /** ISO 8601 string when the registration expires. */
  expires: string | null;
  /** RFC 8056 statuses, e.g. `clientTransferProhibited`. */
  status: string[];
  nameservers: string[];
  /** Best-effort TLD-supported flag (RDAP coverage varies for ccTLDs). */
  rdapSupported: boolean;
  error: string | null;
}

function emptyResult(domain: string, partial: Partial<WhoisLookupResult>): WhoisLookupResult {
  return {
    ok: false,
    registered: null,
    domain,
    queryUrl: null,
    registrarName: null,
    registrarHandle: null,
    registrarEmails: [],
    created: null,
    updated: null,
    expires: null,
    status: [],
    nameservers: [],
    rdapSupported: false,
    error: null,
    ...partial,
  };
}

/**
 * Look up registration data for a domain via RDAP.
 *
 * Behaviour matches the Python `lookup_rdap()` in
 * `scripts/domains/svenskadomaner_playwright_gui.py`:
 *  - 404 from RDAP → `{ registered: false, ok: false }`
 *  - 200 with body → fully parsed registration data
 *  - Network/TLD errors → `{ registered: null, ok: false, error }`
 */
export async function lookupWhois(domain: string): Promise<WhoisLookupResult> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized || !normalized.includes(".")) {
    return emptyResult(normalized, { error: "Ogiltig domän" });
  }

  let bootstrap: BootstrapData;
  try {
    bootstrap = await loadBootstrap();
  } catch (err) {
    return emptyResult(normalized, {
      error: err instanceof Error ? err.message : "RDAP bootstrap-fel",
    });
  }

  const tld = getTld(normalized);
  const baseUrl = getRdapBaseUrl(tld, bootstrap);
  if (!baseUrl) {
    return emptyResult(normalized, {
      error: `Ingen RDAP-server registrerad för .${tld}`,
      rdapSupported: false,
    });
  }

  const queryUrl = `${baseUrl}domain/${encodeURIComponent(normalized)}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return emptyResult(normalized, {
      queryUrl,
      rdapSupported: true,
      error: err instanceof Error ? err.message : "RDAP-nätverksfel",
    });
  }

  if (response.status === 404) {
    return emptyResult(normalized, {
      ok: false,
      registered: false,
      queryUrl,
      rdapSupported: true,
    });
  }

  if (!response.ok) {
    return emptyResult(normalized, {
      queryUrl,
      rdapSupported: true,
      error: `RDAP HTTP ${response.status}`,
    });
  }

  let body: RdapResponseBody;
  try {
    body = (await response.json()) as RdapResponseBody;
  } catch (err) {
    return emptyResult(normalized, {
      queryUrl,
      rdapSupported: true,
      error: err instanceof Error ? err.message : "RDAP JSON-fel",
    });
  }

  const events = eventMap(body.events ?? []);
  const entities = parseEntities(body.entities ?? []);
  const nameservers = (body.nameservers ?? [])
    .map((ns) => ns.ldhName)
    .filter((name): name is string => Boolean(name));

  return {
    ok: true,
    registered: true,
    domain: body.ldhName?.toLowerCase() ?? normalized,
    queryUrl,
    registrarName: entities.registrar?.name ?? null,
    registrarHandle: entities.registrar?.handle ?? null,
    registrarEmails: entities.registrar?.emails ?? [],
    created: events["registration"] ?? null,
    updated: events["last changed"] ?? events["last update of RDAP database"] ?? null,
    expires: events["expiration"] ?? null,
    status: body.status ?? [],
    nameservers,
    rdapSupported: true,
    error: null,
  };
}

/**
 * Lightweight summary used when annotating availability checks. Returns
 * `null` if the lookup was inconclusive (network error or unsupported TLD).
 */
export interface WhoisSummary {
  registered: boolean | null;
  expires: string | null;
  registrar: string | null;
  status: string[];
  nameservers: string[];
}

export function summarizeWhois(result: WhoisLookupResult): WhoisSummary | null {
  if (!result.rdapSupported) return null;
  return {
    registered: result.registered,
    expires: result.expires,
    registrar: result.registrarName,
    status: result.status,
    nameservers: result.nameservers,
  };
}
