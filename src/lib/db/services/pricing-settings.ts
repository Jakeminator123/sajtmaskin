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
 * Formen som ligger LAGRAD i `credit_action_prices`. Varje fält är valfritt: en
 * rad som bara överrider audit-priset ska vara giltig, och resten faller
 * tillbaka på koden. Strikt om okända nycklar så ett felstavat fältnamn inte
 * tyst blir en prisändring som aldrig slår igenom.
 *
 * `null` finns inte här med flit — en borttagen override lagras som en saknad
 * nyckel, inte som en null. Se {@link creditActionPricesPatchSchema}.
 */
export const creditActionPricesSchema = z.strictObject(CREDIT_ACTION_PRICE_FIELDS).partial();

const modelTierPricesPatchSchema = z
  .strictObject({
    premium: creditPriceSchema.nullable(),
    pro: creditPriceSchema.nullable(),
    max: creditPriceSchema.nullable(),
    codex: creditPriceSchema.nullable(),
    anthropic: creditPriceSchema.nullable(),
  })
  .partial();

/**
 * Formen en admin SKICKAR IN. Skild från den lagrade formen eftersom en patch
 * behöver kunna uttrycka "ta bort den här overriden" — vilket `null` betyder.
 * Se {@link updatePricingSettings} för hela semantiken.
 */
export const creditActionPricesPatchSchema = z
  .strictObject({
    promptCreate: modelTierPricesPatchSchema.nullable(),
    promptRefine: modelTierPricesPatchSchema.nullable(),
    wizard: creditPriceSchema.nullable(),
    auditBasic: creditPriceSchema.nullable(),
    auditAdvanced: creditPriceSchema.nullable(),
    deployPreview: creditPriceSchema.nullable(),
    deployProduction: creditPriceSchema.nullable(),
    openclawTip: creditPriceSchema.nullable(),
  })
  .partial();

export type CreditActionPricesPatch = z.infer<typeof creditActionPricesPatchSchema>;

function mergeModelTierPrices(
  current: Partial<Record<string, number>>,
  patch: Record<string, number | null | undefined>,
): Record<string, number> {
  const merged: Record<string, number> = { ...(current as Record<string, number>) };
  for (const [tier, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete merged[tier];
    else merged[tier] = value;
  }
  return merged;
}

/**
 * Slår ihop en patch med den lagrade prislistan enligt semantiken i
 * {@link updatePricingSettings}. Ren funktion — anroparen äger låsningen.
 */
export function mergeCreditActionPrices(
  current: CreditPriceOverrides,
  patch: CreditActionPricesPatch,
): CreditPriceOverrides {
  const merged: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete merged[field];
      continue;
    }
    if (typeof value === "object") {
      const tiers = mergeModelTierPrices(
        (merged[field] as Partial<Record<string, number>>) ?? {},
        value as Record<string, number | null | undefined>,
      );
      // En tom grupp lagras inte — då är hela overriden borttagen och
      // `getCreditCost` ska tillbaka till sin konstant.
      if (Object.keys(tiers).length === 0) delete merged[field];
      else merged[field] = tiers;
      continue;
    }
    merged[field] = value;
  }
  return merged as CreditPriceOverrides;
}

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

/**
 * Skapar singletonraden om den saknas. Måste ge SAMMA rad som
 * `add-pricing-settings.sql`, alltså domänfälten satta och `credit_action_prices`
 * tomt — koden äger creditpriserna tills en admin uttryckligen sätter något.
 */
