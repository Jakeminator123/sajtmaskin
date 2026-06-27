import { z } from "zod";
import rawManifest from "../../../config/ai_models/manifest.json";

const docLinkSchema = z.object({
  vendor: z.string(),
  title: z.string(),
  url: z.string().url(),
  /** What this doc describes: direct OpenAI/Anthropic APIs vs gateway proxy vs SDK. */
  appliesTo: z
    .enum(["direct_provider_api", "sdk_or_tooling"])
    .optional(),
});

const tokenBudgetSchema = z.object({
  envKey: z.string(),
  default: z.number(),
  min: z.number(),
  max: z.number(),
});

const intTimeoutSchema = z.object({
  envKey: z.string(),
  default: z.number(),
  min: z.number(),
  max: z.number(),
});

const numericEnvSettingSchema = z.object({
  envKey: z.string(),
  default: z.number(),
  min: z.number(),
  max: z.number(),
});

const _buildProfileIdSchema = z.enum(["fast", "pro", "max", "codex", "anthropic"]);
const _generationPhaseSchema = z.enum([
  "planner",
  "generator",
  "fixer",
  "verifier",
  "deploy-assistant",
]);
const reasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);

const buildProfilesSchema = z.object({
  defaults: z.object({
    fast: z.string(),
    pro: z.string(),
    max: z.string(),
    codex: z.string(),
    anthropic: z.string(),
  }),
  envKeys: z.object({
    fast: z.string(),
    pro: z.string(),
    max: z.string(),
    codex: z.string(),
    anthropic: z.string(),
  }),
});

const _qualityLevelSchema = z.enum(["light", "standard", "pro", "premium", "max"]);

const promptAssistSchema = z.object({
  defaults: z.object({
    assist: z.string(),
    polish: z.string(),
  }),
  envKeys: z.object({
    assist: z.string(),
    polish: z.string(),
  }),
  allowed: z.object({
    gatewayClassModels: z.array(z.string()),
    anthropicDirectModels: z.array(z.string()),
    // Unified view (union of gatewayClassModels + anthropicDirectModels).
    // Preferred accessor for new callers — see getPromptAssistAllowedFromManifest().
    models: z.array(z.string()).optional(),
  }),
  notes: z.string().optional(),
});

const briefingSchema = z.object({
  defaults: z.object({
    requestModel: z.string(),
    serverAutoOpenAI: z.string(),
    serverAutoAnthropic: z.string(),
  }),
  envKeys: z.object({
    requestModel: z.string(),
    serverAutoOpenAI: z.string(),
    serverAutoAnthropic: z.string(),
  }),
  notes: z.string().optional(),
});

const phaseRoutingTierSchema = z.object({
  planner: z.string(),
  generator: z.string(),
  fixer: z.string(),
  verifier: z.string(),
  "deploy-assistant": z.string(),
});

const phaseThinkingSchema = z.object({
  thinking: z.boolean(),
  reasoningEffort: reasoningEffortSchema,
});

const phaseThinkingTierSchema = z.object({
  planner: phaseThinkingSchema,
  generator: phaseThinkingSchema,
  fixer: phaseThinkingSchema,
  verifier: phaseThinkingSchema,
  "deploy-assistant": phaseThinkingSchema,
});

const phaseRoutingSchema = z.object({
  defaultByTier: z.object({
    fast: phaseRoutingTierSchema,
    pro: phaseRoutingTierSchema,
    max: phaseRoutingTierSchema,
    codex: phaseRoutingTierSchema,
    anthropic: phaseRoutingTierSchema,
  }),
  thinkingByTier: z
    .object({
      fast: phaseThinkingTierSchema,
      pro: phaseThinkingTierSchema,
      max: phaseThinkingTierSchema,
      codex: phaseThinkingTierSchema,
      anthropic: phaseThinkingTierSchema,
    })
    .optional(),
  notes: z.string().optional(),
});

const repairPoliciesSchema = z.object({
  deterministicAutofixPasses: z.number().int().positive(),
  syntaxFixPasses: z.number().int().positive(),
  manualRepairRouteLlmPasses: z.number().int().positive(),
  serverRepairPasses: z.number().int().positive(),
  repairAcceptTimeoutMinutes: z.number().int().min(1).max(120),
  partialFileRepairMaxAttempts: z.number().int().min(1).max(3),
});

const qualityGateCheckSchema = z.enum(["typecheck", "build", "lint"]);

const qualityGateTiersSchema = z.object({
  designPreview: z.array(qualityGateCheckSchema).min(1),
  integrationsBuild: z.array(qualityGateCheckSchema).min(1),
});

