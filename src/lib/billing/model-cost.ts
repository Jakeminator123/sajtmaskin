import priceTable from "../../../config/ai_models/pricing.json";

type TokenRates = {
  input: number | null;
  cachedInput: number | null;
  cacheWriteInput?: number | null;
  output: number | null;
};

type PriceModel = {
  provider: string;
  label: string;
  match: string[];
  estimated?: boolean;
  contextThreshold?: {
    inputTokens: number;
    aboveMultiplier: { input: number; output: number };
  };
  tiers: { standard: TokenRates };
};

const models = priceTable.models as Record<string, PriceModel>;

export const MODEL_PRICE_VERSION = `${priceTable.schemaVersion}:${priceTable.verifiedAt}`;
export const DEFAULT_USD_TO_SEK_ORE = Math.round(priceTable.fx.usdToSek * 100);
export const DEFAULT_MARKUP_BASIS_POINTS = 20_000;
export const DEFAULT_SEK_PER_CREDIT_ORE = 300;

export type BillableTokenUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens?: number | null;
};

export type ModelCost = {
  provider: string;
  model: string;
  priceModel: string;
  label: string;
  estimated: boolean;
  longContext: boolean;
  inputSemantics: "total_includes_cache";
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costUsd: number;
  rates: {
    input: number;
    cachedInput: number;
    cacheWriteInput: number;
    output: number;
  };
};

function normalizedModelId(raw: string): string {
  const value = raw.trim().toLowerCase();
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(slash + 1) : value;
}

export function resolvePriceModel(rawModel: string): { key: string; value: PriceModel } | null {
  const model = normalizedModelId(rawModel);
  const candidates = Object.entries(models)
    .flatMap(([key, value]) =>
      value.match.map((match) => ({ key, value, match: match.toLowerCase() })),
    )
    .sort((a, b) => b.match.length - a.match.length);

  const found = candidates.find(({ match }) => model === match || model.startsWith(`${match}-20`));
  return found ? { key: found.key, value: found.value } : null;
}

function tokens(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

/**
 * Beräknar leverantörskostnaden för ett enda LLM-anrop.
 *
 * `inputTokens` är SDK:ns totalsiffra och inkluderar cache read/write. Därför
 * dras cachekategorierna av innan ordinarie input prissätts. Reasoning-tokens
 * ingår redan i output-totalen och ska inte läggas på en gång till.
 */
export function calculateModelCost(rawModel: string, usage: BillableTokenUsage): ModelCost | null {
  const resolved = resolvePriceModel(rawModel);
  if (!resolved) return null;

  const base = resolved.value.tiers.standard;
  if (base.input === null && base.output === null) return null;

  const cachedInputTokens = tokens(usage.cachedInputTokens);
  const cacheWriteTokens = tokens(usage.cacheWriteTokens);
  const suppliedInputTokens = tokens(usage.inputTokens);
  // `normalizeUsage` turns every supported provider dialect into the AI SDK
  // convention: inputTokens is the total and cache read/write are nested
  // categories. Pricing can therefore use one rule without double counting.
  const inputTotal = Math.max(suppliedInputTokens, cachedInputTokens + cacheWriteTokens);
  const uncachedInputTokens = Math.max(0, inputTotal - cachedInputTokens - cacheWriteTokens);
  const outputTokens = tokens(usage.outputTokens);
  const longContext = Boolean(
    resolved.value.contextThreshold && inputTotal > resolved.value.contextThreshold.inputTokens,
  );
  const inputMultiplier = longContext
    ? (resolved.value.contextThreshold?.aboveMultiplier.input ?? 1)
    : 1;
  const outputMultiplier = longContext
    ? (resolved.value.contextThreshold?.aboveMultiplier.output ?? 1)
    : 1;

  const inputRate = (base.input ?? 0) * inputMultiplier;
  // Saknas särskild cacherate är ordinarie input den säkra (icke-underdebiterande)
  // fallbacken. Prisfilen har explicita värden för modellerna i live-manifestet.
  const cachedInputRate = (base.cachedInput ?? base.input ?? 0) * inputMultiplier;
  const cacheWriteInputRate =
    (base.cacheWriteInput ?? (base.input === null ? 0 : base.input * 1.25)) * inputMultiplier;
  const outputRate = (base.output ?? 0) * outputMultiplier;
  const costUsd =
    (uncachedInputTokens * inputRate +
      cachedInputTokens * cachedInputRate +
      cacheWriteTokens * cacheWriteInputRate +
      outputTokens * outputRate) /
    1_000_000;

  return {
    provider: resolved.value.provider,
    model: normalizedModelId(rawModel),
    priceModel: resolved.key,
    label: resolved.value.label,
    estimated: resolved.value.estimated === true,
    longContext,
    inputSemantics: "total_includes_cache",
    uncachedInputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    costUsd,
    rates: {
      input: inputRate,
      cachedInput: cachedInputRate,
      cacheWriteInput: cacheWriteInputRate,
      output: outputRate,
    },
  };
}

export function costUsdToMicroUsd(costUsd: number): number {
  return Math.max(0, Math.round(costUsd * 1_000_000));
}

export function calculateCustomerCharge(input: {
  providerCostMicroUsd: number;
  usdToSekOre: number;
  markupBasisPoints: number;
  sekPerCreditOre: number;
}): { providerCostOre: number; billableOre: number; credits: number } {
  const providerCostOre = Math.max(
    0,
    Math.round((input.providerCostMicroUsd * input.usdToSekOre) / 1_000_000),
  );
  const billableOre = Math.max(0, Math.round((providerCostOre * input.markupBasisPoints) / 10_000));
  const credits = billableOre > 0 ? Math.ceil(billableOre / Math.max(1, input.sekPerCreditOre)) : 0;
  return { providerCostOre, billableOre, credits };
}
