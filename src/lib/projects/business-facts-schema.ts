/**
 * Företagsuppgifter — strukturerade fakta kunden äger om sitt företag.
 *
 * Persisted under `project_data.meta.business` (one top-level namespace, same
 * pattern as `seo`). Three readers share this schema:
 *
 * - `src/app/api/projects/[id]/preferences/route.ts` (GET/PATCH validation)
 * - `src/lib/gen/system-prompt/sections/business-facts.ts` (prompt block)
 * - `src/lib/projects/business-facts-module.ts` (deploy-time module)
 *
 * Everything is standardized: weekday rows with quarter-hour times, a fixed
 * set of hour modes, Swedish postal/org-number formats. There is deliberately
 * no free-text field for hours — a business without standard hours picks a
 * mode (`always_open`, `by_appointment`) instead of typing a sentence the
 * generated site cannot render consistently.
 */
import { z } from "zod";

export const BUSINESS_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type BusinessWeekday = (typeof BUSINESS_WEEKDAYS)[number];

export const WEEKDAY_LABELS_SV: Record<BusinessWeekday, string> = {
  mon: "Måndag",
  tue: "Tisdag",
  wed: "Onsdag",
  thu: "Torsdag",
  fri: "Fredag",
  sat: "Lördag",
  sun: "Söndag",
};

/**
 * - `unspecified`: the owner has not said anything; the site shows no hours.
 * - `regular`: weekday rows in `week`.
 * - `always_open`: 24/7 — web shops, vending, self-service.
 * - `by_appointment`: no fixed hours; booking or contact instead.
 */
export const OPENING_HOURS_MODES = [
  "unspecified",
  "regular",
  "always_open",
  "by_appointment",
] as const;
export type OpeningHoursMode = (typeof OPENING_HOURS_MODES)[number];

export const OPENING_HOURS_MODE_LABELS_SV: Record<OpeningHoursMode, string> = {
  unspecified: "Visa inga öppettider",
  regular: "Fasta öppettider per veckodag",
  always_open: "Öppet dygnet runt",
  by_appointment: "Enligt överenskommelse",
};

/** Quarter-hour steps only. `24:00` is not a time; midnight close is `00:00`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/;
export const timeOfDaySchema = z.string().regex(TIME_PATTERN, "Tid måste vara HH:MM i kvartssteg");

export const dayHoursSchema = z.discriminatedUnion("closed", [
  z.object({ closed: z.literal(true) }),
  z
    .object({
      closed: z.literal(false),
      open: timeOfDaySchema,
      close: timeOfDaySchema,
    })
    .refine((day) => day.open !== day.close, {
      message: "Öppnar och stänger kan inte vara samma tid",
      path: ["close"],
    }),
]);
export type DayHours = z.infer<typeof dayHoursSchema>;

export const weekHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
});
export type WeekHours = z.infer<typeof weekHoursSchema>;

export const openingHoursSchema = z
  .object({
    mode: z.enum(OPENING_HOURS_MODES),
    week: weekHoursSchema.nullable(),
  })
  .refine((hours) => hours.mode !== "regular" || hours.week !== null, {
    message: "Fasta öppettider kräver tider per veckodag",
    path: ["week"],
  });
export type OpeningHours = z.infer<typeof openingHoursSchema>;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Swedish phone numbers as people type them: `08-123 45 67`, `+46 70 123 45 67`. */
export const phoneSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(6, "Telefonnumret är för kort")
      .max(24, "Telefonnumret är för långt")
      .regex(/^\+?[\d\s()-]+$/, "Telefonnummer får bara innehålla siffror, mellanslag, +, - och ()"),
  );

/** `556677-8899` or `5566778899` → always stored with the hyphen (IIS format). */
export const orgNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}-?\d{4}$/, "Organisationsnummer skrivs som 556677-8899"))
  .transform((value) => (value.includes("-") ? value : `${value.slice(0, 6)}-${value.slice(6)}`));

/** `12345` or `123 45` → stored as `123 45`. */
export const postalCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{5}$/, "Postnummer har fem siffror"))
  .transform((value) => `${value.slice(0, 3)} ${value.slice(3)}`);

export const addressSchema = z.object({
  street: z.string().transform(collapseSpaces).pipe(z.string().min(1).max(120)),
  postalCode: postalCodeSchema,
  city: z.string().transform(collapseSpaces).pipe(z.string().min(1).max(80)),
});
export type BusinessAddress = z.infer<typeof addressSchema>;

export const contactSchema = z.object({
  phone: phoneSchema.nullable(),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Ogiltig e-postadress").max(254)).nullable(),
  orgNumber: orgNumberSchema.nullable(),
  address: addressSchema.nullable(),
});
export type BusinessContact = z.infer<typeof contactSchema>;

/** Shape accepted by `PATCH /api/projects/[id]/preferences` under `business`. */
export const businessFactsInputSchema = z.object({
  hours: openingHoursSchema,
  contact: contactSchema,
});
export type BusinessFactsInput = z.infer<typeof businessFactsInputSchema>;

export type BusinessFactsPersisted = BusinessFactsInput & {
  /** ISO timestamp of the last save, or `null` when nothing was ever saved. */
  lastSetAt: string | null;
};

export const EMPTY_WEEK: WeekHours = {
  mon: { closed: false, open: "09:00", close: "17:00" },
  tue: { closed: false, open: "09:00", close: "17:00" },
  wed: { closed: false, open: "09:00", close: "17:00" },
  thu: { closed: false, open: "09:00", close: "17:00" },
  fri: { closed: false, open: "09:00", close: "17:00" },
  sat: { closed: true },
  sun: { closed: true },
};

