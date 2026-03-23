/**
 * Shared generation orchestration — single source of truth for context
 * preparation that the own engine consumes.
 *
 * Resolves scaffold, builds system prompt context, and returns everything
 * needed so that callers never diverge in what signals reach the model.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  applyDeferredContractPlaceholders,
  shouldDeferContractClarificationToSettings,
} from "@/lib/gen/pre-generation-contracts";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { ScaffoldManifest } from "./scaffolds/types";
import type { ScaffoldMatchMeta } from "./scaffolds";
import {
  getScaffoldById,
  matchScaffoldWithEmbeddings,
} from "./scaffolds";
import { classifySiteProfile, type SiteProfile } from "./scaffolds/site-profile";
import {
  serializeScaffoldForPrompt,
  detectScaffoldMode,
  type ScaffoldSerializeMode,
} from "./scaffolds/serialize";
import {
  buildSystemPrompt,
  buildDynamicContext,
  type DesignReferenceAsset,
  type DynamicContextOptions,
} from "./system-prompt";
import {
  inferCapabilities,
  buildCapabilityHints,
  type InferredCapabilities,
} from "./capability-inference";
import { buildRoutePlan } from "./route-plan";
import type { RoutePlan } from "./route-plan";
import {
  type ConfirmedContractAnswer,
  inferPreGenerationContracts,
  type PreGenerationContractContext,
} from "./pre-generation-contracts";

export interface OrchestrationInput {
  prompt: string;
  buildIntent: BuildIntent;
  scaffoldMode?: "auto" | "manual" | "off";
  scaffoldId?: string | null;
  brief?: Record<string, unknown> | null;
  themeColors?: ThemeColors | null;
  imageGenerations?: boolean;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  /** Optional persisted scaffold id from a previous turn in the same chat */
  persistedScaffoldId?: string | null;
  /** Previously confirmed contract answers reconstructed from chat history */
  contractAnswers?: ConfirmedContractAnswer[];
  /**
   * When true, the user hit the max sequential clarification rounds — the model must
   * not ask another blocking pre-generation contract question this turn.
   */
  contractClarificationCapReached?: boolean;
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
  /** File paths from the previous version — when set, route plan is derived from existing files instead of re-inferred from prompt. */
  previousFilePaths?: string[];
}

export interface OrchestrationResult {
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldMatchMeta: ScaffoldMatchMeta | null;
  scaffoldSerializeMode: ScaffoldSerializeMode | null;
  scaffoldContext: string | undefined;
  siteProfile: SiteProfile;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  capabilities: InferredCapabilities;
  /** Full system prompt (STATIC_CORE + dynamic) for own engine */
  engineSystemPrompt: string;
  /** Dynamic-only context (scaffold + brief enrichment, without static core) */
  v0EnrichmentContext: string;
}

/**
 * Prepare all generation context in one place.
 *
 * The own engine path calls this so that scaffold, brief, theme,
 * and intent flow through a single preparation point.
 */