const promptOrchestrationSchema = z.object({
  hardCaps: z.object({
    maxChatMessageChars: numericEnvSettingSchema,
    warnChatMessageChars: numericEnvSettingSchema,
    maxChatSystemChars: numericEnvSettingSchema,
    warnChatSystemChars: numericEnvSettingSchema,
    maxPromptHandoffChars: numericEnvSettingSchema,
    maxAiBriefPromptChars: numericEnvSettingSchema,
    maxAiChatMessageChars: numericEnvSettingSchema,
  }),
  softTargets: z.object({
    freeformChars: numericEnvSettingSchema,
    wizardChars: numericEnvSettingSchema,
    auditChars: numericEnvSettingSchema,
    templateChars: numericEnvSettingSchema,
    followupChars: numericEnvSettingSchema,
    technicalChars: numericEnvSettingSchema,
    appChars: numericEnvSettingSchema,
  }),
  phaseThresholds: z.object({
    defaultChars: numericEnvSettingSchema,
    auditChars: numericEnvSettingSchema,
  }),
});

const postGenerationPassesSchema = z.object({
  verifierMaxOutputTokens: tokenBudgetSchema,
  verifierTimeoutMs: intTimeoutSchema,
  verifierSnippetCharsPerFile: numericEnvSettingSchema,
});

const contractProviderRuleSchema = z.object({
  kind: z.enum(["database", "auth", "payment", "integration"]),
  provider: z.string(),
  name: z.string(),
  envVars: z.array(z.string()),
  matchPatterns: z.array(z.string()),
  status: z.enum(["chosen", "optional"]).optional(),
  reason: z.string(),
});

const preGenerationContractsConfigSchema = z.object({
  defaults: z.object({
    fallbackDatabaseProvider: z.string(),
    fallbackAuthProvider: z.string(),
    fallbackPaymentProvider: z.string(),
  }),
  providerRules: z.array(contractProviderRuleSchema),
});

const workloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  invocation: z.string(),
  provider: z.string(),
  codeEntry: z.array(z.string()),
  authEnv: z.array(z.string()),
  defaultModel: z.string().optional(),
  fallbackModels: z.array(z.string()).optional(),
  envOverrides: z.record(z.string(), z.string()).optional(),
  tokenBudget: tokenBudgetSchema.optional(),
  notes: z.string().optional(),
  anthropicModelIdNormalization: z.string().optional(),
  docLinks: z.array(docLinkSchema).optional(),
});

const embeddingEntrySchema = z.object({
  model: z.string(),
  dimensions: z.number().optional(),
  codeEntry: z.array(z.string()).optional(),
});

/**
 * Backoffice 2.0 fas 6 — matching strategy switch.
 *
 * `keyword`   = deterministic regex/keyword matching (today's default for
 *               intent + capability + domain inference).
 * `embedding` = precomputed embedding + cosine similarity (today's default
 *               for scaffold + variant selection).
 * `small-llm` = manifest-gated small-LLM classifier (workloads.match_classifier)
 *               with fail-safe fallback to the deterministic result.
 */
const matchStrategyEnum = z.enum(["keyword", "embedding", "small-llm"]);
export type MatchStrategy = z.infer<typeof matchStrategyEnum>;

/** Matching points that can be routed via {@link getMatchStrategy}. */
export const MATCH_POINTS = [
  "followUpIntent",
  "capabilityDetection",
  "scaffoldSelection",
  "variantSelection",
  "domainInference",
] as const;
export type MatchPoint = (typeof MATCH_POINTS)[number];

const matchingSchema = z.object({
  followUpIntent: matchStrategyEnum.optional(),
  capabilityDetection: matchStrategyEnum.optional(),
  scaffoldSelection: matchStrategyEnum.optional(),
  variantSelection: matchStrategyEnum.optional(),
  domainInference: matchStrategyEnum.optional(),
  notes: z.string().optional(),
});

