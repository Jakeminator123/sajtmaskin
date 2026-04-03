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

const buildProfileIdSchema = z.enum(["fast", "pro", "max", "codex", "anthropic"]);
const generationPhaseSchema = z.enum([
  "planner",
  "generator",
  "fixer",
  "verifier",
  "deploy-assistant",
]);

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

const qualityLevelSchema = z.enum(["light", "standard", "pro", "premium", "max"]);

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
  }),
  notes: z.string().optional(),
});

const briefingSchema = z.object({
  defaults: z.object({
    requestModel: z.string(),
    serverAutoOpenAI: z.string(),
    serverAutoAnthropic: z.string(),
    specModel: z.string(),
  }),
  envKeys: z.object({
    requestModel: z.string(),
    serverAutoOpenAI: z.string(),
    serverAutoAnthropic: z.string(),
    specModel: z.string(),
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

const phaseRoutingSchema = z.object({
  defaultByTier: z.object({
    fast: phaseRoutingTierSchema,
    pro: phaseRoutingTierSchema,
    max: phaseRoutingTierSchema,
    codex: phaseRoutingTierSchema,
    anthropic: phaseRoutingTierSchema,
  }),
  notes: z.string().optional(),
});

const repairPoliciesSchema = z.object({
  deterministicAutofixPasses: z.number().int().positive(),
  syntaxFixPasses: z.number().int().positive(),
  manualRepairRouteLlmPasses: z.number().int().positive(),
  serverRepairPasses: z.number().int().positive(),
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
    maxAiSpecPromptChars: numericEnvSettingSchema,
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
  polishMaxOutputTokens: tokenBudgetSchema,
  polishTimeoutMs: intTimeoutSchema,
  polishMaxFilesWhenUnscoped: numericEnvSettingSchema,
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

const generatedSiteIntegrationPlaceholdersSchema = z.object({
  envFragmentFile: z.string(),
  policyDocRelativeToConfig: z.string().optional(),
  preGenerationContractsEntry: z.string().optional(),
  notes: z.string().optional(),
});

const aiModelsManifestSchema = z.object({
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
  generatedSiteIntegrationPlaceholders:
    generatedSiteIntegrationPlaceholdersSchema.optional(),
  workloads: z.array(workloadSchema),
});

export type AiModelsManifest = z.infer<typeof aiModelsManifestSchema>;
export type BuildProfileId = z.infer<typeof buildProfileIdSchema>;
export type QualityLevelFromManifest = z.infer<typeof qualityLevelSchema>;
export type GenerationPhaseFromManifest = z.infer<typeof generationPhaseSchema>;
export type PhaseRoutingTierFromManifest = z.infer<typeof phaseRoutingTierSchema>;
export type RepairPoliciesFromManifest = z.infer<typeof repairPoliciesSchema>;
export type PromptOrchestrationFromManifest = z.infer<typeof promptOrchestrationSchema>;
export type PostGenerationPassesFromManifest = z.infer<typeof postGenerationPassesSchema>;
export type ContractProviderRuleFromManifest = z.infer<typeof contractProviderRuleSchema>;
export type PreGenerationContractsConfigFromManifest = z.infer<
  typeof preGenerationContractsConfigSchema
>;

function parseManifest(): AiModelsManifest {
  const parsed = aiModelsManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    const detail = parsed.error.flatten();
    throw new Error(`[sajtmaskin] Invalid config/ai_models/manifest.json: ${JSON.stringify(detail)}`);
  }
  return parsed.data;
}

let cached: AiModelsManifest | null = null;

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
} {
  const a = getAiModelsManifest().promptAssist.allowed;
  return {
    gatewayClassModels: a.gatewayClassModels,
    anthropicDirectModels: a.anthropicDirectModels,
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

export function getRepairPoliciesFromManifest(): RepairPoliciesFromManifest {
  const repairPolicies = getAiModelsManifest().repairPolicies;
  return repairPolicies;
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

export function getWorkloadByIdFromManifest(
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

/** Metadata for generated-site preview env placeholders (see config/ai_models/). */
export function getGeneratedSiteIntegrationPlaceholdersMeta():
  | z.infer<typeof generatedSiteIntegrationPlaceholdersSchema>
  | undefined {
  return getAiModelsManifest().generatedSiteIntegrationPlaceholders;
}
