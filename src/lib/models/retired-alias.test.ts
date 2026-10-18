import { describe, expect, it } from "vitest";
import {
  aliasRetiredModelId,
  ownModelIdToCanonicalModelId,
  resolveChatModelTier,
} from "@/lib/models/catalog";

describe("resolveChatModelTier — shared Sol build model", () => {
  it("prefers the persisted snapshot tier over the ambiguous chat.model", () => {
    expect(
      resolveChatModelTier({
        model: "gpt-5.6-sol",
        orchestration_snapshot: { modelTier: "premium" },
      }),
    ).toBe("premium");
    expect(
      resolveChatModelTier({ model: "gpt-5.6-sol", orchestration_snapshot: { modelTier: "pro" } }),
    ).toBe("pro");
  });

  it("falls back to the model heuristic without a usable snapshot tier", () => {
    expect(resolveChatModelTier({ model: "gpt-5.6-sol", orchestration_snapshot: null })).toBe("max");
    expect(resolveChatModelTier({ model: "gpt-6.1-sol", orchestration_snapshot: null })).toBe("max");
    expect(
      resolveChatModelTier({ model: "gpt-5.6-sol", orchestration_snapshot: { modelTier: "nope" } }),
    ).toBe("max");
    expect(resolveChatModelTier({ model: "claude-opus-4.8" })).toBe("anthropic");
    expect(resolveChatModelTier(null)).toBeNull();
  });
});

describe("retired cheap model → shared Sol / Mellan", () => {
  it("aliases gpt-5.4-mini to Sol and resolves that shared build model to max", () => {
    const previous = process.env.SAJTMASKIN_MODEL_PREMIUM;
    process.env.SAJTMASKIN_MODEL_PREMIUM = "gpt-5.5";
    try {
      expect(aliasRetiredModelId("gpt-5.4-mini")).toBe("gpt-6.1-sol");
      expect(aliasRetiredModelId("openai/gpt-5.4-mini")).toBe("openai/gpt-6.1-sol");
      expect(ownModelIdToCanonicalModelId("fast")).toBe("premium");
      expect(ownModelIdToCanonicalModelId("gpt-5.4-mini")).toBe("max");
      // Both the pre-2026-10-17 and the current shared Sol resolve to Mellan
      // instead of the first tier that happens to share the model.
      expect(ownModelIdToCanonicalModelId("gpt-5.6-sol")).toBe("max");
      expect(ownModelIdToCanonicalModelId("gpt-6.1-sol")).toBe("max");
      // Astra is built only by Extra hög, so it maps back to that tier.
      expect(ownModelIdToCanonicalModelId("gpt-6-astra")).toBe("ultra");
      // Terra/Luna are side-phase siblings, not a persisted build-tier id.
      expect(ownModelIdToCanonicalModelId("gpt-5.6-terra")).toBeNull();
      expect(ownModelIdToCanonicalModelId("gpt-5.6-luna")).toBeNull();
      expect(ownModelIdToCanonicalModelId("gpt-6-luna")).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.SAJTMASKIN_MODEL_PREMIUM;
      } else {
        process.env.SAJTMASKIN_MODEL_PREMIUM = previous;
      }
    }
  });
});

// Regression for Bugbot #283 high-severity findings: the retired Sonnet 4.6 id
// must alias to Opus 4.8 across BOTH the dot form and the version-normalized
// dash form (produced by resolveAnthropicBriefModelId before createDirectModel),
// for every provider prefix. A missing variant lets the retired model reach a
// provider call (server auto-brief) or silently fall back to "off" in the
// builder prompt-assist default.
describe("aliasRetiredModelId — retired Sonnet 4.6 → Opus 4.8", () => {
  it.each([
    ["claude-sonnet-4.6", "claude-opus-4.8"],
    ["claude-sonnet-4-6", "claude-opus-4-8"],
    ["anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.8"],
    ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8"],
    ["anthropic-direct/claude-sonnet-4.6", "anthropic-direct/claude-opus-4-8"],
    ["anthropic-direct/claude-sonnet-4-6", "anthropic-direct/claude-opus-4-8"],
  ])("maps %s -> %s", (input, expected) => {
    expect(aliasRetiredModelId(input)).toBe(expected);
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(aliasRetiredModelId("  anthropic/claude-sonnet-4-6  ")).toBe(
      "anthropic/claude-opus-4-8",
    );
  });

  it("passes through live models unchanged", () => {
    for (const id of [
      "claude-opus-4.8",
      "anthropic/claude-opus-4.8",
      "anthropic-direct/claude-opus-4-8",
      "openai/gpt-5.5",
      "gpt-5.6-sol",
      "gpt-6.1-sol",
      "openai/gpt-6-luna",
    ]) {
      expect(aliasRetiredModelId(id)).toBe(id);
    }
  });

  it("returns an empty string for null/undefined", () => {
    expect(aliasRetiredModelId(null)).toBe("");
    expect(aliasRetiredModelId(undefined)).toBe("");
  });
});

describe("aliasRetiredModelId — OpenAI-deprecated models", () => {
  it.each([
    ["gpt-5.3-codex", "gpt-6.1-sol"],
    ["openai/gpt-5.3-codex", "openai/gpt-6.1-sol"],
    ["gpt-5.3-codex-max", "gpt-6.1-sol"],
    ["gpt-4.1", "gpt-6.1-sol"],
    ["openai/gpt-4.1", "openai/gpt-6.1-sol"],
    ["gpt-4o-mini", "gpt-6-luna"],
    ["openai/gpt-4o-mini", "openai/gpt-6-luna"],
  ])("maps %s -> %s", (input, expected) => {
    expect(aliasRetiredModelId(input)).toBe(expected);
  });

  it("resolves a persisted deprecated build model to the shared Sol tier", () => {
    expect(ownModelIdToCanonicalModelId("gpt-5.3-codex")).toBe("max");
  });
});
