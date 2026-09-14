/**
 * Bolagsfakta som utskicksverktyget (JakobScrape-dashen, eget repo) skickar in
 * tillsammans med inbjudan, lagrat på `extra_data.profile`.
 *
 * Ägarbeslut 2026-09-15 (`docs/decisions/README.md`): profilen matar
 * **mini-wizarden**, aldrig generationsprompten direkt. Prompten byggs som förut
 * av wizardens utdata, så inget kan nå den publicerade sajten som företaget inte
 * har sett och kunnat rätta.
 *
 * Fältlistan är avsiktligt kort. Företagsnamn, bransch, webbplats, kontaktnamn
 * och kontakt-e-post har egna kolumner på `kostnadsfri_pages` och får inte
 * dubbleras hit — profilen bär bara det som saknar kolumn.
 *
 * Källan innehåller mer än detta: personnummer, ledamöters hemadresser, åldrar,
 * aktiekapital och den råa kungörelsetexten. Inget av det hör i en sajt, och
 * `extra_data` går både till browsern (efter lösenordsverifiering) och in i
 * wizarden — därför är listan en allowlist och personnummer dessutom
 * hårdspärrade av `findPersonalIdentityViolations`.
 */

export interface KostnadsfriCompanyProfile {
  /** Organisationsnummer, `NNNNNN-NNNN`. Vanligt i svensk sidfot. */
  orgNumber?: string;
  /** Registrerat säte, t.ex. "Stockholm". */
  registeredOffice?: string;
  /** Postort, t.ex. "Kista". */
  city?: string;
  /** Postnummer, t.ex. "164 40". */
  postalCode?: string;
  /**
   * Bolagets registrerade gatuadress. Ofta en c/o-adress hos revisor eller
   * annat bolag, så den förifylls för bekräftelse och ska inte publiceras som
   * besöksadress utan att företaget sagt ja.
   */
  streetAddress?: string;
  /**
   * Verksamhetsbeskrivningen ur registreringen ("Bolaget skall bedriva
   * frisörverksamhet…"). Enskilt mest användbara fältet: den bär både bransch
   * och vad bolaget faktiskt gör, i fritext.
   */
  businessDescription?: string;
  /** Registreringsdatum (ISO `YYYY-MM-DD`) för copy i stil med "Grundat 2026". */
  registeredAt?: string;
}

/**
 * Personnummerformer: `YYMMDD-NNNN`, `YYYYMMDD-NNNN`, `+` för över hundra år,
 * och samma siffror utan separator.
 *
 * Organisationsnummer har identisk form (`559599-5639`), så det går inte att
 * skilja dem på mönstret. Därför undantas `orgNumber` från kontrollen och
 * valideras i stället som *exakt* ett organisationsnummer — inget annat fält får
 * innehålla en sådan sifferföljd alls.
 */
const PERSONAL_IDENTITY_RE = /\b(?:\d{8}|\d{6})[-+]?\d{4}\b/;

/** Exakt ett organisationsnummer, inte en sifferföljd inbäddad i text. */
const ORG_NUMBER_RE = /^\d{6}-\d{4}$/;

const GUARD_EXEMPT_FIELDS = new Set(["orgNumber"]);

function normalizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeOrgNumber(value: unknown): string | undefined {
  const raw = normalizeString(value, 20);
  if (!raw) return undefined;
  // Dashen kan skicka med eller utan bindestreck; lagra en form.
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return undefined;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = normalizeString(value, 40);
  if (!raw) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : undefined;
}

/**
 * Vilka fält som bär en personnummerformad sifferföljd.
 *
 * Körs på **rå** indata, inte på den normaliserade profilen: normaliseringen
 * släpper okända nycklar, och ett tyst bortfall lär inte avsändaren att den
 * skickade något förbjudet. Returnerar fältnamn — aldrig värdet, som inte ska
 * vidare till loggar eller felsvar.
 */
export function findPersonalIdentityViolations(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const violations: string[] = [];

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (GUARD_EXEMPT_FIELDS.has(key)) continue;
    const candidates =
      typeof entry === "string"
        ? [entry]
        : Array.isArray(entry)
          ? entry.filter((item): item is string => typeof item === "string")
          : [];
    if (candidates.some((candidate) => PERSONAL_IDENTITY_RE.test(candidate))) {
      violations.push(key);
    }
  }

  return violations;
}

/** True när `orgNumber` finns men inte är ett organisationsnummer. */
export function hasInvalidOrgNumber(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const raw = (value as Record<string, unknown>).orgNumber;
  if (raw === undefined || raw === null || raw === "") return false;
  const normalized = normalizeOrgNumber(raw);
  return !normalized || !ORG_NUMBER_RE.test(normalized);
}

export function normalizeKostnadsfriCompanyProfile(
  value: unknown,
): KostnadsfriCompanyProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;

  const profile: KostnadsfriCompanyProfile = {
    orgNumber: normalizeOrgNumber(input.orgNumber),
    registeredOffice: normalizeString(input.registeredOffice, 80),
    city: normalizeString(input.city, 80),
    postalCode: normalizeString(input.postalCode, 12),
    streetAddress: normalizeString(input.streetAddress, 160),
    businessDescription: normalizeString(input.businessDescription, 600),
    registeredAt: normalizeIsoDate(input.registeredAt),
  };

  const hasValue = Object.values(profile).some((entry) => entry !== undefined);
  if (!hasValue) return null;

  // Sista linjen: ett fält som passerade guarden men ändå bär en
  // personnummerform lagras inte. Guarden ska ha fällt requesten långt
  // tidigare — det här är skyddet mot en framtida anropsväg som glömmer den.
  for (const [key, entry] of Object.entries(profile)) {
    if (GUARD_EXEMPT_FIELDS.has(key)) continue;
    if (typeof entry === "string" && PERSONAL_IDENTITY_RE.test(entry)) {
      delete profile[key as keyof KostnadsfriCompanyProfile];
    }
  }

  return Object.values(profile).some((entry) => entry !== undefined) ? profile : null;
}

export function extractKostnadsfriCompanyProfile(
  extraData: Record<string, unknown> | null | undefined,
): KostnadsfriCompanyProfile | null {
  if (!extraData) return null;
  return normalizeKostnadsfriCompanyProfile(extraData.profile);
}
