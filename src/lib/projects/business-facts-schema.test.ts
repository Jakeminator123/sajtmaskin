import { describe, expect, it } from "vitest";
import {
  BUSINESS_FACTS_DEFAULTS,
  businessFactsInputSchema,
  formatAddressLine,
  formatOpeningHoursLines,
  hasBusinessFacts,
  readBusinessFactsForDeploy,
  readBusinessFactsFromMeta,
  resolveBusinessFactsSupport,
  type OpeningHours,
} from "./business-facts-schema";

const WEEK = {
  mon: { closed: false as const, open: "09:00", close: "17:00" },
  tue: { closed: false as const, open: "09:00", close: "17:00" },
  wed: { closed: false as const, open: "09:00", close: "17:00" },
  thu: { closed: false as const, open: "09:00", close: "17:00" },
  fri: { closed: false as const, open: "09:00", close: "15:00" },
  sat: { closed: false as const, open: "10:00", close: "14:00" },
  sun: { closed: true as const },
};

describe("formatOpeningHoursLines", () => {
  it("collapses consecutive identical weekdays into Swedish ranges", () => {
    const hours: OpeningHours = { mode: "regular", week: WEEK };
    expect(formatOpeningHoursLines(hours)).toEqual([
      "Måndag–Torsdag 09:00–17:00",
      "Fredag 09:00–15:00",
      "Lördag 10:00–14:00",
      "Söndag Stängt",
    ]);
  });

  it("renders the standardized modes without a week", () => {
    expect(formatOpeningHoursLines({ mode: "always_open", week: null })).toEqual([
      "Öppet dygnet runt",
    ]);
    expect(formatOpeningHoursLines({ mode: "by_appointment", week: null })).toEqual([
      "Öppet enligt överenskommelse",
    ]);
    expect(formatOpeningHoursLines({ mode: "unspecified", week: null })).toEqual([]);
  });

  it("collapses a fully identical week into one line", () => {
    const sameEveryDay = Object.fromEntries(
      Object.keys(WEEK).map((day) => [day, { closed: false, open: "08:00", close: "20:00" }]),
    ) as OpeningHours["week"];
    expect(formatOpeningHoursLines({ mode: "regular", week: sameEveryDay })).toEqual([
      "Måndag–Söndag 08:00–20:00",
    ]);
  });
});

describe("businessFactsInputSchema", () => {
  const emptyContact = { phone: null, email: null, orgNumber: null, address: null };

  it("normalizes org number, postal code, e-mail and phone whitespace", () => {
    const parsed = businessFactsInputSchema.parse({
      hours: { mode: "unspecified", week: null },
      contact: {
        phone: " 08-123   45 67 ",
        email: " INFO@Kund.se ",
        orgNumber: "5566778899",
        address: { street: "  Storgatan  1 ", postalCode: "12345", city: "Staden" },
      },
    });
    expect(parsed.contact).toEqual({
      phone: "08-123 45 67",
      email: "info@kund.se",
      orgNumber: "556677-8899",
      address: { street: "Storgatan 1", postalCode: "123 45", city: "Staden" },
    });
  });

  it("requires a week for regular hours and quarter-hour times", () => {
    expect(
      businessFactsInputSchema.safeParse({
        hours: { mode: "regular", week: null },
        contact: emptyContact,
      }).success,
    ).toBe(false);
    expect(
      businessFactsInputSchema.safeParse({
        hours: {
          mode: "regular",
          week: { ...WEEK, mon: { closed: false, open: "09:05", close: "17:00" } },
        },
        contact: emptyContact,
      }).success,
    ).toBe(false);
    expect(
      businessFactsInputSchema.safeParse({
        hours: {
          mode: "regular",
          week: { ...WEEK, mon: { closed: false, open: "09:00", close: "09:00" } },
        },
        contact: emptyContact,
      }).success,
    ).toBe(false);
  });

  it("allows an overnight close (bar hours) and a 24/7 mode", () => {
    expect(
      businessFactsInputSchema.safeParse({
        hours: {
          mode: "regular",
          week: { ...WEEK, fri: { closed: false, open: "18:00", close: "02:00" } },
        },
        contact: emptyContact,
      }).success,
    ).toBe(true);
    expect(
      businessFactsInputSchema.safeParse({
        hours: { mode: "always_open", week: null },
        contact: emptyContact,
      }).success,
    ).toBe(true);
  });
});