const generatedSiteIntegrationPlaceholdersSchema = z.object({
  harmlessEnvFragmentFile: z.string(),
  tier3StubEnvFragmentFile: z.string(),
  policyDocRelativeToConfig: z.string().optional(),
  preGenerationContractsEntry: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Per-tier policy overrides.
 *
 * VALIDATE-ONLY: these are present in config/ai_models/manifest.json and shown
 * read-only in backoffice, but nothing in the generation pipeline consumes them
 * yet. Global routeTimeouts / repairPolicies / briefing defaults are what apply
 * at runtime. See config/control-plane/policy-registry.json
 * (manifest-per-tier-* entries, runtimeStatus "declared-only"). Do NOT wire the
 * getters below into the pipeline without flipping those registry entries.
 */
function tierKeyedSchema<T extends z.ZodTypeAny>(inner: T) {
  return z.object({
    fast: inner,
    pro: inner,
    max: inner,
    codex: inner,
    anthropic: inner,
  });
}

const perTierTimeoutSchema = z.object({
  engineRouteMaxDurationSeconds: z.number(),
  verifierTimeoutMs: z.number(),
});

const perTierRepairPolicySchema = z.object({
  deterministicAutofixPasses: z.number(),
  syntaxFixPasses: z.number(),
  serverRepairPasses: z.number(),
});

const perTierBriefingEntrySchema = z.object({
  briefingModel: z.string(),
});

const perTierTimeoutsSchema = tierKeyedSchema(perTierTimeoutSchema);
const perTierRepairPoliciesSchema = tierKeyedSchema(perTierRepairPolicySchema);
const perTierBriefingSchema = tierKeyedSchema(perTierBriefingEntrySchema);

export const aiModelsManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  title: z.string().optional(),
  description: z.string().optional(),
  /** Short note: primary vendor docs here target direct provider API calls. */
  documentationDirectApiNote: z.string().optional(),
  docLinks: z.array(docLinkSchema).optional(),
  buildProfiles: buildProfilesSchema,
  qualityToOwnEngineModel: z
    .object({
      light: z.string(),
      standard: z.string(),
      pro: z.string(),
      premium: z.string(),
      max: z.string(),
    })
    .optional(),
  promptAssist: promptAssistSchema,
  briefing: briefingSchema,
  phaseRouting: phaseRoutingSchema,
  repairPolicies: repairPoliciesSchema,
  qualityGateTiers: qualityGateTiersSchema,
  // VALIDATE-ONLY per-tier policy overrides (declared-only, not wired to runtime).
  perTierTimeouts: perTierTimeoutsSchema.optional(),
  perTierRepairPolicies: perTierRepairPoliciesSchema.optional(),
  perTierBriefing: perTierBriefingSchema.optional(),
  promptOrchestration: promptOrchestrationSchema,
  postGenerationPasses: postGenerationPassesSchema,
  preGenerationContracts: preGenerationContractsConfigSchema,
  tokenBudgets: z.object({
    engineMaxOutputTokens: tokenBudgetSchema,
    autofixMaxOutputTokens: tokenBudgetSchema,
    assistMaxOutputTokens: tokenBudgetSchema,
  }),
  routeTimeouts: z.object({
    engineRouteMaxDurationSeconds: intTimeoutSchema,
    assistRouteMaxDurationSeconds: intTimeoutSchema,
    streamSafetyTimeoutMs: intTimeoutSchema,
  }),
  embeddingModels: z.record(z.string(), embeddingEntrySchema).optional(),
  // Backoffice 2.0 fas 6 — optional per matching-point strategy switch.
  // Omitting it (or any point) keeps the current-default method, so the
  // switch is a no-op until a point is explicitly set to a new strategy.
  matching: matchingSchema.optional(),
  generatedSiteIntegrationPlaceholders:
    generatedSiteIntegrationPlaceholdersSchema.optional(),
  workloads: z.array(workloadSchema),
});

export type AiModelsManifest = z.infer<typeof aiModelsManifestSchema>;
export type BuildProfileId = z.infer<typeof _buildProfileIdSchema>;
export type QualityLevelFromManifest = z.infer<typeof _qualityLevelSchema>;
export type GenerationPhaseFromManifest = z.infer<typeof _generationPhaseSchema>;
export type ReasoningEffortFromManifest = z.infer<typeof reasoningEffortSchema>;
export type PhaseRoutingTierFromManifest = z.infer<typeof phaseRoutingTierSchema>;
export type PhaseThinkingConfigFromManifest = z.infer<typeof phaseThinkingSchema>;
export type PhaseThinkingTierFromManifest = z.infer<typeof phaseThinkingTierSchema>;
export type RepairPoliciesFromManifest = z.infer<typeof repairPoliciesSchema>;
export type QualityGateTiersFromManifest = z.infer<typeof qualityGateTiersSchema>;
export type PromptOrchestrationFromManifest = z.infer<typeof promptOrchestrationSchema>;
export type PostGenerationPassesFromManifest = z.infer<typeof postGenerationPassesSchema>;
export type ContractProviderRuleFromManifest = z.infer<typeof contractProviderRuleSchema>;
export type PreGenerationContractsConfigFromManifest = z.infer<
  typeof preGenerationContractsConfigSchema
