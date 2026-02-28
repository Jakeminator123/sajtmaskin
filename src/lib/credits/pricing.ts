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
  | "audit.advanced";

import {
  type CanonicalModelId,
  type QualityLevel,
  canonicalizeModelId,
  DEFAULT_MODEL_ID,
  QUALITY_TO_MODEL,
  MODEL_LABELS,
} from "@/lib/v0/models";

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
  "v0-max-fast": 10,
  "v0-1.5-md": 7,
  "v0-1.5-lg": 10,
  "v0-gpt-5": 10,
};

const PROMPT_REFINE_COSTS: Record<ModelTier, number> = {
  "v0-max-fast": 6,
  "v0-1.5-md": 4,
  "v0-1.5-lg": 6,
  "v0-gpt-5": 6,
};

// QUALITY_TO_MODEL, MODEL_LABELS, and legacy alias mapping are
// imported from @/lib/v0/models (single source of truth).

// ─── Feature costs ────────────────────────────────────────────────
export const WIZARD_COST = 11;

export const AUDIT_COSTS = {
  basic: 15,
  advanced: 25,
} as const;

export const DEPLOY_COSTS = {
  preview: 20,
  production: 20,
} as const;

/** Monthly hosting cost per active deployment (credits/month) */
export const HOSTING_MONTHLY_COST = 10;

// ─── Action classification ────────────────────────────────────────
const PROMPT_CREATE_ACTIONS = new Set<CreditAction>([
  "prompt.create",
  "prompt.template",
  "prompt.registry",
  "prompt.vercelTemplate",
]);

const PROMPT_REFINE_ACTIONS = new Set<CreditAction>(["prompt.refine"]);

export function resolveModelTier(context: PricingContext = {}): ModelTier {
  const canonical = canonicalizeModelId(context.modelId);
  if (canonical) return canonical;
  if (context.quality && QUALITY_TO_MODEL[context.quality]) {
    return QUALITY_TO_MODEL[context.quality];
  }
  return DEFAULT_MODEL_ID;
}

export function getCreditCost(action: CreditAction, context: PricingContext = {}): number {
  if (PROMPT_CREATE_ACTIONS.has(action)) {
    return PROMPT_CREATE_COSTS[resolveModelTier(context)];
  }
  if (PROMPT_REFINE_ACTIONS.has(action)) {
    return PROMPT_REFINE_COSTS[resolveModelTier(context)];
  }
  switch (action) {
    case "wizard.enrich":
      return WIZARD_COST;
    case "deploy.preview":
      return DEPLOY_COSTS.preview;
    case "deploy.production":
      return DEPLOY_COSTS.production;
    case "audit.basic":
      return AUDIT_COSTS.basic;
    case "audit.advanced":
      return AUDIT_COSTS.advanced;
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
    default:
      return "denna åtgärd";
  }
}
