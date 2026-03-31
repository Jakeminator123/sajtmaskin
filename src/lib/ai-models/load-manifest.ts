import { z } from "zod";
import rawManifest from "../../../config/ai_models/manifest.json";

const docLinkSchema = z.object({
  vendor: z.string(),
  title: z.string(),
  url: z.string().url(),
  /** What this doc describes: direct OpenAI/Anthropic APIs vs gateway proxy vs SDK. */
  appliesTo: z
    .enum(["direct_provider_api", "vercel_ai_gateway", "sdk_or_tooling"])
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

const buildProfileIdSchema = z.enum(["fast", "pro", "max", "codex", "anthropic"]);

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
    v0Models: z.array(z.string()),
  }),
  notes: z.string().optional(),
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
  /** Short note: primary vendor docs here target direct API calls, not AI Gateway. */
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

export function getPromptAssistDefaultsFromManifest(): { assist: string; polish: string } {
  return { ...getAiModelsManifest().promptAssist.defaults };
}

export function getPromptAssistAllowedFromManifest(): {
  gatewayClassModels: readonly string[];
  anthropicDirectModels: readonly string[];
  v0Models: readonly string[];
} {
  const a = getAiModelsManifest().promptAssist.allowed;
  return {
    gatewayClassModels: a.gatewayClassModels,
    anthropicDirectModels: a.anthropicDirectModels,
    v0Models: a.v0Models,
  };
}

/** Metadata for generated-site preview env placeholders (see config/ai_models/). */
export function getGeneratedSiteIntegrationPlaceholdersMeta():
  | z.infer<typeof generatedSiteIntegrationPlaceholdersSchema>
  | undefined {
  return getAiModelsManifest().generatedSiteIntegrationPlaceholders;
}
