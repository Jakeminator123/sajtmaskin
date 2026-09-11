export type CreditAction =
  | "prompt.create"
  | "prompt.refine"
  | "prompt.template"
  | "prompt.registry"
  | "prompt.vercelTemplate"
  | "wizard.enrich"
  | "deploy.preview"
  | "deploy.production"
  | "audit.basic"
  | "audit.advanced"
  | "openclaw.tip";

import {
  type CanonicalModelId,
  type QualityLevel,
  canonicalizeModelId,
  DEFAULT_MODEL_ID,
  QUALITY_TO_MODEL,
  MODEL_LABELS,
} from "@/lib/models/catalog";

export type ModelTier = CanonicalModelId;
export type { QualityLevel };

export type PricingContext = {
  modelId?: string | null;
  quality?: QualityLevel | null;
  target?: "preview" | "production" | null;
  thinking?: boolean | null;
  imageGenerations?: boolean | null;
  attachmentsCount?: number | null;
};

// ─── Prompt costs by model tier ───────────────────────────────────
// Base rate: 1 credit ≈ 3 SEK
const PROMPT_CREATE_COSTS: Record<ModelTier, number> = {
  premium: 10,
  pro: 7,
  max: 10,
  codex: 10,
  anthropic: 10,
};

const PROMPT_REFINE_COSTS: Record<ModelTier, number> = {
  premium: 6,
  pro: 4,
  max: 6,
  codex: 6,
  anthropic: 6,
};

/** Fullt upplöst prislista — ett tal per debiterbar åtgärd. */
export type CreditActionPrices = {
  promptCreate: Record<ModelTier, number>;
  promptRefine: Record<ModelTier, number>;
  wizard: number;
  auditBasic: number;
  auditAdvanced: number;
  deployPreview: number;
  deployProduction: number;
  openclawTip: number;
};

/**
 * Delmängd av {@link CreditActionPrices}, formen `pricing_settings` lagrar.
 * Varje utelämnat eller ogiltigt fält faller tillbaka på konstanten nedan, så
 * en halvtrasig DB-rad aldrig kan ge `undefined` credits i en debitering.
 */
export type CreditPriceOverrides = {
  [K in keyof CreditActionPrices]?: CreditActionPrices[K] extends number
    ? number | null
    : Partial<Record<ModelTier, number>> | null;
};

// QUALITY_TO_MODEL, MODEL_LABELS, and legacy alias mapping are
// imported from @/lib/models/catalog (single source of truth).

// ─── Feature costs ────────────────────────────────────────────────
const WIZARD_COST = 11;

export const AUDIT_COSTS = {
  basic: 15,
  advanced: 25,
} as const;

const DEPLOY_COSTS = {
  preview: 20,
  production: 20,
} as const;

const OPENCLAW_TIP_COST = 2;

/**
 * Defaultprislistan. Kanonisk ägare av det faktiskt debiterade priset är
 * `pricing_settings` i databasen — den här tabellen är seed vid en tom databas
 * och fallback när raden saknas eller inte går att läsa.
 */
export const DEFAULT_CREDIT_ACTION_PRICES: CreditActionPrices = {
  promptCreate: PROMPT_CREATE_COSTS,
  promptRefine: PROMPT_REFINE_COSTS,
  wizard: WIZARD_COST,
  auditBasic: AUDIT_COSTS.basic,
  auditAdvanced: AUDIT_COSTS.advanced,
  deployPreview: DEPLOY_COSTS.preview,
  deployProduction: DEPLOY_COSTS.production,
  openclawTip: OPENCLAW_TIP_COST,
};

/** Ett pris är bara användbart om det är ett icke-negativt heltal. */
export function isValidCreditPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function price(value: unknown, fallback: number): number {
  return isValidCreditPrice(value) ? value : fallback;
}

function tierPrice(
  overrides: Partial<Record<ModelTier, number>> | null | undefined,
  tier: ModelTier,
  defaults: Record<ModelTier, number>,
): number {
  return price(overrides?.[tier], defaults[tier]);
}

