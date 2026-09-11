import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbState = {
  configured: true,
  rows: [] as unknown[],
  throwOnSelect: false,
  /** Sista `.set()`-payloaden updatePricingSettings skrev. */
  lastUpdate: null as Record<string, unknown> | null,
  /** Ordningen läs/skriv skedde i, för att bevisa att låset tas först. */
  order: [] as string[],
  /** Raden `ensureSettings()` försökte skapa. */
  insertedValues: null as Record<string, unknown> | null,
};

vi.mock("@/lib/db/client", () => {
  const readChain = {
    from: () => ({
      where: () => ({
        limit: async () => {
          if (dbState.throwOnSelect) throw new Error("connection reset");
          return dbState.rows;
        },
        // SELECT … FOR UPDATE: samma rader, men registrerar att låset togs.
        for: async (mode: string) => {
          dbState.order.push(`lock:${mode}`);
          return dbState.rows;
        },
      }),
    }),
  };

  const writeChain = {
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          dbState.order.push("update");
          dbState.lastUpdate = values;
          const current = (dbState.rows[0] ?? {}) as Record<string, unknown>;
          const merged = { ...current, ...values };
          dbState.rows = [merged];
          return [merged];
        },
      }),
    }),
  };

  const tx = { select: () => readChain, update: () => writeChain };

  return {
    get dbConfigured() {
      return dbState.configured;
    },
    db: {
      select: () => readChain,
      update: () => writeChain,
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          dbState.insertedValues = values;
          return { onConflictDoNothing: async () => undefined };
        },
      }),
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { DEFAULT_CREDIT_ACTION_PRICES, getCreditCost } from "@/lib/credits/pricing";
import { applyMarkupSek, DEFAULT_DOMAIN_PRICING } from "@/lib/domains/pricing";
import {
  FALLBACK_PRICING_SETTINGS,
  mapPricingSettings,
  mergeCreditActionPrices,
  parseCreditActionPrices,
  resolvePricingSettings,
  updatePricingSettings,
} from "./pricing-settings";

type Row = Parameters<typeof mapPricingSettings>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "default",
    domain_markup_basis_points: DEFAULT_DOMAIN_PRICING.markup * 10_000,
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
  dbState.lastUpdate = null;
  dbState.order = [];
  dbState.insertedValues = null;
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

describe("mergeCreditActionPrices", () => {
  const current = {
    promptCreate: { premium: 12, pro: 8 },
    wizard: 9,
    auditBasic: 20,
  };

  it("leaves missing fields untouched", () => {
    expect(mergeCreditActionPrices(current, { wizard: 14 })).toEqual({
      promptCreate: { premium: 12, pro: 8 },
      wizard: 14,
      auditBasic: 20,
    });
  });

  it("removes an override when the field is null", () => {
    expect(mergeCreditActionPrices(current, { wizard: null })).toEqual({
      promptCreate: { premium: 12, pro: 8 },
      auditBasic: 20,
    });
  });

  it("merges per model tier instead of replacing the group", () => {
    expect(mergeCreditActionPrices(current, { promptCreate: { pro: 3 } }).promptCreate).toEqual({
      premium: 12,
      pro: 3,
    });
    expect(mergeCreditActionPrices(current, { promptCreate: { premium: null } }).promptCreate)
      .toEqual({ pro: 8 });
  });

  it("drops a tier group that becomes empty, and one nulled wholesale", () => {
    expect(
      mergeCreditActionPrices(current, { promptCreate: { premium: null, pro: null } }),
    ).toEqual({ wizard: 9, auditBasic: 20 });
    expect(mergeCreditActionPrices(current, { promptCreate: null })).toEqual({
      wizard: 9,
      auditBasic: 20,
    });
  });

  it("keeps 0 as a real price rather than treating it as removal", () => {
    expect(mergeCreditActionPrices(current, { wizard: 0 }).wizard).toBe(0);
  });
});

