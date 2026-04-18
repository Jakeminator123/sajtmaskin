/**
 * GoDaddy availability client (TS port of `scripts/domains/godaddy_api.py`)
 * =========================================================================
 *
 * Used as a supplementary availability/price source for non-Swedish TLDs
 * when the Vercel registrar API doesn't return data — and as the canonical
 * upstream for the standalone domain-lookup Python tools under
 * `scripts/domains/`.
 *
 * Two environments are supported, mirroring GoDaddy's documentation:
 *  - OTE (Operational Test Environment): `OTE_GODADDY_API` / `OTE_GODADDY_SECRET`
 *  - Production:                          `GODADDY_API`     / `GODADDY_SECRET`
 *
 * No customer-facing markup is applied here — the caller is responsible for
 * passing the wholesale price through `applyMarkupSek()` from `pricing.ts`.
 */

const REQUEST_TIMEOUT_MS = 8000;
const PROD_BASE_URL = "https://api.godaddy.com";
const OTE_BASE_URL = "https://api.ote-godaddy.com";

export type GoDaddyEnvironment = "ote" | "prod";

interface GoDaddyConfig {
  environment: GoDaddyEnvironment;
  baseUrl: string;
  key: string;
  secret: string;
}

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function isGoDaddyConfigured(environment?: GoDaddyEnvironment): boolean {
  return getGoDaddyConfig(environment) !== null;
}

export function getGoDaddyConfig(environment?: GoDaddyEnvironment): GoDaddyConfig | null {
  const ote: GoDaddyConfig | null = (() => {
    const key = firstEnv("OTE_GODADDY_API", "GODADDY_API_KEY");
    const secret = firstEnv("OTE_GODADDY_SECRET", "GODADDY_API_SECRET");
    return key && secret ? { environment: "ote", baseUrl: OTE_BASE_URL, key, secret } : null;
  })();

  const prod: GoDaddyConfig | null = (() => {
    const key = firstEnv("GODADDY_API", "GODADDY_PROD_API_KEY");
    const secret = firstEnv("GODADDY_SECRET", "GODADDY_PROD_SECRET");
    return key && secret ? { environment: "prod", baseUrl: PROD_BASE_URL, key, secret } : null;
  })();

  if (environment === "ote") return ote;
  if (environment === "prod") return prod;
  return ote ?? prod;
}

export interface GoDaddyAvailability {
  configured: boolean;
  ok: boolean;
  environment: GoDaddyEnvironment | null;
  domain: string;
  available: boolean | null;
  /** GoDaddy's flag indicating whether the response is authoritative. */
  definitive: boolean | null;
  /** Wholesale price in micro-currency units (price / 1_000_000 = currency amount). */
  priceMicro: number | null;
  /** Wholesale price as a decimal in the response currency. */
  priceWholesale: number | null;
  currency: string | null;
  period: number | null;
  queryUrl: string | null;
  statusCode: number | null;
  message: string | null;
}

function emptyAvailability(domain: string, partial: Partial<GoDaddyAvailability>): GoDaddyAvailability {
  return {
    configured: false,
    ok: false,
    environment: null,
    domain,
    available: null,
    definitive: null,
    priceMicro: null,
    priceWholesale: null,
    currency: null,
    period: null,
    queryUrl: null,
    statusCode: null,
    message: null,
    ...partial,
  };
}

interface GoDaddyAvailabilityResponse {
  available?: boolean;
  domain?: string;
  definitive?: boolean;
  price?: number;
  currency?: string;
  period?: number;
}

export async function checkGoDaddyAvailability(
  domain: string,
  options: { environment?: GoDaddyEnvironment; checkType?: "FAST" | "FULL" } = {},
): Promise<GoDaddyAvailability> {
  const config = getGoDaddyConfig(options.environment);
  if (!config) {
    return emptyAvailability(domain, {
      configured: false,
      message:
        "GoDaddy-nycklar saknas. Sätt OTE_GODADDY_API/OTE_GODADDY_SECRET (test) eller GODADDY_API/GODADDY_SECRET (prod).",
    });
  }

  const checkType = options.checkType ?? "FAST";
  const url = `${config.baseUrl}/v1/domains/available?domain=${encodeURIComponent(domain)}&checkType=${checkType}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `sso-key ${config.key}:${config.secret}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return emptyAvailability(domain, {
      configured: true,
      environment: config.environment,
      queryUrl: url,
      message: `Nätverksfel mot GoDaddy: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  let body: GoDaddyAvailabilityResponse | { message?: string; code?: string };
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    let message: string | null = null;
    if (response.status === 401) {
      message = "GoDaddy nekade autentisering. Kontrollera key/secret och miljö.";
    } else if (response.status === 403) {
      message =
        "GoDaddy nekade åtkomst. Production Availability API kräver normalt att kontot uppfyller GoDaddys krav.";
    } else if (response.status === 429) {
      message = "GoDaddy rate-limit nådd (60 requests/min/endpoint).";
    } else if (typeof (body as { message?: string }).message === "string") {
      message = (body as { message?: string }).message ?? null;
    }
    return emptyAvailability(domain, {
      configured: true,
      environment: config.environment,
      queryUrl: url,
      statusCode: response.status,
      message: message ?? `GoDaddy HTTP ${response.status}`,
    });
  }

  const ok = body as GoDaddyAvailabilityResponse;
  const priceMicro = typeof ok.price === "number" ? ok.price : null;

  return {
    configured: true,
    ok: true,
    environment: config.environment,
    domain: ok.domain?.toLowerCase() ?? domain,
    available: typeof ok.available === "boolean" ? ok.available : null,
    definitive: typeof ok.definitive === "boolean" ? ok.definitive : null,
    priceMicro,
    priceWholesale: priceMicro != null ? priceMicro / 1_000_000 : null,
    currency: ok.currency ?? null,
    period: typeof ok.period === "number" ? ok.period : null,
    queryUrl: url,
    statusCode: response.status,
    message: null,
  };
}
