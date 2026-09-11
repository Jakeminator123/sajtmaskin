/**
 * Operatörsstyrd prisbild: domänpåslag och de fasta creditpriserna.
 *
 * Skild från `generation-billing.ts` med flit. Den tabellen ägs av den
 * usage-baserade LLM-avräkningen och dess värden fryses per generering; den
 * här styr priser som läses om vid varje anrop.
 *
 * Två lässätt:
 *   - {@link getPricingSettings} för admin/backoffice — kastar hellre än
 *     rapporterar en prisbild den inte kunde läsa.
 *   - {@link resolvePricingSettings} för debiteringsvägar — kastar aldrig.
 *     Saknad rad, okonfigurerad databas, trasig JSON eller värden utanför
 *     intervall faller tillbaka på konstanterna i koden.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  DEFAULT_CREDIT_ACTION_PRICES,
  type CreditPriceOverrides,
} from "@/lib/credits/pricing";
import { DEFAULT_DOMAIN_PRICING, type DomainPricingSettings } from "@/lib/domains/pricing";
import { db, dbConfigured } from "@/lib/db/client";
import { pricingSettings } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export const PRICING_SETTINGS_ID = "default";

/** Samma gränser som CHECK-villkoren i `add-pricing-settings.sql`. */
export const DOMAIN_MARKUP_BASIS_POINTS_MIN = 10_000;
export const DOMAIN_MARKUP_BASIS_POINTS_MAX = 100_000;
export const DOMAIN_USD_TO_SEK_ORE_MIN = 100;
export const DOMAIN_USD_TO_SEK_ORE_MAX = 10_000;
/** Ett enskilt creditpris. 0 = gratis; taket stoppar ett tappat nollslag. */
export const CREDIT_PRICE_MAX = 1_000;

const DEFAULT_DOMAIN_MARKUP_BASIS_POINTS = Math.round(DEFAULT_DOMAIN_PRICING.markup * 10_000);
const DEFAULT_DOMAIN_USD_TO_SEK_ORE = Math.round(DEFAULT_DOMAIN_PRICING.usdToSek * 100);

const creditPriceSchema = z.number().int().min(0).max(CREDIT_PRICE_MAX);
const modelTierPricesSchema = z
  .strictObject({
    premium: creditPriceSchema,
    pro: creditPriceSchema,
    max: creditPriceSchema,
    codex: creditPriceSchema,
    anthropic: creditPriceSchema,
  })
  .partial();

const CREDIT_ACTION_PRICE_FIELDS = {
  promptCreate: modelTierPricesSchema,
  promptRefine: modelTierPricesSchema,
  wizard: creditPriceSchema,
  auditBasic: creditPriceSchema,
  auditAdvanced: creditPriceSchema,
  deployPreview: creditPriceSchema,
  deployProduction: creditPriceSchema,
  openclawTip: creditPriceSchema,
} as const;

/**
 * Varje fält är valfritt: en rad som bara överrider audit-priset ska vara
 * giltig, och resten faller tillbaka på koden. Strikt om okända nycklar så ett
 * felstavat fältnamn inte tyst blir en prisändring som aldrig slår igenom.
 */
export const creditActionPricesSchema = z.strictObject(CREDIT_ACTION_PRICE_FIELDS).partial();

export type PricingSettings = {
  domainMarkupBasisPoints: number;
  domainUsdToSekOre: number;
  /** Upplöst form som `src/lib/domains/pricing.ts` tar emot. */
  domain: DomainPricingSettings;
  /** Upplöst form som `getCreditCost` tar emot. */
  creditActionPrices: CreditPriceOverrides;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Prisbilden som gäller när databasen inte kan svara. */
export const FALLBACK_PRICING_SETTINGS: PricingSettings = {
  domainMarkupBasisPoints: DEFAULT_DOMAIN_MARKUP_BASIS_POINTS,
  domainUsdToSekOre: DEFAULT_DOMAIN_USD_TO_SEK_ORE,
  domain: DEFAULT_DOMAIN_PRICING,
  creditActionPrices: DEFAULT_CREDIT_ACTION_PRICES,
  updatedAt: null,
  updatedBy: null,
};

function clampedBasisPoints(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < DOMAIN_MARKUP_BASIS_POINTS_MIN ||
    value > DOMAIN_MARKUP_BASIS_POINTS_MAX
  ) {
    return DEFAULT_DOMAIN_MARKUP_BASIS_POINTS;
  }
  return value;
}

function clampedUsdToSekOre(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < DOMAIN_USD_TO_SEK_ORE_MIN ||
    value > DOMAIN_USD_TO_SEK_ORE_MAX
  ) {
    return DEFAULT_DOMAIN_USD_TO_SEK_ORE;
  }
  return value;
}

/**
 * Tolerant JSON-läsning för debiteringsvägen. En hel rad som inte validerar
 * räddas fält för fält, så ett enda skräpvärde inte tyst återställer hela
 * prislistan till koden — och ett fält som ändå inte går att rädda utelämnas,
 * varpå `getCreditCost` använder sin konstant.
 */
export function parseCreditActionPrices(value: unknown): CreditPriceOverrides {
  const parsed = creditActionPricesSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const salvaged: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(CREDIT_ACTION_PRICE_FIELDS)) {
    const fieldValue = (value as Record<string, unknown>)[field];
    if (fieldValue === undefined) continue;
    const fieldResult = schema.safeParse(fieldValue);
    if (fieldResult.success) salvaged[field] = fieldResult.data;
  }
  return salvaged as CreditPriceOverrides;
}