export const BUSINESS_FACTS_DEFAULTS: BusinessFactsPersisted = {
  hours: { mode: "unspecified", week: null },
  contact: { phone: null, email: null, orgNumber: null, address: null },
  lastSetAt: null,
};

/**
 * Normalize whatever jsonb returned under `meta.business`. Malformed data falls
 * back to the defaults instead of throwing — the deploy route and the prompt
 * builder must never fail because a previous save was shaped differently.
 */
export function readBusinessFactsFromMeta(
  meta: Record<string, unknown> | null | undefined,
): BusinessFactsPersisted {
  if (!meta || typeof meta !== "object") return structuredClone(BUSINESS_FACTS_DEFAULTS);
  const raw = (meta as Record<string, unknown>).business;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return structuredClone(BUSINESS_FACTS_DEFAULTS);
  }
  const parsed = businessFactsInputSchema.safeParse(raw);
  if (!parsed.success) return structuredClone(BUSINESS_FACTS_DEFAULTS);
  const lastSetAt = (raw as Record<string, unknown>).lastSetAt;
  return {
    ...parsed.data,
    lastSetAt: typeof lastSetAt === "string" ? lastSetAt : null,
  };
}

/**
 * Deploy-time read: unlike {@link readBusinessFactsFromMeta} this must NOT turn
 * a broken read into "no facts", because the deploy would then rewrite the
 * site's `lib/business-facts.ts` with empty values and silently drop the
 * customer's hours. `null` = unknown → the caller leaves the module alone.
 *
 * - `meta` missing/unreadable → `null` (unknown)
 * - `business` absent or `null` → defaults (the owner cleared or never set facts)
 * - `business` present but malformed → `null` (unknown)
 */
export function readBusinessFactsForDeploy(
  meta: Record<string, unknown> | null | undefined,
): BusinessFactsPersisted | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).business;
  if (raw === undefined || raw === null) return structuredClone(BUSINESS_FACTS_DEFAULTS);
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = businessFactsInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const lastSetAt = (raw as Record<string, unknown>).lastSetAt;
  return { ...parsed.data, lastSetAt: typeof lastSetAt === "string" ? lastSetAt : null };
}

export const BUSINESS_FACTS_SUPPORT_META_KEY = "businessFactsSupport";

/**
 * Written by the deploy route on every production publish: did the files that
 * went live contain a marked `lib/business-facts.ts`? The portal uses it to
 * tell the customer whether "Publicera om" will carry their edits, instead of
 * promising it for a site generated before the feature existed.
 */
export type BusinessFactsSupportRecord = {
  supported: boolean;
  versionId: string;
  checkedAt: string;
};

export type BusinessFactsSupportState = "supported" | "unsupported" | "unknown";

export function readBusinessFactsSupportFromMeta(
  meta: Record<string, unknown> | null | undefined,
): BusinessFactsSupportRecord | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>)[BUSINESS_FACTS_SUPPORT_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (
    typeof record.supported !== "boolean" ||
    typeof record.versionId !== "string" ||
    typeof record.checkedAt !== "string"
  ) {
    return null;
  }
  return { supported: record.supported, versionId: record.versionId, checkedAt: record.checkedAt };
}

/**
 * The record only answers for the version it was taken from. A different live
 * version (or none) is `unknown`, and the portal must not promise anything.
 */
export function resolveBusinessFactsSupport(
  record: BusinessFactsSupportRecord | null,
  liveVersionId: string | null | undefined,
): BusinessFactsSupportState {
  if (!record || !liveVersionId || record.versionId !== liveVersionId) return "unknown";
  return record.supported ? "supported" : "unsupported";
}

/** True when the owner has stated at least one fact worth rendering. */
export function hasBusinessFacts(facts: BusinessFactsPersisted | null | undefined): boolean {
  if (!facts) return false;
  if (facts.hours.mode !== "unspecified") return true;
  const { phone, email, orgNumber, address } = facts.contact;
  return Boolean(phone || email || orgNumber || address);
}

function dayKey(day: DayHours): string {
  return day.closed ? "closed" : `${day.open}-${day.close}`;
}

function formatDay(day: DayHours): string {
  return day.closed ? "Stängt" : `${day.open}–${day.close}`;
}

/**
 * Human lines, Swedish, consecutive identical days collapsed:
 * `["Måndag–Fredag 09:00–17:00", "Lördag 10:00–14:00", "Söndag Stängt"]`.
 * Shared by the prompt block and the generated module so both say the same.
 */
export function formatOpeningHoursLines(hours: OpeningHours): string[] {
  switch (hours.mode) {
    case "unspecified":
      return [];
    case "always_open":
      return ["Öppet dygnet runt"];
    case "by_appointment":
      return ["Öppet enligt överenskommelse"];
    case "regular":
      break;
  }
  if (!hours.week) return [];
  const lines: string[] = [];
  let runStart = 0;
  for (let index = 1; index <= BUSINESS_WEEKDAYS.length; index += 1) {
    const current = index < BUSINESS_WEEKDAYS.length ? hours.week[BUSINESS_WEEKDAYS[index]] : null;
    const first = hours.week[BUSINESS_WEEKDAYS[runStart]];
    if (current && dayKey(current) === dayKey(first)) continue;
    const startLabel = WEEKDAY_LABELS_SV[BUSINESS_WEEKDAYS[runStart]];
    const endLabel = WEEKDAY_LABELS_SV[BUSINESS_WEEKDAYS[index - 1]];
    const span = runStart === index - 1 ? startLabel : `${startLabel}–${endLabel}`;
    lines.push(`${span} ${formatDay(first)}`);
    runStart = index;
  }
  return lines;
}

export function formatAddressLine(address: BusinessAddress | null): string | null {
  if (!address) return null;
  return `${address.street}, ${address.postalCode} ${address.city}`;
}
