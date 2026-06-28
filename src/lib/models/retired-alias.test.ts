import { describe, expect, it } from "vitest";
import { aliasRetiredModelId } from "@/lib/models/catalog";

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