describe("readBusinessFactsFromMeta", () => {
  it("returns defaults for missing or malformed namespaces", () => {
    expect(readBusinessFactsFromMeta(null)).toEqual(BUSINESS_FACTS_DEFAULTS);
    expect(readBusinessFactsFromMeta({ seo: {} })).toEqual(BUSINESS_FACTS_DEFAULTS);
    expect(readBusinessFactsFromMeta({ business: "9-17" })).toEqual(BUSINESS_FACTS_DEFAULTS);
    expect(readBusinessFactsFromMeta({ business: { hours: { mode: "weird" } } })).toEqual(
      BUSINESS_FACTS_DEFAULTS,
    );
  });

  it("keeps lastSetAt and reports facts as present", () => {
    const facts = readBusinessFactsFromMeta({
      business: {
        hours: { mode: "always_open", week: null },
        contact: { phone: null, email: null, orgNumber: null, address: null },
        lastSetAt: "2026-10-22T08:00:00.000Z",
      },
    });
    expect(facts.lastSetAt).toBe("2026-10-22T08:00:00.000Z");
    expect(hasBusinessFacts(facts)).toBe(true);
    expect(hasBusinessFacts(BUSINESS_FACTS_DEFAULTS)).toBe(false);
  });

  it("does not let callers mutate the shared defaults", () => {
    const facts = readBusinessFactsFromMeta(null);
    facts.contact.phone = "123";
    expect(BUSINESS_FACTS_DEFAULTS.contact.phone).toBeNull();
  });
});

describe("readBusinessFactsForDeploy", () => {
  it("treats an unreadable meta or a malformed namespace as unknown, never as empty facts", () => {
    expect(readBusinessFactsForDeploy(null)).toBeNull();
    expect(readBusinessFactsForDeploy(undefined)).toBeNull();
    expect(readBusinessFactsForDeploy({ business: "9-17" })).toBeNull();
    expect(readBusinessFactsForDeploy({ business: { hours: { mode: "weird" } } })).toBeNull();
    expect(
      readBusinessFactsForDeploy({
        business: {
          hours: { mode: "always_open", week: null },
          // One invalid field must not wipe the whole module on deploy.
          contact: { phone: "1", email: null, orgNumber: null, address: null },
        },
      }),
    ).toBeNull();
  });

  it("reads an absent or cleared namespace as intentionally empty", () => {
    expect(readBusinessFactsForDeploy({})).toEqual(BUSINESS_FACTS_DEFAULTS);
    expect(readBusinessFactsForDeploy({ seo: {} })).toEqual(BUSINESS_FACTS_DEFAULTS);
    expect(readBusinessFactsForDeploy({ business: null })).toEqual(BUSINESS_FACTS_DEFAULTS);
  });

  it("returns valid facts with lastSetAt", () => {
    const facts = readBusinessFactsForDeploy({
      business: {
        hours: { mode: "always_open", week: null },
        contact: { phone: null, email: null, orgNumber: null, address: null },
        lastSetAt: "2026-10-22T08:00:00.000Z",
      },
    });
    expect(facts?.hours.mode).toBe("always_open");
    expect(facts?.lastSetAt).toBe("2026-10-22T08:00:00.000Z");
  });
});

describe("business facts support record", () => {
  const record = { supported: false, versionId: "ver_1", checkedAt: "2026-10-22T09:00:00.000Z" };

  it("only answers for the version that is live now", () => {
    expect(resolveBusinessFactsSupport(record, "ver_1")).toBe("unsupported");
    expect(resolveBusinessFactsSupport({ ...record, supported: true }, "ver_1")).toBe("supported");
    expect(resolveBusinessFactsSupport(record, "ver_2")).toBe("unknown");
    expect(resolveBusinessFactsSupport(record, null)).toBe("unknown");
    expect(resolveBusinessFactsSupport(null, "ver_1")).toBe("unknown");
  });

  it("separates imported repos from sites the builder can upgrade", () => {
    expect(resolveBusinessFactsSupport({ ...record, importedRepo: true }, "ver_1")).toBe("imported");
    expect(resolveBusinessFactsSupport({ ...record, importedRepo: false }, "ver_1")).toBe(
      "unsupported",
    );
  });
});

describe("formatAddressLine", () => {
  it("joins street, postal code and city", () => {
    expect(formatAddressLine({ street: "Storgatan 1", postalCode: "123 45", city: "Staden" })).toBe(
      "Storgatan 1, 123 45 Staden",
    );
    expect(formatAddressLine(null)).toBeNull();
  });
});
