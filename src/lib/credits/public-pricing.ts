/**
 * Publik prisbild — bara kundpriser, inget om vem som satte dem eller när.
 *
 * Domänpåslag och intern USD/SEK-kurs hör inte hit: de är operatörsmarginal,
 * inte ett pris. Kundpriset på en domän kommer från `/api/domains/check`.
 *
 * Admin-API:t får skicka `updatedAt`/`updatedBy` och domänknoppar. Den här
 * formen är vad inloggade och utloggade besökare får från GET /api/pricing.
 */

import {
  DEFAULT_CREDIT_ACTION_PRICES,
  isValidCreditPrice,
  resolveCreditActionPrices,
  type CreditActionPrices,
  type CreditCostBreakdown,
  type CreditPriceOverrides,
  type ModelTier,
} from "./pricing";

export type PublicPricing = {
  credits: CreditActionPrices;
};

export const FALLBACK_PUBLIC_PRICING: PublicPricing = {
  credits: DEFAULT_CREDIT_ACTION_PRICES,
};

export function toPublicPricing(input: {
  creditActionPrices: CreditPriceOverrides;
}): PublicPricing {
  return {
    credits: resolveCreditActionPrices(input.creditActionPrices),
  };
}

function parseTierPrices(value: unknown): Record<ModelTier, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const premium = record.premium;
  const pro = record.pro;
  const max = record.max;
  const codex = record.codex;
  const anthropic = record.anthropic;
  if (
    !isValidCreditPrice(premium) ||
    !isValidCreditPrice(pro) ||
    !isValidCreditPrice(max) ||
    !isValidCreditPrice(codex) ||
    !isValidCreditPrice(anthropic)
  ) {
    return null;
  }
  return { premium, pro, max, codex, anthropic };
}

function parseCredits(value: unknown): CreditActionPrices | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const promptCreate = parseTierPrices(record.promptCreate);
  const promptRefine = parseTierPrices(record.promptRefine);
  if (!promptCreate || !promptRefine) return null;
  if (
    !isValidCreditPrice(record.wizard) ||
    !isValidCreditPrice(record.auditBasic) ||
    !isValidCreditPrice(record.auditAdvanced) ||
    !isValidCreditPrice(record.deployPreview) ||
    !isValidCreditPrice(record.deployProduction) ||
    !isValidCreditPrice(record.openclawTip)
  ) {
    return null;
  }
  return {
    promptCreate,
    promptRefine,
    wizard: record.wizard,
    auditBasic: record.auditBasic,
    auditAdvanced: record.auditAdvanced,
    deployPreview: record.deployPreview,
    deployProduction: record.deployProduction,
    openclawTip: record.openclawTip,
  };
}

/**
 * Tolerant läsning av GET /api/pricing. Okända fält (t.ex. en äldre payload
 * med `domain`) ignoreras. Trasig form → null, så anroparen kan falla
 * tillbaka på {@link FALLBACK_PUBLIC_PRICING}.
 */
export function parsePublicPricing(value: unknown): PublicPricing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const credits = parseCredits(record.credits);
  if (!credits) return null;
  return { credits };
}

export function publicPricingToBreakdown(pricing: PublicPricing): CreditCostBreakdown {
  return {
    generatePremium: pricing.credits.promptCreate.premium,
    generatePro: pricing.credits.promptCreate.pro,
    generateMax: pricing.credits.promptCreate.max,
    refinePremium: pricing.credits.promptRefine.premium,
    refinePro: pricing.credits.promptRefine.pro,
    refineMax: pricing.credits.promptRefine.max,
    wizard: pricing.credits.wizard,
    auditBasic: pricing.credits.auditBasic,
    auditAdvanced: pricing.credits.auditAdvanced,
    deploy: pricing.credits.deployProduction,
  };
}