/**
 * Dokumenterad fallback för publika ytor när GET /api/pricing inte svarar.
 *
 * Speglar kodkonstanterna i {@link DEFAULT_CREDIT_ACTION_PRICES} — inte den
 * live-prislista som `pricing_settings` kan ha satt. Debiteringen går via
 * `getCreditCost` + resolvern; den här tabellen får bara visas om anropet
 * fallerar.
 */
export const CREDIT_COST_BREAKDOWN = {
  generatePremium: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.premium,
  generatePro: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.pro,
  generateMax: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.max,
  refinePremium: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.premium,
  refinePro: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.pro,
  refineMax: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.max,
  wizard: DEFAULT_CREDIT_ACTION_PRICES.wizard,
  auditBasic: DEFAULT_CREDIT_ACTION_PRICES.auditBasic,
  auditAdvanced: DEFAULT_CREDIT_ACTION_PRICES.auditAdvanced,
  deploy: DEFAULT_CREDIT_ACTION_PRICES.deployProduction,
};

export type CreditCostBreakdown = {
  generatePremium: number;
  generatePro: number;
  generateMax: number;
  refinePremium: number;
  refinePro: number;
  refineMax: number;
  wizard: number;
  auditBasic: number;
  auditAdvanced: number;
  deploy: number;
};

const MODEL_TIERS = ["premium", "pro", "max", "codex", "anthropic"] as const satisfies readonly ModelTier[];

/**
 * Fullt upplöst prislista: varje åtgärd/tier är det tal `getCreditCost` skulle
 * debitera med de här overriden. Saknad override ger kodkonstanten.
 */
export function resolveCreditActionPrices(
  overrides?: CreditPriceOverrides | null,
): CreditActionPrices {
  const promptCreate = {} as Record<ModelTier, number>;
  const promptRefine = {} as Record<ModelTier, number>;
  for (const tier of MODEL_TIERS) {
    promptCreate[tier] = getCreditCost("prompt.create", { modelId: tier }, overrides);
    promptRefine[tier] = getCreditCost("prompt.refine", { modelId: tier }, overrides);
  }
  return {
    promptCreate,
    promptRefine,
    wizard: getCreditCost("wizard.enrich", {}, overrides),
    auditBasic: getCreditCost("audit.basic", {}, overrides),
    auditAdvanced: getCreditCost("audit.advanced", {}, overrides),
    deployPreview: getCreditCost("deploy.preview", {}, overrides),
    deployProduction: getCreditCost("deploy.production", {}, overrides),
    openclawTip: getCreditCost("openclaw.tip", {}, overrides),
  };
}

/** Platt tabellform för köpsidan — samma tal som {@link resolveCreditActionPrices}. */
export function toCreditCostBreakdown(prices: CreditActionPrices): CreditCostBreakdown {
  return {
    generatePremium: prices.promptCreate.premium,
    generatePro: prices.promptCreate.pro,
    generateMax: prices.promptCreate.max,
    refinePremium: prices.promptRefine.premium,
    refinePro: prices.promptRefine.pro,
    refineMax: prices.promptRefine.max,
    wizard: prices.wizard,
    auditBasic: prices.auditBasic,
    auditAdvanced: prices.auditAdvanced,
    deploy: prices.deployProduction,
  };
}

// ─── Action classification ────────────────────────────────────────
const PROMPT_CREATE_ACTIONS = new Set<CreditAction>([
  "prompt.create",
  "prompt.template",
  "prompt.registry",
  "prompt.vercelTemplate",
]);

const PROMPT_REFINE_ACTIONS = new Set<CreditAction>(["prompt.refine"]);

function resolveModelTier(context: PricingContext = {}): ModelTier {
  const canonical = canonicalizeModelId(context.modelId);
  if (canonical) return canonical;
  if (context.quality && QUALITY_TO_MODEL[context.quality]) {
    return QUALITY_TO_MODEL[context.quality];
  }
  return DEFAULT_MODEL_ID;
}

