import { describe, expect, it } from "vitest";

import {
  ENGINE_MAX_OUTPUT_TOKENS,
  getEngineMaxOutputTokens,
  getReasoningEffort,
} from "./defaults";

describe("getEngineMaxOutputTokens", () => {
  it("returns the configured per-tier caps", () => {
    expect(getEngineMaxOutputTokens("fast")).toBe(32_768);
    expect(getEngineMaxOutputTokens("pro")).toBe(65_536);
    expect(getEngineMaxOutputTokens("max")).toBe(128_000);
    expect(getEngineMaxOutputTokens("codex")).toBe(128_000);
  });

  it("falls back to the shared default for unknown tiers", () => {
    expect(getEngineMaxOutputTokens("unknown-tier")).toBe(ENGINE_MAX_OUTPUT_TOKENS);
    expect(getEngineMaxOutputTokens(undefined)).toBe(ENGINE_MAX_OUTPUT_TOKENS);
  });
});

describe("getReasoningEffort", () => {
  it("maps thinking=true to tier-specific effort", () => {
    expect(getReasoningEffort("pro", true)).toBe("medium");
    expect(getReasoningEffort("max", true)).toBe("high");
    expect(getReasoningEffort("codex", true)).toBe("high");
    expect(getReasoningEffort("fast", true)).toBe("none");
  });

  it("returns none when thinking is disabled or missing", () => {
    expect(getReasoningEffort("max", false)).toBe("none");
    expect(getReasoningEffort("max", undefined)).toBe("none");
  });

  it("returns none for unknown tiers", () => {
    expect(getReasoningEffort("unknown-tier", true)).toBe("none");
    expect(getReasoningEffort(undefined, true)).toBe("none");
  });
});
