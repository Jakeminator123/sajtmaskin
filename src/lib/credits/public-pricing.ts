/**
 * Publik prisbild — bara priser, inget om vem som satte dem eller när.
 *
 * Admin-API:t får skicka `updatedAt`/`updatedBy`. Den här formen är vad
 * inloggade och utloggade besökare får från GET /api/pricing.
 */

import { DEFAULT_DOMAIN_PRICING, type DomainPricingSettings } from "@/lib/domains/pricing";
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
  domain: DomainPricingSettings;
  credits: CreditActionPrices;
};

export const FALLBACK_PUBLIC_PRICING: PublicPricing = {
  domain: DEFAULT_DOMAIN_PRICING,
  credits: DEFAULT_CREDIT_ACTION_PRICES,
};

export function toPublicPricing(input: {
  domain: DomainPricingSettings;
  creditActionPrices: CreditPriceOverrides;
}): PublicPricing {
  return {
    domain: {
      markup: input.domain.markup,
      usdToSek: input.domain.usdToSek,
    },
    credits: resolveCreditActionPrices(input.creditActionPrices),
  };
}

function parseDomain(value: unknown): DomainPricingSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const markup = (value as { markup?: unknown }).markup;
  const usdToSek = (value as { usdToSek?: unknown }).usdToSek;
  if (typeof markup !== "number" || !Number.isFinite(markup) || markup <= 0) return null;
  if (typeof usdToSek !== "number" || !Number.isFinite(usdToSek) || usdToSek <= 0) return null;
  return { markup, usdToSek };
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
 * Tolerant läsning av GET /api/pricing. Okända fält (t.ex. om en äldre klient
 * träffar en nyare payload) ignoreras. Trasig form → null, så anroparen kan
 * falla tillbaka på {@link FALLBACK_PUBLIC_PRICING}.
 */
export function parsePublicPricing(value: unknown): PublicPricing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const domain = parseDomain(record.domain);
  const credits = parseCredits(record.credits);
  if (!domain || !credits) return null;
  return { domain, credits };
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