/**
 * Priset för en åtgärd i credits.
 *
 * Ren och synkron med flit: `overrides` är redan upplösta inställningar, så
 * varje debiteringsväg kan räkna ut sitt pris utan att först nå databasen.
 * Utelämnad `overrides` ger dagens konstanter.
 */
export function getCreditCost(
  action: CreditAction,
  context: PricingContext = {},
  overrides?: CreditPriceOverrides | null,
): number {
  if (PROMPT_CREATE_ACTIONS.has(action)) {
    return tierPrice(overrides?.promptCreate, resolveModelTier(context), PROMPT_CREATE_COSTS);
  }
  if (PROMPT_REFINE_ACTIONS.has(action)) {
    return tierPrice(overrides?.promptRefine, resolveModelTier(context), PROMPT_REFINE_COSTS);
  }
  switch (action) {
    case "wizard.enrich":
      return price(overrides?.wizard, WIZARD_COST);
    case "deploy.preview":
      return price(overrides?.deployPreview, DEPLOY_COSTS.preview);
    case "deploy.production":
      return price(overrides?.deployProduction, DEPLOY_COSTS.production);
    case "audit.basic":
      return price(overrides?.auditBasic, AUDIT_COSTS.basic);
    case "audit.advanced":
      return price(overrides?.auditAdvanced, AUDIT_COSTS.advanced);
    case "openclaw.tip":
      return price(overrides?.openclawTip, OPENCLAW_TIP_COST);
    default:
      return 0;
  }
}

export function getCreditTransactionType(action: CreditAction): string {
  switch (action) {
    case "prompt.create":
      return "prompt_create";
    case "prompt.refine":
      return "prompt_refine";
    case "prompt.template":
      return "prompt_template";
    case "prompt.registry":
      return "prompt_registry";
    case "prompt.vercelTemplate":
      return "prompt_vercel_template";
    case "wizard.enrich":
      return "wizard_enrich";
    case "deploy.preview":
      return "deploy_preview";
    case "deploy.production":
      return "deploy_production";
    case "audit.basic":
      return "audit_basic";
    case "audit.advanced":
      return "audit_advanced";
    case "openclaw.tip":
      return "openclaw_tip";
    default:
      return "credit_charge";
  }
}

export function getCreditDescription(action: CreditAction, context: PricingContext = {}): string {
  const model = resolveModelTier(context);
  const modelLabel = MODEL_LABELS[model];
  switch (action) {
    case "prompt.create":
      return `Generering (${modelLabel})`;
    case "prompt.refine":
      return `Förfining (${modelLabel})`;
    case "prompt.template":
      return `Template (${modelLabel})`;
    case "prompt.registry":
      return `Registry (${modelLabel})`;
    case "prompt.vercelTemplate":
      return `Vercel-template (${modelLabel})`;
    case "wizard.enrich":
      return "Wizard-analys";
    case "deploy.preview":
      return "Deploy (preview)";
    case "deploy.production":
      return "Deploy (produktion)";
    case "audit.basic":
      return "Audit (basic)";
    case "audit.advanced":
      return "Audit (advanced)";
    case "openclaw.tip":
      return "AI-tip (Sajtagenten)";
    default:
      return "Kreditdrag";
  }
}

export function getActionLabel(action: CreditAction): string {
  switch (action) {
    case "prompt.create":
    case "prompt.template":
    case "prompt.registry":
    case "prompt.vercelTemplate":
      return "en generering";
    case "prompt.refine":
      return "en förfining";
    case "wizard.enrich":
      return "en wizard-analys";
    case "deploy.preview":
      return "en preview-deploy";
    case "deploy.production":
      return "en production-deploy";
    case "audit.basic":
    case "audit.advanced":
      return "en audit";
    case "openclaw.tip":
      return "ett AI-tips";
    default:
      return "denna åtgärd";
  }
}
