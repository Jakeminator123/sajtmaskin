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
   * annat bolag. Lagras men förifylls inte som besöksadress — bekräftelse
   * senare, inte auto-publicera.
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
 * samma siffror utan separator, typografiska streck och whitespace-gruppering.
 *
 * Organisationsnummer har identisk form (`559599-5639`), så det går inte att
 * skilja dem på mönstret. Därför undantas `orgNumber` från kontrollen och
 * valideras i stället som *exakt* ett organisationsnummer — inget annat fält får
 * innehålla en sådan sifferföljd alls.
 *
 * Detektorn är medvetet *inte* «strippa allt och slå ihop siffrorna»: det ger
 * falsklarm på telefon, postnummer och belopp. I stället matchas bara de
 * kända 10-/12-sifferformerna. Kompakta former och former med mellanslag runt
 * separatorn kräver en datumdel som kan vara ett kalenderdatum; tät
 * `YYMMDD-NNNN` fälls alltid. Svensk nationell telefon (`0…` utan separator)
 * undantas.
 */
const IDENTITY_DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/g;
const IDENTITY_PLUS_RE = /\uFF0B/g;
const INVISIBLE_IDENTITY_RE = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;
/** Streck/plus med mellanslag på minst en sida — inte den täta `850101-1234`. */
const PADDED_IDENTITY_SEP = String.raw`(?:\s+[-+]\s*|\s*[-+]\s+)`;

/** Allowlistade profilfält som får namnges i felsvar. `orgNumber` är undantaget. */
const SAFE_VIOLATION_FIELDS = new Set([
  "registeredOffice",
  "city",
  "postalCode",
  "streetAddress",
  "businessDescription",
  "registeredAt",
]);

/** Generell markör när avsändaren stoppade PII i en okänd toppnyckel. */
export const UNKNOWN_PROFILE_VIOLATION_FIELD = "profile";

/** Exakt ett organisationsnummer, inte en sifferföljd inbäddad i text. */
const ORG_NUMBER_RE = /^\d{6}-\d{4}$/;

/**
 * Tillåtet **rått** format för `orgNumber`: tio siffror, med eller utan
 * bindestycket. Tidigare ströks alla icke-siffror bort före kontrollen, så
 * `født 850709-1234!` reducerades till ett giltigt tal — fältet är undantaget
 * personnummerguarden och blev därmed vägen runt den.
 */
const ORG_NUMBER_RAW_RE = /^(\d{6})-?(\d{4})$/;

const GUARD_EXEMPT_FIELDS = new Set(["orgNumber"]);

/** Hur djupt PII-guarden går i en nästlad payload. */
const GUARD_MAX_DEPTH = 4;

function normalizeIdentityText(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code !== undefined && code >= 0xff10 && code <= 0xff19) {
      out += String.fromCharCode(0x30 + (code - 0xff10));
      continue;
    }
    out += char;
  }
  return out
    .replace(INVISIBLE_IDENTITY_RE, "")
    .replace(IDENTITY_DASH_RE, "-")
    .replace(IDENTITY_PLUS_RE, "+");
}

function isPlausibleIdentityDate(dateDigits: string): boolean {
  if (dateDigits.length === 8) {
    const year = Number(dateDigits.slice(0, 4));
    const month = Number(dateDigits.slice(4, 6));
    const day = Number(dateDigits.slice(6, 8));
    if (year < 1800 || year > 2100) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }
  if (dateDigits.length === 6) {
    const month = Number(dateDigits.slice(2, 4));
    const day = Number(dateDigits.slice(4, 6));
    if (month < 1 || month > 12 || day < 1) return false;
    const daysInMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= daysInMonth[month];
  }
  return false;
}

type IdentityFormKind = "hyphenated" | "grouped" | "compact";

function isIdentityCandidate(dateDigits: string, kind: IdentityFormKind): boolean {
  if (dateDigits.length !== 6 && dateDigits.length !== 8) return false;
  if (kind === "hyphenated") return true;
  if (kind === "grouped") return isPlausibleIdentityDate(dateDigits);
  // Kompakt 10-siffrig nationell telefon (`0701234567`) har giltigt datum
  // 07-01-23 — undanta ledande nolla i stället för att slå ihop alla siffror.
  if (dateDigits.length === 6 && dateDigits.startsWith("0")) return false;
  return isPlausibleIdentityDate(dateDigits);
}

/**
 * Delad kontroll för båda linjerna: inmatningsguarden och profilens sista filter.
 * Ingen ASCII-ordgräns — `Ledamot850101-1234` ska fällas.
 */
