import { describe, expect, it } from "vitest";
import { ANTHROPIC_ASSIST_MODELS, GATEWAY_ASSIST_MODELS } from "@/lib/builder/promptAssist";
import { ASSIST_MODEL, POLISH_MODEL } from "@/lib/gen/defaults";
import { existsSync } from "node:fs";

import {
  getAiModelsManifest,
  getBuildProfileDefaultOwnEngineModel,
  getPromptAssistAllowedFromManifest,
} from "@/lib/ai-models/load-manifest";
import {
  parseGeneratedSitePlaceholderLines,
  readGeneratedSitePlaceholdersEnvText,
  resolveGeneratedSitePlaceholdersPath,
} from "@/lib/ai-models/load-generated-site-placeholders";
import { canonicalModelIdToOwnModelId, DEFAULT_OWN_MODEL_ID, QUALITY_TO_OPENAI_MODEL } from "@/lib/models/catalog";

describe("config/ai_models/manifest.json parity", () => {
  it("parses and matches promptAssist allowlists in promptAssist.ts", () => {
    const m = getAiModelsManifest();
    const allowed = getPromptAssistAllowedFromManifest();

    expect([...allowed.gatewayClassModels]).toEqual([...GATEWAY_ASSIST_MODELS]);
    expect([...allowed.anthropicDirectModels]).toEqual([...ANTHROPIC_ASSIST_MODELS]);
    expect(allowed.v0Models).toEqual([]);

    if (!process.env.SAJTMASKIN_ASSIST_MODEL?.trim()) {
      expect(ASSIST_MODEL).toBe(m.promptAssist.defaults.assist);
    }
    if (!process.env.SAJTMASKIN_POLISH_MODEL?.trim()) {
      expect(POLISH_MODEL).toBe(m.promptAssist.defaults.polish);
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

  it("generated-site integration placeholders file exists and parses", () => {
    const m = getAiModelsManifest();
    expect(m.generatedSiteIntegrationPlaceholders?.envFragmentFile).toBeTruthy();
    const cwd = process.cwd();
    const fp = resolveGeneratedSitePlaceholdersPath(cwd);
    expect(existsSync(fp)).toBe(true);
    const raw = readGeneratedSitePlaceholdersEnvText(cwd);
    const pairs = parseGeneratedSitePlaceholderLines(raw);
    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs.some((p) => p.key === "NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
  });
});