export function mapPricingSettings(row: typeof pricingSettings.$inferSelect): PricingSettings {
  const domainMarkupBasisPoints = clampedBasisPoints(row.domain_markup_basis_points);
  const domainUsdToSekOre = clampedUsdToSekOre(row.domain_usd_to_sek_ore);
  return {
    domainMarkupBasisPoints,
    domainUsdToSekOre,
    domain: {
      markup: domainMarkupBasisPoints / 10_000,
      usdToSek: domainUsdToSekOre / 100,
    },
    creditActionPrices: parseCreditActionPrices(row.credit_action_prices),
    updatedAt: row.updated_at?.toISOString() ?? null,
    updatedBy: row.updated_by,
  };
}

async function ensureSettings() {
  await db
    .insert(pricingSettings)
    .values({
      id: PRICING_SETTINGS_ID,
      domain_markup_basis_points: DEFAULT_DOMAIN_MARKUP_BASIS_POINTS,
      domain_usd_to_sek_ore: DEFAULT_DOMAIN_USD_TO_SEK_ORE,
      credit_action_prices: DEFAULT_CREDIT_ACTION_PRICES,
    })
    .onConflictDoNothing({ target: pricingSettings.id });
}

async function selectSettingsRow() {
  const rows = await db
    .select()
    .from(pricingSettings)
    .where(eq(pricingSettings.id, PRICING_SETTINGS_ID))
    .limit(1);
  return rows[0] ?? null;
}

/** Admin-läsning. Kastar hellre än rapporterar en prisbild den inte kunde läsa. */
export async function getPricingSettings(): Promise<PricingSettings> {
  assertDbConfigured();
  await ensureSettings();
  const row = await selectSettingsRow();
  if (!row) throw new Error("Pricing settings missing");
  return mapPricingSettings(row);
}

/**
 * Debiteringsvägarnas läsning. Får aldrig kasta: ett läsfel ska ge dagens
 * priser, inte ett avbrutet köp eller en utebliven kreditdragning.
 */
export async function resolvePricingSettings(): Promise<PricingSettings> {
  if (!dbConfigured) return FALLBACK_PRICING_SETTINGS;
  try {
    const row = await selectSettingsRow();
    return row ? mapPricingSettings(row) : FALLBACK_PRICING_SETTINGS;
  } catch (error) {
    console.error(
      "[pricing-settings] Kunde inte läsa prisbilden, använder defaultvärden:",
      error instanceof Error ? error.message : error,
    );
    return FALLBACK_PRICING_SETTINGS;
  }
}

export type UpdatePricingSettingsInput = {
  /** Multiplikator, t.ex. 5 för X5. */
  domainMarkup: number;
  /** Kronor per USD, t.ex. 11. */
  domainUsdToSek: number;
  creditActionPrices?: unknown;
  updatedBy: string;
};

export async function updatePricingSettings(
  input: UpdatePricingSettingsInput,
): Promise<PricingSettings> {
  assertDbConfigured();
  const domainMarkupBasisPoints = Math.round(input.domainMarkup * 10_000);
  const domainUsdToSekOre = Math.round(input.domainUsdToSek * 100);
  if (
    !Number.isFinite(domainMarkupBasisPoints) ||
    domainMarkupBasisPoints < DOMAIN_MARKUP_BASIS_POINTS_MIN ||
    domainMarkupBasisPoints > DOMAIN_MARKUP_BASIS_POINTS_MAX
  ) {
    throw new RangeError("Domänpåslaget måste vara mellan X1,0 och X10,0.");
  }
  if (
    !Number.isFinite(domainUsdToSekOre) ||
    domainUsdToSekOre < DOMAIN_USD_TO_SEK_ORE_MIN ||
    domainUsdToSekOre > DOMAIN_USD_TO_SEK_ORE_MAX
  ) {
    throw new RangeError("USD/SEK för domäner måste vara mellan 1 och 100.");
  }

  // Här är strikt validering rätt: en admin som skickar ett ogiltigt pris ska
  // få veta det, till skillnad från resolvern som måste tåla en trasig rad.
  let creditActionPrices: CreditPriceOverrides = {};
  if (input.creditActionPrices !== undefined) {
    const parsed = creditActionPricesSchema.safeParse(input.creditActionPrices);
    if (!parsed.success) {
      throw new RangeError(
        `Creditpriserna måste vara heltal mellan 0 och ${CREDIT_PRICE_MAX} per åtgärd.`,
      );
    }
    creditActionPrices = parsed.data;
  }

  await ensureSettings();
  const rows = await db
    .update(pricingSettings)
    .set({
      domain_markup_basis_points: domainMarkupBasisPoints,
      domain_usd_to_sek_ore: domainUsdToSekOre,
      ...(input.creditActionPrices === undefined ? {} : { credit_action_prices: creditActionPrices }),
      updated_by: input.updatedBy,
      updated_at: new Date(),
    })
    .where(eq(pricingSettings.id, PRICING_SETTINGS_ID))
    .returning();
  if (!rows[0]) throw new Error("Pricing settings could not be updated");
  return mapPricingSettings(rows[0]);
}