async function ensureSettings() {
  await db
    .insert(pricingSettings)
    .values({
      id: PRICING_SETTINGS_ID,
      domain_markup_basis_points: DEFAULT_DOMAIN_MARKUP_BASIS_POINTS,
      domain_usd_to_sek_ore: DEFAULT_DOMAIN_USD_TO_SEK_ORE,
      credit_action_prices: {},
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
  /** Multiplikator, t.ex. 2 för X2. Utelämnad lämnar påslaget orört. */
  domainMarkup?: number;
  /** Kronor per USD, t.ex. 11. Utelämnad lämnar kursen orörd. */
  domainUsdToSek?: number;
  /** Patch enligt {@link creditActionPricesPatchSchema}. */
  creditActionPrices?: unknown;
  updatedBy: string;
};

/**
 * Uppdaterar prisbilden. Allt är en PATCH, aldrig en ersättning.
 *
 * `credit_action_prices`:
 *   - fält som **saknas** i patchen lämnas orört
 *   - fält satt till ett **tal** sätter eller uppdaterar overriden
 *   - fält satt till **null** tar bort overriden, varpå `getCreditCost`
 *     återgår till sin konstant
 *
 * Samma tre regler gäller per modelltier inuti `promptCreate`/`promptRefine`;
 * hela gruppen satt till `null` tar bort alla dess overrides. Ett admin-UI som
 * bara skickar det fält användaren rörde kan därför inte råka nollställa
 * resten — vilket är precis vad en ersättande `.set()` gjorde.
 *
 * Läsning, sammanslagning och skrivning sker i EN transaktion med
 * `SELECT … FOR UPDATE` på singleton-raden, så två samtidiga patchar
 * serialiseras i stället för att skriva över varandras fält.
 *
 * Valideringen är strikt: okända nycklar och ogiltiga tal ger `RangeError`.
 */
export async function updatePricingSettings(
  input: UpdatePricingSettingsInput,
): Promise<PricingSettings> {
  assertDbConfigured();

  let domainMarkupBasisPoints: number | undefined;
  if (input.domainMarkup !== undefined) {
    domainMarkupBasisPoints = Math.round(input.domainMarkup * 10_000);
    if (
      !Number.isFinite(domainMarkupBasisPoints) ||
      domainMarkupBasisPoints < DOMAIN_MARKUP_BASIS_POINTS_MIN ||
      domainMarkupBasisPoints > DOMAIN_MARKUP_BASIS_POINTS_MAX
    ) {
      throw new RangeError("Domänpåslaget måste vara mellan X1,0 och X10,0.");
    }
  }

  let domainUsdToSekOre: number | undefined;
  if (input.domainUsdToSek !== undefined) {
    domainUsdToSekOre = Math.round(input.domainUsdToSek * 100);
    if (
      !Number.isFinite(domainUsdToSekOre) ||
      domainUsdToSekOre < DOMAIN_USD_TO_SEK_ORE_MIN ||
      domainUsdToSekOre > DOMAIN_USD_TO_SEK_ORE_MAX
    ) {
      throw new RangeError("USD/SEK för domäner måste vara mellan 1 och 100.");
    }
  }

  // Här är strikt validering rätt: en admin som skickar ett ogiltigt pris ska
  // få veta det, till skillnad från resolvern som måste tåla en trasig rad.
  let creditPatch: CreditActionPricesPatch | undefined;
  if (input.creditActionPrices !== undefined) {
    const parsed = creditActionPricesPatchSchema.safeParse(input.creditActionPrices);
    if (!parsed.success) {
      throw new RangeError(
        `Creditpriserna måste vara heltal mellan 0 och ${CREDIT_PRICE_MAX} per åtgärd, ` +
          `eller null för att ta bort en override.`,
      );
    }
    creditPatch = parsed.data;
  }

  await ensureSettings();

  return db.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(pricingSettings)
      .where(eq(pricingSettings.id, PRICING_SETTINGS_ID))
      .for("update");
    const locked = lockedRows[0];
    if (!locked) throw new Error("Pricing settings missing");

    const rows = await tx
      .update(pricingSettings)
      .set({
        ...(domainMarkupBasisPoints === undefined
          ? {}
          : { domain_markup_basis_points: domainMarkupBasisPoints }),
        ...(domainUsdToSekOre === undefined
          ? {}
          : { domain_usd_to_sek_ore: domainUsdToSekOre }),
        ...(creditPatch === undefined
          ? {}
          : {
              credit_action_prices: mergeCreditActionPrices(
                parseCreditActionPrices(locked.credit_action_prices),
                creditPatch,
              ),
            }),
        updated_by: input.updatedBy,
        updated_at: new Date(),
      })
      .where(eq(pricingSettings.id, PRICING_SETTINGS_ID))
      .returning();
    if (!rows[0]) throw new Error("Pricing settings could not be updated");
    return mapPricingSettings(rows[0]);
  });
}
