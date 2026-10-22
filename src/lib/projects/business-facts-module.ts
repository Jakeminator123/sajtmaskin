/**
 * `lib/business-facts.ts` — the one file in a generated site that carries the
 * owner's opening hours and contact details.
 *
 * Why a module and not prompt text alone: the customer edits these facts in
 * the portal, and the live site must follow WITHOUT a new generation. The deploy
 * route rewrites this file from `project_data.meta.business` on every publish
 * (`applyBusinessFactsToFiles`), so "Publicera om" is enough. The LLM is told
 * to emit the same content on generation (prompt block) and to import from it
 * wherever hours or contact appear, never hardcoding times in JSX.
 *
 * The rendered module has no imports and only uses `Intl`, so it compiles in
 * any Next.js project the scaffold stack produces.
 */
import {
  BUSINESS_WEEKDAYS,
  WEEKDAY_LABELS_SV,
  formatAddressLine,
  formatOpeningHoursLines,
  type BusinessFactsPersisted,
} from "./business-facts-schema";

export const BUSINESS_FACTS_MODULE_PATH = "lib/business-facts.ts";
export const BUSINESS_FACTS_IMPORT_SPECIFIER = "@/lib/business-facts";
/** First line of every generated module; lets later passes recognise the file. */
export const BUSINESS_FACTS_MODULE_MARKER = "// @sajtmaskin business-facts v1";

const CANDIDATE_PATHS = new Set([BUSINESS_FACTS_MODULE_PATH, `src/${BUSINESS_FACTS_MODULE_PATH}`]);

export function isBusinessFactsModulePath(path: string): boolean {
  return CANDIDATE_PATHS.has(path.replace(/\\/g, "/").replace(/^\.?\//, ""));
}

function literal(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Full TypeScript source for `lib/business-facts.ts`.
 *
 * Deterministic for a given input (no timestamps) so re-exporting an unchanged
 * project produces an identical file and no spurious GitHub diff.
 */
export function renderBusinessFactsModule(facts: BusinessFactsPersisted): string {
  const lines = formatOpeningHoursLines(facts.hours);
  const addressLine = formatAddressLine(facts.contact.address);

  return `${BUSINESS_FACTS_MODULE_MARKER}
/**
 * Företagsuppgifter — ägs av Sajtmaskin och skrivs om vid varje publicering
 * från kundens inställningar i portalen. Redigera inte för hand: ändringar
 * försvinner. Importera härifrån överallt där öppettider eller kontakt visas.
 */

export type BusinessWeekday = ${BUSINESS_WEEKDAYS.map((day) => `"${day}"`).join(" | ")};

export type BusinessDayHours =
  | { closed: true }
  | { closed: false; open: string; close: string };

export type BusinessOpeningHoursMode =
  | "unspecified"
  | "regular"
  | "always_open"
  | "by_appointment";

export type BusinessOpeningHours = {
  mode: BusinessOpeningHoursMode;
  week: Record<BusinessWeekday, BusinessDayHours> | null;
};

export type BusinessAddress = { street: string; postalCode: string; city: string };

export type BusinessContact = {
  phone: string | null;
  email: string | null;
  orgNumber: string | null;
  address: BusinessAddress | null;
};

export type BusinessFacts = {
  hours: BusinessOpeningHours;
  contact: BusinessContact;
};

export const WEEKDAY_LABELS_SV: Record<BusinessWeekday, string> = ${literal(WEEKDAY_LABELS_SV)};

export const businessFacts: BusinessFacts = ${literal({ hours: facts.hours, contact: facts.contact })};

/** Färdiga svenska rader, t.ex. "Måndag–Fredag 09:00–17:00". Tom när inga tider ska visas. */
export const openingHoursLines: readonly string[] = ${literal(lines)};

/** "Gatan 1, 123 45 Staden" eller null. */
export const addressLine: string | null = ${literal(addressLine)};

export function hasOpeningHours(): boolean {
  return businessFacts.hours.mode !== "unspecified";
}

export function hasContact(): boolean {
  const { phone, email, orgNumber, address } = businessFacts.contact;
  return Boolean(phone || email || orgNumber || address);
}

const WEEKDAY_BY_INTL: Record<string, BusinessWeekday> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Är det öppet just nu (Europe/Stockholm)? \`null\` när frågan inte går att
 * svara på: inga tider angivna eller öppet enligt överenskommelse.
 * Används bara på klienten eller i request-tid — aldrig vid statisk rendering,
 * eftersom svaret ändras med klockan.
 */
export function isOpenNow(now: Date = new Date()): boolean | null {
  const { mode, week } = businessFacts.hours;
  if (mode === "always_open") return true;
  if (mode !== "regular" || !week) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekdayPart = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekday = WEEKDAY_BY_INTL[weekdayPart];
  if (!weekday) return null;
  const today = week[weekday];
  if (today.closed) return false;
  const current = hour * 60 + minute;
  const open = minutesOf(today.open);
  const close = minutesOf(today.close);
  // Stänger efter midnatt (t.ex. 18:00–02:00) räknas som öppet fram till stängning.
  if (close <= open) return current >= open || current < close;
  return current >= open && current < close;
}

const SCHEMA_ORG_DAY: Record<BusinessWeekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** schema.org \`openingHoursSpecification\` för LocalBusiness-JSON-LD. */
export function openingHoursSpecification(): Array<Record<string, unknown>> {
  const { mode, week } = businessFacts.hours;
  if (mode === "always_open") {
    return [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: Object.values(SCHEMA_ORG_DAY),
        opens: "00:00",
        closes: "23:59",
      },
    ];
  }
  if (mode !== "regular" || !week) return [];
  return (Object.keys(week) as BusinessWeekday[])
    .filter((day) => !week[day].closed)
    .map((day) => {
      const hours = week[day] as { closed: false; open: string; close: string };
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_ORG_DAY[day],
        opens: hours.open,
        closes: hours.close,
      };
    });
}
`;
}

export type BusinessFactsTargetFile = { name: string; content: string };

/**
 * Deploy-time rewrite. Only touches a file the site already has: a site that
 * never imported the module gets nothing injected, and a site generated before
 * this feature keeps deploying byte-identical.
 */
export function applyBusinessFactsToFiles<T extends BusinessFactsTargetFile>(
  files: T[],
  facts: BusinessFactsPersisted,
): { files: T[]; applied: boolean } {
  let applied = false;
  const next = files.map((file) => {
    if (!isBusinessFactsModulePath(file.name)) return file;
    const content = renderBusinessFactsModule(facts);
    if (content === file.content) return file;
    applied = true;
    return { ...file, content };
  });
  return { files: next, applied };
}
