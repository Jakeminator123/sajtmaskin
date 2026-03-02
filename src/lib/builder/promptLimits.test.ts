import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("promptLimits", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses default values when env vars are not set", async () => {
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(50_000);
    expect(limits.WARN_CHAT_MESSAGE_CHARS).toBe(30_000);
    expect(limits.MAX_CHAT_SYSTEM_CHARS).toBe(35_000);
    expect(limits.WARN_CHAT_SYSTEM_CHARS).toBe(20_000);
  });

  it("respects env var overrides", async () => {
    process.env.V0_MAX_PROMPT_LENGTH = "80000";
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(80_000);
  });

  it("clamps values below the minimum", async () => {
    process.env.V0_MAX_PROMPT_LENGTH = "100";
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(5_000);
  });

  it("clamps values above the maximum", async () => {
    process.env.V0_MAX_PROMPT_LENGTH = "999999";
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(120_000);
  });

  it("falls back to default for non-numeric env values", async () => {
    process.env.V0_MAX_PROMPT_LENGTH = "not-a-number";
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(50_000);
  });

  it("floors floating point env values", async () => {
    process.env.V0_MAX_PROMPT_LENGTH = "75000.9";
    const limits = await import("./promptLimits");
    expect(limits.MAX_CHAT_MESSAGE_CHARS).toBe(75_000);
  });

  it("exports orchestration soft targets with sane defaults", async () => {
    const limits = await import("./promptLimits");
    expect(limits.ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS).toBe(4_500);
    expect(limits.ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS).toBe(5_000);
    expect(limits.ORCHESTRATION_PHASE_FORCE_CHARS).toBe(10_000);
  });
});
