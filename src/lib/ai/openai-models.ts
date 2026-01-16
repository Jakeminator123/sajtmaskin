/**
 * Central OpenAI model configuration used across the app.
 *
 * Keep all model IDs in one place so we can upgrade safely without chasing
 * hard-coded strings across routes and agents.
 */

export const OPENAI_MODELS = {
  // Cheap + fast for routing/enhancement/tool-orchestration
  router: "gpt-4.1-mini",
  enhancer: "gpt-4.1-mini",
  webSearch: "gpt-4.1-mini",

  // Higher quality for "analyze/audit" style outputs
  audit: {
    primary: "gpt-4.1",
    fallbacks: ["gpt-4o", "gpt-4.1-mini", "gpt-4o-mini"] as const,
  },

  // Creative brief expansion for new sites (premium can use a stronger model)
  creativeBrief: {
    fast: "gpt-4.1-mini",
    best: "gpt-4.1",
  },
} as const;

/**
 * USD pricing per 1M tokens for selected models.
 * Used only for "display/logging" estimates, not billing logic.
 *
 * Source: OpenAI pricing docs (platform.openai.com / openai.com model pages).
 */
export const OPENAI_PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  // GPT-4.1 family (official docs)
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },

  // GPT-4o family (official docs)
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

