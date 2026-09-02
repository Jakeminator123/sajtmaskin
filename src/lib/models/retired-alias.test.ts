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
      expect(aliasRetiredModelId("gpt-5.4-mini")).toBe("gpt-5.6-sol");
      expect(aliasRetiredModelId("openai/gpt-5.4-mini")).toBe("openai/gpt-5.6-sol");
      expect(ownModelIdToCanonicalModelId("fast")).toBe("premium");
      expect(ownModelIdToCanonicalModelId("gpt-5.4-mini")).toBe("max");
      expect(ownModelIdToCanonicalModelId("gpt-5.6-sol")).toBe("max");
      // Terra/Luna are side-phase siblings, not a persisted build-tier id.
      expect(ownModelIdToCanonicalModelId("gpt-5.6-terra")).toBeNull();
      expect(ownModelIdToCanonicalModelId("gpt-5.6-luna")).toBeNull();
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
      "gpt-5.3-codex",
    ]) {
      expect(aliasRetiredModelId(id)).toBe(id);
    }
  });

  it("returns an empty string for null/undefined", () => {
    expect(aliasRetiredModelId(null)).toBe("");
    expect(aliasRetiredModelId(undefined)).toBe("");
  });
});
