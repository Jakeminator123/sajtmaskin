import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbState = {
  configured: true,
  rows: [] as unknown[],
  throwOnSelect: false,
};

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return dbState.configured;
  },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (dbState.throwOnSelect) throw new Error("connection reset");
            return dbState.rows;
          },
        }),
      }),
    }),
  },
}));

import { DEFAULT_CREDIT_ACTION_PRICES, getCreditCost } from "@/lib/credits/pricing";
import { applyMarkupSek, DEFAULT_DOMAIN_PRICING } from "@/lib/domains/pricing";
import {
  FALLBACK_PRICING_SETTINGS,
  mapPricingSettings,
  parseCreditActionPrices,
  resolvePricingSettings,
} from "./pricing-settings";

type Row = Parameters<typeof mapPricingSettings>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "default",
    domain_markup_basis_points: 50_000,
    domain_usd_to_sek_ore: 1_100,
    credit_action_prices: {},
    updated_by: null,
    updated_at: new Date("2026-09-11T00:00:00.000Z"),
    ...overrides,
  } as Row;
}

beforeEach(() => {
  dbState.configured = true;
  dbState.rows = [];
  dbState.throwOnSelect = false;
  vi.restoreAllMocks();
});

describe("mapPricingSettings", () => {
  it("converts integer units back to the multipliers the pricing functions take", () => {
    const settings = mapPricingSettings(
      row({ domain_markup_basis_points: 70_000, domain_usd_to_sek_ore: 950 }),
    );
    expect(settings.domain.markup).toBe(7);
    expect(settings.domain.usdToSek).toBe(9.5);
    expect(settings.updatedAt).toBe("2026-09-11T00:00:00.000Z");
  });

  it("falls back to the seeded defaults for out-of-range integers", () => {
    // A row that somehow escaped the CHECK constraints must not price a sale.
    for (const broken of [0, -1, 5_000, 500_000, 1.5]) {
      expect(mapPricingSettings(row({ domain_markup_basis_points: broken })).domain.markup).toBe(
        DEFAULT_DOMAIN_PRICING.markup,
      );
    }
    for (const broken of [0, -1, 99, 10_001, 1.5]) {
      expect(mapPricingSettings(row({ domain_usd_to_sek_ore: broken })).domain.usdToSek).toBe(
        DEFAULT_DOMAIN_PRICING.usdToSek,
      );
    }
  });
});

describe("parseCreditActionPrices", () => {
  it("keeps a valid partial price list", () => {
    expect(parseCreditActionPrices({ auditBasic: 20, promptCreate: { premium: 12 } })).toEqual({
      auditBasic: 20,
      promptCreate: { premium: 12 },
    });
  });

  it("treats non-object JSON as no overrides", () => {
    for (const value of [null, undefined, 7, "wizard=11", [], true]) {
      expect(parseCreditActionPrices(value)).toEqual({});
    }
  });

  it("salvages the valid fields when one field is broken", () => {
    // Dropping the whole list because a single value rotted would silently
    // revert every other operator-set price.
    expect(
      parseCreditActionPrices({ auditBasic: 20, wizard: -3, deployProduction: 25 }),
    ).toEqual({ auditBasic: 20, deployProduction: 25 });
  });

  it("drops unknown keys and out-of-range values", () => {
    expect(parseCreditActionPrices({ notAnAction: 5 })).toEqual({});
    expect(parseCreditActionPrices({ wizard: 100_000 })).toEqual({});
    expect(parseCreditActionPrices({ wizard: 11.5 })).toEqual({});
  });
});

describe("resolvePricingSettings", () => {
  it("returns the stored row when it can be read", async () => {
    dbState.rows = [row({ domain_markup_basis_points: 60_000, credit_action_prices: { wizard: 9 } })];
    const settings = await resolvePricingSettings();
    expect(settings.domain.markup).toBe(6);
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).toBe(9);
  });

  it("falls back when the row is missing", async () => {
    dbState.rows = [];
    await expect(resolvePricingSettings()).resolves.toEqual(FALLBACK_PRICING_SETTINGS);
  });

  it("falls back when the database is not configured", async () => {
    dbState.configured = false;
    await expect(resolvePricingSettings()).resolves.toEqual(FALLBACK_PRICING_SETTINGS);
  });

  it("falls back instead of throwing when the query fails", async () => {
    // A charge must never die because the price row could not be read.
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.throwOnSelect = true;
    await expect(resolvePricingSettings()).resolves.toEqual(FALLBACK_PRICING_SETTINGS);
  });

  it("keeps today's prices as the fallback", () => {
    expect(FALLBACK_PRICING_SETTINGS.domain).toEqual(DEFAULT_DOMAIN_PRICING);
    expect(FALLBACK_PRICING_SETTINGS.creditActionPrices).toEqual(DEFAULT_CREDIT_ACTION_PRICES);
  });
});

describe("an admin-set markup reaches the customer price", () => {
  it("prices a domain from the resolved row, not the JSON seed", async () => {
    dbState.rows = [row({ domain_markup_basis_points: 30_000, domain_usd_to_sek_ore: 900 })];
    const { domain } = await resolvePricingSettings();

    expect(applyMarkupSek(99, domain)).toBe(297);
    expect(applyMarkupSek(99)).toBe(99 * DEFAULT_DOMAIN_PRICING.markup);
  });
});

describe("add-pricing-settings.sql seed", () => {
  const sql = readFileSync(
    resolve("src/lib/db/migrations/add-pricing-settings.sql"),
    "utf8",
  );

  const insert = sql.slice(sql.indexOf("INSERT INTO pricing_settings"));

  it("seeds the markup and rate the code defaults to", () => {
    expect(insert).toMatch(
      new RegExp(`^\\s*${DEFAULT_DOMAIN_PRICING.markup * 10_000},\\s*$`, "m"),
    );
    expect(insert).toMatch(new RegExp(`^\\s*${DEFAULT_DOMAIN_PRICING.usdToSek * 100},\\s*$`, "m"));
  });

  it("seeds exactly the current credit prices", () => {
    // Drift here would make the database silently charge yesterday's prices.
    const seeded = insert.match(/'(\{[\s\S]*\})'::jsonb/)?.[1];
    expect(seeded).toBeTruthy();
    expect(JSON.parse(seeded as string)).toEqual(DEFAULT_CREDIT_ACTION_PRICES);
  });
});
