import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_ASSIST_MODELS,
  ASSIST_MODELS,
  isPromptAssistModelAllowed,
} from "@/lib/builder/prompt-assist";
import { ASSIST_MODEL, POLISH_MODEL } from "@/lib/gen/defaults";
import { existsSync } from "node:fs";

import {
  getAiModelsManifest,
  getBriefingDefaultsFromManifest,
  getBuildProfileDefaultOwnEngineModel,
  getMatchStrategy,
  getPostGenerationPassesFromManifest,
  getPreGenerationContractsConfigFromManifest,
  getPromptOrchestrationFromManifest,
  getPhaseRoutingFromManifest,
  getPromptAssistAllowedFromManifest,
  getQualityGateTiersFromManifest,
  getRepairPoliciesFromManifest,
} from "@/lib/ai-models/load-manifest";
import {
  parseGeneratedSitePlaceholderLines,
  readGeneratedSitePlaceholdersEnvText,
  resolveHarmlessPlaceholdersPath,
  resolveTier3StubPlaceholdersPath,
} from "@/lib/ai-models/load-generated-site-placeholders";
import { canonicalModelIdToOwnModelId, DEFAULT_OWN_MODEL_ID, QUALITY_TO_OPENAI_MODEL } from "@/lib/models/catalog";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
} from "@/lib/gen/verify/quality-gate-checks";