function textHasPersonalIdentityForm(value: string): boolean {
  const text = normalizeIdentityText(value);
  const patterns: Array<{
    re: RegExp;
    dateFrom: (match: RegExpExecArray) => string;
    kind: (match: RegExpExecArray) => IdentityFormKind;
  }> = [
    {
      re: /(\d{4})\s+(\d{2})\s+(\d{2})[-+\s]+(\d{4})/g,
      dateFrom: (match) => `${match[1]}${match[2]}${match[3]}`,
      kind: () => "grouped",
    },
    {
      re: /(\d{2})\s+(\d{2})\s+(\d{2})[-+\s]+(\d{4})/g,
      dateFrom: (match) => `${match[1]}${match[2]}${match[3]}`,
      kind: () => "grouped",
    },
    {
      // `850101 - 1234` / `850101- 1234` / `850101 -1234`. Datumkrav så att
      // `omsättning 100000 - 200000 kr` inte fälls (månad 00).
      re: new RegExp(`(\\d{8})${PADDED_IDENTITY_SEP}(\\d{4})`, "g"),
      dateFrom: (match) => match[1],
      kind: () => "grouped",
    },
    {
      re: /(\d{8})([-+]|\s+)?(\d{4})/g,
      dateFrom: (match) => match[1],
      kind: (match) => (match[2] ? "hyphenated" : "compact"),
    },
    {
      re: new RegExp(`(\\d{6})${PADDED_IDENTITY_SEP}(\\d{4})`, "g"),
      dateFrom: (match) => match[1],
      kind: () => "grouped",
    },
    {
      re: /(\d{6})([-+]|\s+)?(\d{4})/g,
      dateFrom: (match) => match[1],
      kind: (match) => (match[2] ? "hyphenated" : "compact"),
    },
  ];

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let match = pattern.re.exec(text);
    while (match) {
      if (isIdentityCandidate(pattern.dateFrom(match), pattern.kind(match))) {
        return true;
      }
      if (match.index === pattern.re.lastIndex) pattern.re.lastIndex += 1;
      match = pattern.re.exec(text);
    }
  }
  return false;
}

/** Bara serverns allowlistade fältnamn; okända nycklar blir `profile`. */
export function sanitizeProfileViolationFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    const safe = SAFE_VIOLATION_FIELDS.has(field) ? field : UNKNOWN_PROFILE_VIOLATION_FIELD;
    if (seen.has(safe)) continue;
    seen.add(safe);
    result.push(safe);
  }
  return result;
}

function normalizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/** Mod-10 (Luhn), kontrollsiffran i både org.nr och personnummer. */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[index]);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function normalizeOrgNumber(value: unknown): string | undefined {
  const raw = normalizeString(value, 20);
  if (!raw) return undefined;
  const match = ORG_NUMBER_RAW_RE.exec(raw);
  if (!match) return undefined;
  const digits = `${match[1]}${match[2]}`;
  // Tredje siffran är gruppnummer och är minst 2 för juridiska personer.
  // Ett personnummer bär månaden (01–12) på position 3–4, så dess tredje
  // siffra är alltid 0 eller 1. Det är den enda formskillnaden mellan de två,
  // och därmed det som gör undantaget från guarden försvarbart.
  if (Number(digits[2]) < 2) return undefined;
  if (!isLuhnValid(digits)) return undefined;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/**
 * Registreringsdatum, lagrat som `YYYY-MM-DD`.
 *
 * Accepterar ett bart datum eller en hel ISO-timestamp (dashen skickar
 * `datetime.isoformat()`), men inget annat: prefixmatchningen släppte tidigare
 * igenom både `2026-02-31` och `2026-07-10 (osäkert)`.
 */
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = normalizeString(value, 40);
  if (!raw) return undefined;
  const match = ISO_DATE_RE.exec(raw);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // `new Date` rullar över (31 feb → 3 mars), så jämför tillbaka mot indata.
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }
  return iso;
}

/** True om något värde i grenen bär en personnummerform. */
function branchHasPersonalIdentity(value: unknown, depth: number): boolean {
  if (typeof value === "string") return textHasPersonalIdentityForm(value);
  // Siffror räknas: `8507091234` som JSON-tal är samma läcka som strängen.
  if (typeof value === "number" && Number.isFinite(value)) {
    return textHasPersonalIdentityForm(String(value));
  }
  if (depth >= GUARD_MAX_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((item) => branchHasPersonalIdentity(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      branchHasPersonalIdentity(item, depth + 1),
    );
  }
  return false;
}

/**
 * Vilka fält som bär en personnummerformad sifferföljd.
 *
 * Körs på **rå** indata, inte på den normaliserade profilen: normaliseringen
 * släpper okända nycklar, och ett tyst bortfall lär inte avsändaren att den
 * skickade något förbjudet. Returnerar bara allowlistade fältnamn — aldrig
 * värdet och aldrig avsändarstyrda nycklar, som inte ska vidare till loggar
 * eller felsvar. Okända toppnycklar rapporteras som `profile`.
 *
 * Söker igenom nästlade objekt och arrayer till `GUARD_MAX_DEPTH`, men
 * rapporterar bara **toppnivåns** nyckel: en nästlad sökväg är avsändarstyrd
 * text och hör inte i vårt felsvar.
 */
export function findPersonalIdentityViolations(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const violations: string[] = [];

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (GUARD_EXEMPT_FIELDS.has(key)) continue;
    if (branchHasPersonalIdentity(entry, 0)) {
      violations.push(key);
    }
  }

  return sanitizeProfileViolationFields(violations);
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
    if (typeof entry === "string" && textHasPersonalIdentityForm(entry)) {
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
