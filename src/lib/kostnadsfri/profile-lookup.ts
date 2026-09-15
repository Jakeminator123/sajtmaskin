/**
 * Profilfallback: hämta bolagsprofilen från utskicksverktyget när den inte
 * hunnit pushas in.
 *
 * Push (`send.py --live` → `POST /api/kostnadsfri`) förblir huvudvägen —
 * ägarbeslut 2026-09-15 «Kostnadsfri / bolagsdata». Den här modulen täcker
 * luckorna: rad skapad för hand i `/admin`, `--no-register`, saknad API-nyckel,
 * HTTP-fel vid registreringen, eller en inbjudan från innan profilfältet fanns.
 * Utan fallback blir mini-wizarden tom i exakt de fallen.
 *
 * Tre gränser, alla i kod:
 *
 * 1. **Bara efter korrekt lösenord**, och bara när profilen saknas. Anropet
 *    kan inte användas för att räkna upp bolag — verify-routen gör det, och
 *    den är redan rate-limitad per IP och slug.
 * 2. **Svaret litas inte på.** Dashen speglar vår allowlist, men vi kör ändå
 *    `findPersonalIdentityViolations` + `normalizeKostnadsfriCompanyProfile`
 *    på det som kommer tillbaka. Ett personnummer i svaret gör profilen null,
 *    inte publicerad.
 * 3. **Bunden tid, aldrig ett kastat fel.** Anropet ligger i kundens väntan
 *    och Render har kallstart. Standardbudgeten är 8 s och alla utfall är
 *    värden; verify-routen fortsätter alltid, som idag, när svaret uteblir.
 *
 * Server-only: läser `KOSTNADSFRI_LOOKUP_SECRET` ur miljön.
 */
import {
  findPersonalIdentityViolations,
  normalizeKostnadsfriCompanyProfile,
  type KostnadsfriCompanyProfile,
} from "./company-profile";

/** Delad hemlighet med dashen (`x-api-key`). Utan den är fallbacken av. */
export const KOSTNADSFRI_LOOKUP_SECRET_ENV = "KOSTNADSFRI_LOOKUP_SECRET";
/** Basadress till dashen. Samma tjänst för preview och prod. */
export const KOSTNADSFRI_LOOKUP_URL_ENV = "KOSTNADSFRI_LOOKUP_URL";
export const DEFAULT_KOSTNADSFRI_LOOKUP_URL = "https://sajtmaskin-dash.onrender.com";
/** Budget i kundens väntan. Render-kallstart kan ta längre — då släpper vi. */
export const KOSTNADSFRI_LOOKUP_TIMEOUT_MS = 8_000;

/** Samma slugform som dashen validerar; inget annat lämnar processen. */
const LOOKUP_SLUG_RE = /^[a-z0-9-]{1,120}$/;

export type KostnadsfriProfileLookupResult =
  | {
      status: "hit";
      companyName: string;
      contactEmail: string | null;
      profile: KostnadsfriCompanyProfile | null;
    }
  | { status: "miss" }
  | { status: "disabled" }
  | {
      status: "unavailable";
      reason: "timeout" | "network" | "unauthorized" | "upstream" | "malformed";
    };

export type KostnadsfriProfileLookupOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  secret?: string;
  timeoutMs?: number;
};

function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return (env[name] || "").trim();
}

export function isKostnadsfriLookupConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readEnv(KOSTNADSFRI_LOOKUP_SECRET_ENV, env));
}

function isAbortReason(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Applicerar samma skydd som inbound-vägen på det dashen svarade. Fältnamn
 * loggas aldrig här — anroparen ser bara att profilen blev null.
 */
function guardRemoteProfile(raw: unknown): KostnadsfriCompanyProfile | null {
  if (raw === null || raw === undefined) return null;
  if (findPersonalIdentityViolations(raw).length > 0) return null;
  return normalizeKostnadsfriCompanyProfile(raw);
}

export async function lookupKostnadsfriProfile(
  slug: string,
  options: KostnadsfriProfileLookupOptions = {},
): Promise<KostnadsfriProfileLookupResult> {
  const secret = options.secret ?? readEnv(KOSTNADSFRI_LOOKUP_SECRET_ENV);
  if (!secret) return { status: "disabled" };

  if (!LOOKUP_SLUG_RE.test(slug)) return { status: "miss" };

  const configuredBase = options.baseUrl ?? readEnv(KOSTNADSFRI_LOOKUP_URL_ENV);
  const baseUrl = (configuredBase || DEFAULT_KOSTNADSFRI_LOOKUP_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/api/kostnadsfri/lookup?slug=${encodeURIComponent(slug)}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? KOSTNADSFRI_LOOKUP_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { "x-api-key": secret, accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      return { status: "unavailable", reason: isAbortReason(error, controller.signal) ? "timeout" : "network" };
    }

    if (response.status === 404) return { status: "miss" };
    if (response.status === 401) return { status: "unavailable", reason: "unauthorized" };
    if (!response.ok) return { status: "unavailable", reason: "upstream" };

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return {
        status: "unavailable",
        reason: isAbortReason(error, controller.signal) ? "timeout" : "malformed",
      };
    }
    if (!body || typeof body !== "object") {
      return { status: "unavailable", reason: "malformed" };
    }
    const record = body as Record<string, unknown>;
    const companyName = text(record.companyName, 200);
    if (!companyName) return { status: "unavailable", reason: "malformed" };

    return {
      status: "hit",
      companyName,
      contactEmail: text(record.contactEmail, 320),
      profile: guardRemoteProfile(record.profile),
    };
  } finally {
    clearTimeout(timer);
  }
}