export async function prepareGenerationContext(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const {
    prompt,
    buildIntent,
    scaffoldMode = "auto",
    scaffoldId = null,
    brief = null,
    themeColors = null,
    imageGenerations = false,
    componentPalette = null,
    designThemePreset = null,
    designReferences = [],
    persistedScaffoldId = null,
    contractAnswers = [],
    contractClarificationCapReached = false,
    customInstructions,
    previousFilePaths,
  } = input;

  let resolvedScaffold: ScaffoldManifest | null = null;
  let scaffoldMatchMeta: ScaffoldMatchMeta | null = null;

  if (scaffoldMode === "off") {
    resolvedScaffold = null;
    scaffoldMatchMeta = { matchSource: "off", embeddingScore: null, embeddingRunnerUpId: null };
  } else if (scaffoldMode === "manual" && scaffoldId) {
    resolvedScaffold = getScaffoldById(scaffoldId);
    scaffoldMatchMeta = { matchSource: "manual", embeddingScore: null, embeddingRunnerUpId: null };
  } else if (persistedScaffoldId) {
    resolvedScaffold = getScaffoldById(persistedScaffoldId);
    if (resolvedScaffold) {
      scaffoldMatchMeta = { matchSource: "persisted", embeddingScore: null, embeddingRunnerUpId: null };
    } else {
      console.warn("[orchestrate] persistedScaffoldId %s not found in registry — falling back to embedding match", persistedScaffoldId);
      const matchResult = await matchScaffoldWithEmbeddings(prompt, buildIntent);
      resolvedScaffold = matchResult.scaffold;
      scaffoldMatchMeta = matchResult.matchMeta;
    }
  } else if (scaffoldMode === "auto") {
    const matchResult = await matchScaffoldWithEmbeddings(prompt, buildIntent);
    resolvedScaffold = matchResult.scaffold;
    scaffoldMatchMeta = matchResult.matchMeta;

    console.info(
      "[orchestrate] Scaffold resolved: %s (source=%s, embeddingScore=%s)",
      resolvedScaffold?.id ?? "none",
      scaffoldMatchMeta.matchSource,
      scaffoldMatchMeta.embeddingScore ?? "n/a",
    );

    if (
      resolvedScaffold &&
      (resolvedScaffold.id === "landing-page" || resolvedScaffold.id === "base-nextjs")
    ) {
      try {
        const { getScaffoldBoost } = await import("./scaffolds/scaffold-scoring");
        const boost = await getScaffoldBoost(resolvedScaffold.id);
        if (boost <= -2) {
          console.info(
            "[orchestrate] Generic scaffold %s has poor telemetry (boost=%d), keeping it but noting for retry",
            resolvedScaffold.id,
            boost,
          );
        }
      } catch {
        /* best-effort telemetry check */
      }
    }
  }

  let scaffoldContext: string | undefined;
  let scaffoldSerializeMode: ScaffoldSerializeMode | null = null;
  if (resolvedScaffold) {
    const briefStyleKeywords = Array.isArray((brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection?.styleKeywords)
      ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords
          ?.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0) ?? [])
      : undefined;
    scaffoldSerializeMode = detectScaffoldMode(prompt, briefStyleKeywords);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, scaffoldSerializeMode);
  }

  const briefPages = Array.isArray((brief as { pages?: unknown } | null)?.pages)
    ? (brief as { pages?: unknown[] }).pages?.length ?? null
    : null;
  const siteProfile = classifySiteProfile(prompt, { briefPageCount: briefPages });

  if (scaffoldMode === "auto") {
    console.info(
      "[orchestrate] Site profile: category=%s, pageBucket=%d, confidence=%s",
      siteProfile.businessCategory,
      siteProfile.pageBucket,
      siteProfile.confidence,
    );
  }

  const capabilities = inferCapabilities(prompt);
  const capabilityHints = buildCapabilityHints(capabilities);
  const routePlan = buildRoutePlan({
    prompt,
    buildIntent,
    brief,
    resolvedScaffold,
    siteProfile,
    existingFilePaths: previousFilePaths,
  });
  const preGenerationContracts = inferPreGenerationContracts({
    prompt,
    buildIntent,
    brief,
    capabilities,
    contractAnswers,
  });

  if (shouldDeferContractClarificationToSettings()) {
    applyDeferredContractPlaceholders(preGenerationContracts);
  }

  const scaffoldAndCapability = [scaffoldContext, capabilityHints]
    .filter(Boolean)
    .join("\n\n");

  const dynamicOpts: DynamicContextOptions = {
    intent: buildIntent,
    brief: brief as DynamicContextOptions["brief"],
    themeOverride: themeColors,
    imageGenerations,
    originalPrompt: prompt,
    scaffoldContext: scaffoldAndCapability || undefined,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    contractClarificationCapReached,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
  };

  const engineSystemPrompt = await buildSystemPrompt({
    ...dynamicOpts,
  });

  const v0EnrichmentContext = await buildDynamicContext(dynamicOpts);

  return {
    resolvedScaffold,
    scaffoldMatchMeta,
    scaffoldSerializeMode,
    scaffoldContext,
    siteProfile,
    routePlan,
    preGenerationContracts,
    capabilities,
    engineSystemPrompt,
    v0EnrichmentContext,
  };
}

/**
 * Enrich a user prompt with scaffold and route context so the model
 * gets clear architectural direction alongside the original request.
 *
 * Appended as a bracketed addendum — the original prompt is preserved.
 */
export function enrichPromptWithContext(
  userPrompt: string,
  result: OrchestrationResult,
): string {
  const parts: string[] = [];

  if (result.resolvedScaffold) {
    parts.push(`Scaffold: ${result.resolvedScaffold.label} (${result.resolvedScaffold.family})`);
  }

  if (result.routePlan.routes.length > 0) {
    const routeList = result.routePlan.routes
      .map((r) => `${r.path} — ${r.name}`)
      .join(", ");
    parts.push(`Routes: ${routeList}`);
  }

  if (result.siteProfile) {
    parts.push(`Business category: ${result.siteProfile.businessCategory}`);
  }

  parts.push("Respond with a complete Next.js App Router project. Use Swedish for all user-facing content.");

  if (parts.length === 0) return userPrompt;

  return `${userPrompt}\n\n[Sajtmaskin: ${parts.join(". ")}.]`;
}
