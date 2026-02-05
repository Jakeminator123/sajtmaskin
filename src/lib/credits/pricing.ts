export type CreditAction =
  | "prompt.create"
  | "prompt.refine"
  | "prompt.template"
  | "prompt.registry"
  | "prompt.vercelTemplate"
  | "deploy.preview"
  | "deploy.production"
  | "audit.basic"
  | "audit.advanced";

export type ModelTier = "v0-mini" | "v0-pro" | "v0-max";
export type QualityLevel = "light" | "standard" | "pro" | "premium" | "max";

export type PricingContext = {
  modelId?: string | null;
  quality?: QualityLevel | null;
  target?: "preview" | "production" | null;
  thinking?: boolean | null;
  imageGenerations?: boolean | null;
  attachmentsCount?: number | null;
};

const PROMPT_CREATE_COSTS: Record<ModelTier, number> = {
  "v0-mini": 1,
  "v0-pro": 2,
  "v0-max": 3,
};

const PROMPT_REFINE_COSTS: Record<ModelTier, number> = {
  "v0-mini": 1,
  "v0-pro": 1,
  "v0-max": 2,
};

const QUALITY_TO_MODEL: Record<QualityLevel, ModelTier> = {
  light: "v0-mini",
  standard: "v0-pro",
  pro: "v0-pro",
  premium: "v0-max",
  max: "v0-max",
};

const MODEL_LABELS: Record<ModelTier, string> = {
  "v0-mini": "Mini",
  "v0-pro": "Pro",
  "v0-max": "Max",
};

export const AUDIT_COSTS = {
  basic: 3,
  advanced: 5,
} as const;

export const DEPLOY_COSTS = {
  preview: 2,
  production: 3,
} as const;

const PROMPT_CREATE_ACTIONS = new Set<CreditAction>([
  "prompt.create",
  "prompt.template",
  "prompt.registry",
  "prompt.vercelTemplate",
]);

const PROMPT_REFINE_ACTIONS = new Set<CreditAction>(["prompt.refine"]);

function normalizeModelTier(modelId?: string | null): ModelTier | null {
  if (modelId === "v0-mini" || modelId === "v0-pro" || modelId === "v0-max") {
    return modelId;
  }
  return null;
}

export function resolveModelTier(context: PricingContext = {}): ModelTier {
  const normalized = normalizeModelTier(context.modelId);
  if (normalized) return normalized;
  if (context.quality && QUALITY_TO_MODEL[context.quality]) {
    return QUALITY_TO_MODEL[context.quality];
  }
  return "v0-max";
}

export function getCreditCost(action: CreditAction, context: PricingContext = {}): number {
  if (PROMPT_CREATE_ACTIONS.has(action)) {
    return PROMPT_CREATE_COSTS[resolveModelTier(context)];
  }
  if (PROMPT_REFINE_ACTIONS.has(action)) {
    return PROMPT_REFINE_COSTS[resolveModelTier(context)];
  }
  switch (action) {
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