>;
export type PerTierTimeoutsFromManifest = z.infer<typeof perTierTimeoutsSchema>;
export type PerTierRepairPoliciesFromManifest = z.infer<typeof perTierRepairPoliciesSchema>;
export type PerTierBriefingFromManifest = z.infer<typeof perTierBriefingSchema>;

function parseManifest(): AiModelsManifest {
  const parsed = aiModelsManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    const detail = parsed.error.flatten();
    throw new Error(`[sajtmaskin] Invalid config/ai_models/manifest.json: ${JSON.stringify(detail)}`);
  }
  return parsed.data;
}

let cached: AiModelsManifest | null = null;

const DEFAULT_PHASE_THINKING_BY_TIER: Record<
  BuildProfileId,
  PhaseThinkingTierFromManifest
> = {
  fast: {
    planner: { thinking: true, reasoningEffort: "medium" },
    generator: { thinking: true, reasoningEffort: "medium" },
    fixer: { thinking: false, reasoningEffort: "medium" },
    verifier: { thinking: false, reasoningEffort: "medium" },
    "deploy-assistant": { thinking: false, reasoningEffort: "medium" },
  },
  pro: {
    planner: { thinking: true, reasoningEffort: "medium" },
    generator: { thinking: true, reasoningEffort: "medium" },
    fixer: { thinking: false, reasoningEffort: "medium" },
    verifier: { thinking: false, reasoningEffort: "medium" },
    "deploy-assistant": { thinking: false, reasoningEffort: "medium" },
  },
  max: {
    planner: { thinking: true, reasoningEffort: "high" },
    generator: { thinking: true, reasoningEffort: "high" },
    fixer: { thinking: false, reasoningEffort: "medium" },
    verifier: { thinking: false, reasoningEffort: "medium" },
    "deploy-assistant": { thinking: false, reasoningEffort: "medium" },
  },
  codex: {
    planner: { thinking: true, reasoningEffort: "high" },
    generator: { thinking: true, reasoningEffort: "high" },
    fixer: { thinking: false, reasoningEffort: "medium" },
    verifier: { thinking: false, reasoningEffort: "medium" },
    "deploy-assistant": { thinking: false, reasoningEffort: "medium" },
  },
  anthropic: {
    planner: { thinking: true, reasoningEffort: "high" },
    generator: { thinking: true, reasoningEffort: "high" },
    fixer: { thinking: false, reasoningEffort: "medium" },
    verifier: { thinking: false, reasoningEffort: "medium" },
    "deploy-assistant": { thinking: false, reasoningEffort: "medium" },
  },
};

/** Validated manifest (throws at first access if JSON is invalid). */
export function getAiModelsManifest(): AiModelsManifest {
  if (!cached) cached = parseManifest();
  return cached;
}

export function getBuildProfileDefaultOwnEngineModel(profile: BuildProfileId): string {
  return getAiModelsManifest().buildProfiles.defaults[profile];
}

export function getDefaultMaxTierOwnEngineModel(): string {
  return getBuildProfileDefaultOwnEngineModel("max");
}

export function getQualityToOwnEngineModels(): Record<QualityLevelFromManifest, string> {
  const m = getAiModelsManifest();
  const q = m.qualityToOwnEngineModel;
  if (!q) {
    throw new Error("[sajtmaskin] manifest.json missing qualityToOwnEngineModel");
  }
  return q;
}

export function getPromptAssistAllowedFromManifest(): {
  gatewayClassModels: readonly string[];
  anthropicDirectModels: readonly string[];
  /**
   * Unified allow-list (gateway-class + anthropic-direct) with provider implicit in the id prefix.
   * Falls back to the concatenation of the two legacy arrays when the manifest omits `models`,
   * so consumers can safely rely on this field regardless of manifest revision.
   */
  models: readonly string[];
} {
  const a = getAiModelsManifest().promptAssist.allowed;
  const models = a.models ?? [...a.gatewayClassModels, ...a.anthropicDirectModels];
  return {
    gatewayClassModels: a.gatewayClassModels,
    anthropicDirectModels: a.anthropicDirectModels,
    models,
  };
}

export function getBriefingDefaultsFromManifest(): z.infer<typeof briefingSchema>["defaults"] {
  const briefing = getAiModelsManifest().briefing;
  if (!briefing) {
    throw new Error("[sajtmaskin] manifest.json missing briefing defaults");
  }
  return briefing.defaults;
}