describe("config/ai_models/manifest.json parity", () => {
  it("parses and matches prompt-assist allowlists", () => {
    const m = getAiModelsManifest();
    const allowed = getPromptAssistAllowedFromManifest();

    expect([...allowed.gatewayClassModels]).toEqual([...ASSIST_MODELS]);
    expect([...allowed.anthropicDirectModels]).toEqual([...ANTHROPIC_ASSIST_MODELS]);
    expect([...allowed.models]).toEqual([
      ...allowed.gatewayClassModels,
      ...allowed.anthropicDirectModels,
    ]);

    if (!process.env.SAJTMASKIN_ASSIST_MODEL?.trim()) {
      expect(ASSIST_MODEL).toBe(m.promptAssist.defaults.assist);
    }
    if (!process.env.SAJTMASKIN_POLISH_MODEL?.trim()) {
      expect(POLISH_MODEL).toBe(m.promptAssist.defaults.polish);
    }
  });

  it("retains pre-#221 prompt-assist ids for back-compat (MB-1 regression guard)", () => {
    // #221 bumped prompt-assist to gpt-5.5 / claude-opus-4.8 but must APPEND,
    // not replace: a deployment/env/persisted value still set to one of the
    // previous ids must keep passing isPromptAssistModelAllowed() instead of
    // 400-ing /api/ai/chat or /api/ai/brief.
    const allowed = getPromptAssistAllowedFromManifest();
    const backCompatGateway = ["openai/gpt-5.4", "anthropic/claude-opus-4.6"];
    const backCompatDirect = ["anthropic-direct/claude-opus-4-6"];

    for (const id of backCompatGateway) {
      expect(allowed.gatewayClassModels).toContain(id);
      expect(allowed.models).toContain(id);
      expect(isPromptAssistModelAllowed(id)).toBe(true);
    }
    for (const id of backCompatDirect) {
      expect(allowed.anthropicDirectModels).toContain(id);
      expect(allowed.models).toContain(id);
      expect(isPromptAssistModelAllowed(id)).toBe(true);
    }

    // The new #221 ids must remain present alongside the back-compat ones.
    for (const id of [
      "openai/gpt-5.5",
      "anthropic/claude-opus-4.8",
      "anthropic-direct/claude-opus-4-8",
    ]) {
      expect(allowed.models).toContain(id);
      expect(isPromptAssistModelAllowed(id)).toBe(true);
    }

    // Sonnet 4.6 was retired from the allow-list but persisted selections must
    // still pass via aliasRetiredModelId() — never 400 on /api/ai/chat or brief.
    for (const id of [
      "anthropic/claude-sonnet-4.6",
      "anthropic-direct/claude-sonnet-4-6",
    ]) {
      expect(allowed.models).not.toContain(id);
      expect(isPromptAssistModelAllowed(id)).toBe(true);
    }
  });

  it("build profile defaults in manifest match getters", () => {
    const m = getAiModelsManifest();
    expect(getBuildProfileDefaultOwnEngineModel("fast")).toBe(m.buildProfiles.defaults.fast);
    expect(getBuildProfileDefaultOwnEngineModel("pro")).toBe(m.buildProfiles.defaults.pro);
    expect(getBuildProfileDefaultOwnEngineModel("max")).toBe(m.buildProfiles.defaults.max);
    expect(getBuildProfileDefaultOwnEngineModel("codex")).toBe(m.buildProfiles.defaults.codex);
    expect(getBuildProfileDefaultOwnEngineModel("anthropic")).toBe(m.buildProfiles.defaults.anthropic);
    expect(DEFAULT_OWN_MODEL_ID).toBe(m.buildProfiles.defaults.max);
  });

  it("catalog tier resolution matches manifest when SAJTMASKIN_MODEL_* are unset", () => {
    const keys = [
      "SAJTMASKIN_MODEL_FAST",
      "SAJTMASKIN_MODEL_PRO",
      "SAJTMASKIN_MODEL_MAX",
      "SAJTMASKIN_MODEL_CODEX",
      "SAJTMASKIN_MODEL_ANTHROPIC",
    ] as const;
    if (keys.some((k) => process.env[k]?.trim())) return;
    expect(canonicalModelIdToOwnModelId("fast")).toBe(getBuildProfileDefaultOwnEngineModel("fast"));
    expect(canonicalModelIdToOwnModelId("pro")).toBe(getBuildProfileDefaultOwnEngineModel("pro"));
    expect(canonicalModelIdToOwnModelId("max")).toBe(getBuildProfileDefaultOwnEngineModel("max"));
    expect(canonicalModelIdToOwnModelId("codex")).toBe(getBuildProfileDefaultOwnEngineModel("codex"));
    expect(canonicalModelIdToOwnModelId("anthropic")).toBe(
      getBuildProfileDefaultOwnEngineModel("anthropic"),
    );
  });

  it("quality map matches manifest qualityToOwnEngineModel", () => {
    const m = getAiModelsManifest();
    expect(m.qualityToOwnEngineModel).toBeDefined();
    const q = m.qualityToOwnEngineModel!;
    expect(QUALITY_TO_OPENAI_MODEL.light).toBe(q.light);
    expect(QUALITY_TO_OPENAI_MODEL.standard).toBe(q.standard);
    expect(QUALITY_TO_OPENAI_MODEL.pro).toBe(q.pro);
    expect(QUALITY_TO_OPENAI_MODEL.premium).toBe(q.premium);
    expect(QUALITY_TO_OPENAI_MODEL.max).toBe(q.max);
  });

  it("briefing, phase routing, repair policies, orchestration, post-generation config, and contract config exist for runtime control", () => {
    const briefing = getBriefingDefaultsFromManifest();
    const phaseRouting = getPhaseRoutingFromManifest();
    const repairPolicies = getRepairPoliciesFromManifest();
    const qualityGateTiers = getQualityGateTiersFromManifest();
    const promptOrchestration = getPromptOrchestrationFromManifest();
    const postGenerationPasses = getPostGenerationPassesFromManifest();
    const contractConfig = getPreGenerationContractsConfigFromManifest();

    expect(briefing.requestModel).toBeTruthy();
    expect(briefing.serverAutoOpenAI).toBeTruthy();
    expect(briefing.serverAutoAnthropic).toBeTruthy();

    expect(phaseRouting.fast.planner).toBeTruthy();
    expect(phaseRouting.pro.verifier).toBeTruthy();
    expect(phaseRouting.max.fixer).toBeTruthy();

    expect(repairPolicies.deterministicAutofixPasses).toBeGreaterThan(0);
    expect(repairPolicies.syntaxFixPasses).toBeGreaterThan(0);
    expect(repairPolicies.manualRepairRouteLlmPasses).toBeGreaterThan(0);
    expect(repairPolicies.serverRepairPasses).toBeGreaterThan(0);
    expect(repairPolicies.repairAcceptTimeoutMinutes).toBeGreaterThan(0);
    expect(repairPolicies.repairAcceptTimeoutMinutes).toBeLessThanOrEqual(120);
    expect(repairPolicies.partialFileRepairMaxAttempts).toBeGreaterThan(0);
    expect(repairPolicies.partialFileRepairMaxAttempts).toBeLessThanOrEqual(3);

    expect(qualityGateTiers.designPreview.length).toBeGreaterThan(0);
    expect(qualityGateTiers.integrationsBuild.length).toBeGreaterThan(0);
    expect(DESIGN_PREVIEW_QUALITY_GATE_CHECKS).toEqual(qualityGateTiers.designPreview);
    expect(INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS).toEqual(qualityGateTiers.integrationsBuild);

    expect(promptOrchestration.hardCaps.maxChatMessageChars.envKey).toBe(
      "SAJTMASKIN_MAX_PROMPT_LENGTH",
    );
    expect(promptOrchestration.softTargets.freeformChars.default).toBeGreaterThan(0);
    expect(promptOrchestration.phaseThresholds.defaultChars.default).toBeGreaterThan(0);

    expect(postGenerationPasses.verifierMaxOutputTokens.default).toBeGreaterThan(0);
    expect(postGenerationPasses.verifierTimeoutMs.default).toBeGreaterThan(0);

    expect(contractConfig.defaults.fallbackDatabaseProvider).toBeTruthy();
    expect(contractConfig.defaults.fallbackAuthProvider).toBeTruthy();
    expect(contractConfig.defaults.fallbackPaymentProvider).toBeTruthy();
    expect(contractConfig.providerRules.length).toBeGreaterThan(5);
  });

  it("generated-site integration placeholders files exist and parse (harmless + tier-3 stub)", () => {
    const m = getAiModelsManifest();
    expect(m.generatedSiteIntegrationPlaceholders?.harmlessEnvFragmentFile).toBeTruthy();
    expect(m.generatedSiteIntegrationPlaceholders?.tier3StubEnvFragmentFile).toBeTruthy();
    const cwd = process.cwd();
    expect(existsSync(resolveHarmlessPlaceholdersPath(cwd))).toBe(true);
    expect(existsSync(resolveTier3StubPlaceholdersPath(cwd))).toBe(true);
    const raw = readGeneratedSitePlaceholdersEnvText(cwd);
    const pairs = parseGeneratedSitePlaceholderLines(raw);
    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs.some((p) => p.key === "NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
    expect(pairs.some((p) => p.key === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")).toBe(true);
  });

  it("per-tier policy overrides, when present, cover all 5 tiers (validate-only)", () => {
    const m = getAiModelsManifest();
    const tiers = ["fast", "pro", "max", "codex", "anthropic"] as const;

    if (m.perTierTimeouts) {
      for (const tier of tiers) {
        const entry = m.perTierTimeouts[tier];
        expect(entry, `perTierTimeouts missing ${tier}`).toBeDefined();
        expect(typeof entry.engineRouteMaxDurationSeconds).toBe("number");
        expect(typeof entry.verifierTimeoutMs).toBe("number");
      }
    }

    if (m.perTierRepairPolicies) {
      for (const tier of tiers) {
        const entry = m.perTierRepairPolicies[tier];
        expect(entry, `perTierRepairPolicies missing ${tier}`).toBeDefined();
        expect(typeof entry.deterministicAutofixPasses).toBe("number");
        expect(typeof entry.syntaxFixPasses).toBe("number");
        expect(typeof entry.serverRepairPasses).toBe("number");
      }
    }

    if (m.perTierBriefing) {
      for (const tier of tiers) {
        const entry = m.perTierBriefing[tier];
        expect(entry, `perTierBriefing missing ${tier}`).toBeDefined();
        expect(typeof entry.briefingModel).toBe("string");
        expect(entry.briefingModel.length).toBeGreaterThan(0);
      }
    }
  });

  it("documents post-generation verifier workload", () => {
    const m = getAiModelsManifest();
    const verifier = m.workloads.find((w) => w.id === "post_generation_verifier");

    expect(verifier?.invocation).toBe("ai_generateObject");
    expect(verifier?.codeEntry).toContain("src/lib/gen/verify/verifier-pass.ts");
    expect(m.workloads.some((w) => w.id === "post_generation_polish")).toBe(false);
  });

  it("exposes the matchStrategy switch defaulting every point to its current method (B2.0 fas 6)", () => {
    // Every wired matching point defaults to the method used today, so the
    // switch is a no-op until explicitly changed.
    expect(getMatchStrategy("followUpIntent")).toBe("keyword");
    expect(getMatchStrategy("capabilityDetection")).toBe("keyword");
    expect(getMatchStrategy("scaffoldSelection")).toBe("embedding");
    expect(getMatchStrategy("variantSelection")).toBe("embedding");
    expect(getMatchStrategy("domainInference")).toBe("keyword");

    // The small-LLM classifier workload exists and points at a small model.
    const m = getAiModelsManifest();
    const matchClassifier = m.workloads.find((w) => w.id === "match_classifier");
    expect(matchClassifier?.invocation).toBe("ai_generateObject");
    expect(matchClassifier?.defaultModel).toBeTruthy();
  });
});