describe("updatePricingSettings patch semantics", () => {
  function seedRow(creditActionPrices: Record<string, unknown>) {
    dbState.rows = [row({ credit_action_prices: creditActionPrices as never })];
  }

  it("keeps other stored overrides when patching one field", async () => {
    seedRow({ promptCreate: { premium: 12 }, wizard: 9, auditBasic: 20 });

    const settings = await updatePricingSettings({ creditActionPrices: { wizard: 14 }, updatedBy: "jakob" });

    expect(settings.creditActionPrices).toEqual({
      promptCreate: { premium: 12 },
      wizard: 14,
      auditBasic: 20,
    });
    // Regression: en ersättande .set() skrev {wizard:14} och raderade resten.
    expect(getCreditCost("audit.basic", {}, settings.creditActionPrices)).toBe(20);
    expect(getCreditCost("prompt.create", { modelId: "premium" }, settings.creditActionPrices)).toBe(12);
  });

  it("removes an override with null so getCreditCost returns to its constant", async () => {
    seedRow({ wizard: 9, auditBasic: 20 });

    const settings = await updatePricingSettings({
      creditActionPrices: { wizard: null },
      updatedBy: "jakob",
    });

    expect(settings.creditActionPrices).toEqual({ auditBasic: 20 });
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.wizard,
    );
  });

  it("rejects an unknown key with RangeError and writes nothing", async () => {
    seedRow({ wizard: 9 });

    await expect(
      updatePricingSettings({ creditActionPrices: { wizrad: 9 }, updatedBy: "jakob" }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(dbState.lastUpdate).toBeNull();
  });

  it("rejects an invalid number with RangeError", async () => {
    seedRow({ wizard: 9 });

    for (const broken of [{ wizard: -1 }, { wizard: 11.5 }, { wizard: 10_000 }, { wizard: "9" }]) {
      await expect(
        updatePricingSettings({ creditActionPrices: broken, updatedBy: "jakob" }),
      ).rejects.toBeInstanceOf(RangeError);
    }
    expect(dbState.lastUpdate).toBeNull();
  });

  it("takes the row lock before writing", async () => {
    seedRow({ wizard: 9 });

    await updatePricingSettings({ creditActionPrices: { wizard: 12 }, updatedBy: "jakob" });

    expect(dbState.order).toEqual(["lock:update", "update"]);
  });

  it("leaves the domain columns untouched when the patch omits them", async () => {
    seedRow({});

    await updatePricingSettings({ creditActionPrices: { wizard: 12 }, updatedBy: "jakob" });

    expect(dbState.lastUpdate).not.toHaveProperty("domain_markup_basis_points");
    expect(dbState.lastUpdate).not.toHaveProperty("domain_usd_to_sek_ore");
    expect(dbState.lastUpdate).toMatchObject({ updated_by: "jakob" });
  });

  it("leaves credit prices untouched when the patch omits them", async () => {
    seedRow({ wizard: 9 });

    const settings = await updatePricingSettings({ domainMarkup: 3, updatedBy: "jakob" });

    expect(dbState.lastUpdate).not.toHaveProperty("credit_action_prices");
    expect(settings.domain.markup).toBe(3);
    expect(settings.creditActionPrices).toEqual({ wizard: 9 });
  });

  it("still range-checks the domain fields it is given", async () => {
    seedRow({});
    await expect(updatePricingSettings({ domainMarkup: 20, updatedBy: "j" })).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      updatePricingSettings({ domainUsdToSek: 0.5, updatedBy: "j" }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("add-pricing-settings.sql seed", () => {
  const sql = readFileSync(
    resolve("src/lib/db/migrations/add-pricing-settings.sql"),
    "utf8",
  );
  const schema = readFileSync(resolve("src/lib/db/schema.ts"), "utf8");
  const domainPricingJson = JSON.parse(
    readFileSync(resolve("config/domain-pricing.json"), "utf8"),
  ) as { markup: number; usdToSek: { rate: number } };

  const insert = sql.slice(sql.indexOf("INSERT INTO pricing_settings"));
  const expectedMarkupBasisPoints = domainPricingJson.markup * 10_000;
  const expectedUsdToSekOre = domainPricingJson.usdToSek.rate * 100;
  const sqlColumnDefault = Number(
    sql.match(/domain_markup_basis_points INTEGER NOT NULL DEFAULT (\d+)/)?.[1],
  );
  const sqlInsertMarkup = Number(insert.match(/VALUES \('default', (\d+),/)?.[1]);
  const schemaDefault = Number(
    schema
      .match(
        /domain_markup_basis_points: integer\("domain_markup_basis_points"\)\.default\(([\d_]+)\)/,
      )?.[1]
      ?.replaceAll("_", ""),
  );

  it("keeps JSON, code fallback, SQL DEFAULT, SQL INSERT and schema default in phase", () => {
    // Ägarbeslut 2026-09-11: x2. En ändring på ett av ställena men inte de
    // andra ska bli röd — annars ser tre källor levande ut med olika pris.
    expect(domainPricingJson.markup).toBe(2);
    expect(DEFAULT_DOMAIN_PRICING.markup).toBe(domainPricingJson.markup);
    expect(FALLBACK_PRICING_SETTINGS.domainMarkupBasisPoints).toBe(expectedMarkupBasisPoints);
    expect(sqlColumnDefault).toBe(expectedMarkupBasisPoints);
    expect(sqlInsertMarkup).toBe(expectedMarkupBasisPoints);
    expect(schemaDefault).toBe(expectedMarkupBasisPoints);
  });

  it("seeds the markup and rate the code defaults to", () => {
    // Domänfälten är NOT NULL och har inget null-kontrakt: de MÅSTE seedas,
    // och med exakt vad koden defaultar till.
    expect(insert).toMatch(new RegExp(`\\b${expectedMarkupBasisPoints}\\b`));
    expect(insert).toMatch(new RegExp(`\\b${expectedUsdToSekOre}\\b`));
  });

  it("seeds credit_action_prices empty so the code owns the prices", () => {
    // Vänd mot det tidigare kontraktet med flit. En full seed ser harmlös ut
    // (värdena är konstanternas) men gör varje fält till en databas-override
    // från dag ett: admin-UI:ts Databas/Kod-badge slutar skilja på något, en
    // ändrad konstant slår inte igenom, och fallbackvägen blir aldrig den
    // normala. Testet finns för att ingen ska råka återinföra en full seed.
    const seeded = insert.match(/'(\{[\s\S]*?\})'::jsonb/)?.[1];
    expect(seeded).toBeTruthy();
    expect(JSON.parse(seeded as string)).toEqual({});

    for (const field of Object.keys(DEFAULT_CREDIT_ACTION_PRICES)) {
      expect(insert).not.toContain(field);
    }
  });

  it("still creates the row, since the domain columns need real values", () => {
    expect(insert).toMatch(/INSERT INTO pricing_settings/);
    expect(insert).toMatch(/'default'/);
    expect(insert).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });
});

describe("ensureSettings mirrors the migration seed", () => {
  it("creates the row with domain values and no credit overrides", async () => {
    // Två ställen skapar singletonraden. Gör de olika rader börjar en färsk
    // miljö bete sig olika beroende på om migrationen eller runtime hann först.
    dbState.rows = [];
    dbState.insertedValues = null;

    await updatePricingSettings({ updatedBy: "jakob" }).catch(() => null);

    expect(dbState.insertedValues).toMatchObject({
      id: "default",
      domain_markup_basis_points: DEFAULT_DOMAIN_PRICING.markup * 10_000,
      domain_usd_to_sek_ore: DEFAULT_DOMAIN_PRICING.usdToSek * 100,
      credit_action_prices: {},
    });
  });
});
