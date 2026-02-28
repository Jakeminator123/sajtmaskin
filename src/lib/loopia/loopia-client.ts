/**
 * Loopia XML-RPC client for .se/.nu domain operations
 * ====================================================
 *
 * Loopia uses XML-RPC (not REST). We keep a minimal fetch-based
 * implementation to avoid external dependencies.
 *
 * Docs: https://www.loopia.com/api/
 * Endpoint: https://api.loopia.se/RPCSERV
 *
 * Rate limits: 60 calls/min, max 15 domain searches/min.
 */

const LOOPIA_ENDPOINT = "https://api.loopia.se/RPCSERV";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isLoopiaConfigured(): boolean {
  return Boolean(
    process.env.LOOPIA_API_USER?.trim() && process.env.LOOPIA_API_PASSWORD?.trim(),
  );
}

function getCredentials(): { user: string; password: string } {
  const user = process.env.LOOPIA_API_USER?.trim();
  const password = process.env.LOOPIA_API_PASSWORD?.trim();
  if (!user || !password) {
    throw new Error("Missing LOOPIA_API_USER / LOOPIA_API_PASSWORD environment variables");
  }
  return { user, password };
}

// ---------------------------------------------------------------------------
// XML-RPC helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlRpcParam(value: string): string {
  return `<param><value><string>${escapeXml(value)}</string></value></param>`;
}

function buildMethodCall(methodName: string, params: string[]): string {
  const xmlParams = params.map(xmlRpcParam).join("\n    ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>${escapeXml(methodName)}</methodName>
  <params>
    ${xmlParams}
  </params>
</methodCall>`;
}

function extractStringValue(xml: string): string | null {
  const match = xml.match(/<value>\s*(?:<string>)?([\s\S]*?)(?:<\/string>)?\s*<\/value>/);
  return match ? match[1].trim() : null;
}

function extractAllStringValues(xml: string): string[] {
  const values: string[] = [];
  const regex = /<value>\s*(?:<string>)?([\s\S]*?)(?:<\/string>)?\s*<\/value>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    values.push(m[1].trim());
  }
  return values;
}

async function callRpc(methodName: string, params: string[]): Promise<string> {
  const body = buildMethodCall(methodName, params);

  const res = await fetch(LOOPIA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`[Loopia] ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DomainFreeStatus =
  | "OK" // Available
  | "DOMAIN_OCCUPIED" // Taken
  | "BAD_INDATA"
  | "UNKNOWN_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMITED";

/**
 * Check if a domain is free to register via Loopia.
 * Works for .se, .nu, and other TLDs Loopia supports.
 */
export async function domainIsFree(domain: string): Promise<DomainFreeStatus> {
  const { user, password } = getCredentials();

  try {
    const xml = await callRpc("domainIsFree", [user, password, domain]);
    const value = extractStringValue(xml);

    if (value === "OK" || value === "DOMAIN_OCCUPIED") {
      return value;
    }

    if (value?.includes("AUTH")) return "AUTH_ERROR";
    if (value?.includes("RATE") || value?.includes("LIMIT")) return "RATE_LIMITED";

    console.warn("[Loopia] Unexpected domainIsFree response:", value);
    return "UNKNOWN_ERROR";
  } catch (error) {
    console.error("[Loopia] domainIsFree failed:", error);
    return "UNKNOWN_ERROR";
  }
}

/**
 * Get available TLDs for a domain name via Loopia.
 * Returns an array of TLDs (e.g. ["se", "nu", "com"]).
 */
export async function getAvailableTlds(domainBase: string): Promise<string[]> {
  const { user, password } = getCredentials();

  try {
    const xml = await callRpc("getAvailableTLDs", [user, password, domainBase]);
    return extractAllStringValues(xml).filter((v) => !v.startsWith("OK") && v.length < 10);
  } catch (error) {
    console.error("[Loopia] getAvailableTlds failed:", error);
    return [];
  }
}

/**
 * Batch-check multiple .se/.nu domains.
 * Returns a map of domain -> available (true/false/null for error).
 */
export async function checkMultipleDomains(
  domains: string[],
): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();

  const checks = domains.map(async (domain, index) => {
    // Stagger to respect 15 searches/min limit
    await new Promise((resolve) => setTimeout(resolve, index * 250));
    const status = await domainIsFree(domain);
    results.set(
      domain,
      status === "OK" ? true : status === "DOMAIN_OCCUPIED" ? false : null,
    );
  });

  await Promise.all(checks);
  return results;
}

/**
 * Add a DNS zone record (e.g. CNAME for Vercel).
 * Used after purchasing a domain to point it to Vercel.
 */
export async function addZoneRecord(
  domain: string,
  subdomain: string,
  record: {
    type: "CNAME" | "A" | "TXT";
    data: string;
    ttl?: number;
    priority?: number;
  },
): Promise<"OK" | string> {
  const { user, password } = getCredentials();

  const ttl = record.ttl ?? 3600;
  const priority = record.priority ?? 0;

  // Loopia addZoneRecord takes: user, password, domain, subdomain, record_obj
  // Record obj is an XML-RPC struct - we need custom XML for this
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>addZoneRecord</methodName>
  <params>
    ${xmlRpcParam(user)}
    ${xmlRpcParam(password)}
    ${xmlRpcParam(domain)}
    ${xmlRpcParam(subdomain)}
    <param>
      <value>
        <struct>
          <member>
            <name>type</name>
            <value><string>${escapeXml(record.type)}</string></value>
          </member>
          <member>
            <name>rdata</name>
            <value><string>${escapeXml(record.data)}</string></value>
          </member>
          <member>
            <name>ttl</name>
            <value><int>${ttl}</int></value>
          </member>
          <member>
            <name>priority</name>
            <value><int>${priority}</int></value>
          </member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

  const res = await fetch(LOOPIA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`[Loopia] addZoneRecord: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const value = extractStringValue(xml);
  return value === "OK" ? "OK" : (value ?? "UNKNOWN_ERROR");
}