export function getBriefingEnvKeysFromManifest(): z.infer<typeof briefingSchema>["envKeys"] {
  const briefing = getAiModelsManifest().briefing;
  if (!briefing) {
    throw new Error("[sajtmaskin] manifest.json missing briefing envKeys");
  }
  return briefing.envKeys;
}

export function getPhaseRoutingFromManifest(): Record<
  BuildProfileId,
  PhaseRoutingTierFromManifest
> {
  const phaseRouting = getAiModelsManifest().phaseRouting;
  if (!phaseRouting) {
    throw new Error("[sajtmaskin] manifest.json missing phaseRouting");
  }
  return phaseRouting.defaultByTier;
}

export function getPhaseThinkingFromManifest(): Record<
  BuildProfileId,
  PhaseThinkingTierFromManifest
> {
  const phaseRouting = getAiModelsManifest().phaseRouting;
  if (!phaseRouting) {
    throw new Error("[sajtmaskin] manifest.json missing phaseRouting");
  }
  return phaseRouting.thinkingByTier ?? DEFAULT_PHASE_THINKING_BY_TIER;
}

export function getRepairPoliciesFromManifest(): RepairPoliciesFromManifest {
  const repairPolicies = getAiModelsManifest().repairPolicies;
  return repairPolicies;
}

export function getQualityGateTiersFromManifest(): QualityGateTiersFromManifest {
  return getAiModelsManifest().qualityGateTiers;
}

export function getPromptOrchestrationFromManifest(): PromptOrchestrationFromManifest {
  return getAiModelsManifest().promptOrchestration;
}

export function getPostGenerationPassesFromManifest(): PostGenerationPassesFromManifest {
  return getAiModelsManifest().postGenerationPasses;
}

export function getPreGenerationContractsConfigFromManifest(): PreGenerationContractsConfigFromManifest {
  return getAiModelsManifest().preGenerationContracts;
}

function getWorkloadByIdFromManifest(
  workloadId: string,
): AiModelsManifest["workloads"][number] | undefined {
  return getAiModelsManifest().workloads.find((workload) => workload.id === workloadId);
}

export function getWorkloadDefaultModelFromManifest(
  workloadId: string,
): string | undefined {
  return getWorkloadByIdFromManifest(workloadId)?.defaultModel;
}

export function getWorkloadFallbackModelsFromManifest(
  workloadId: string,
): readonly string[] {
  return getWorkloadByIdFromManifest(workloadId)?.fallbackModels ?? [];
}

/**
 * Default matching strategy per point = the method used today. Keeping these
 * here (and not requiring the manifest to declare them) guarantees that the
 * matchStrategy switch is a strict no-op until a point is explicitly set to a
 * different strategy in `config/ai_models/manifest.json` `matching`.
 */
const MATCH_STRATEGY_DEFAULTS: Record<MatchPoint, MatchStrategy> = {
  followUpIntent: "keyword",
  capabilityDetection: "keyword",
  scaffoldSelection: "embedding",
  variantSelection: "embedding",
  domainInference: "keyword",
};

/**
 * Resolve the configured matching strategy for a point, falling back to the
 * current-default method when the manifest omits it. Returns `keyword` /
 * `embedding` / `small-llm`.
 */
export function getMatchStrategy(point: MatchPoint): MatchStrategy {
  const configured = getAiModelsManifest().matching?.[point];
  return configured ?? MATCH_STRATEGY_DEFAULTS[point];
}

/**
 * VALIDATE-ONLY read-only accessors for the per-tier policy overrides.
 *
 * These intentionally do NOT alter runtime behavior — they only expose the
 * validated (optional) manifest fields so backoffice/tooling can read them.
 * The generation pipeline still uses the global routeTimeouts / repairPolicies /
 * briefing defaults. See the note above `perTierTimeoutsSchema` before wiring
 * any of these into the pipeline.
 */
export function getPerTierTimeoutsFromManifest(): PerTierTimeoutsFromManifest | undefined {
  return getAiModelsManifest().perTierTimeouts;
}

export function getPerTierRepairPoliciesFromManifest(): PerTierRepairPoliciesFromManifest | undefined {
  return getAiModelsManifest().perTierRepairPolicies;
}

export function getPerTierBriefingFromManifest(): PerTierBriefingFromManifest | undefined {
  return getAiModelsManifest().perTierBriefing;
}

/** Metadata for generated-site preview env placeholders (see config/ai_models/). */
export function getGeneratedSiteIntegrationPlaceholdersMeta():
  | z.infer<typeof generatedSiteIntegrationPlaceholdersSchema>
  | undefined {
  return getAiModelsManifest().generatedSiteIntegrationPlaceholders;
}
