import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveBuildMaxOutputTokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses tier cap for fast and pro under default ENGINE ceiling", async () => {
    vi.stubEnv("SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS", "128000");
    const { resolveBuildMaxOutputTokens } = await import("./defaults");
    expect(resolveBuildMaxOutputTokens("fast")).toBe(32_768);
    expect(resolveBuildMaxOutputTokens("pro")).toBe(128_000);
    expect(resolveBuildMaxOutputTokens("max")).toBe(128_000);
  });

  /**
   * "Sänkt ENGINE" = lägre `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` än tier-taket,
   * så att en global budget begränsar alla profiler (t.ex. kostnadstak i prod).
   */
  it("when ENGINE env is lowered, caps all tiers to that ceiling", async () => {
    vi.stubEnv("SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS", "50000");
    const { resolveBuildMaxOutputTokens } = await import("./defaults");
    expect(resolveBuildMaxOutputTokens("max")).toBe(50_000);
    expect(resolveBuildMaxOutputTokens("pro")).toBe(50_000);
    expect(resolveBuildMaxOutputTokens("fast")).toBe(32_768);
  });

  it("when tier is unknown, falls back to ENGINE-only budget", async () => {
    vi.stubEnv("SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS", "96000");
    const { resolveBuildMaxOutputTokens } = await import("./defaults");
    expect(resolveBuildMaxOutputTokens("not-a-tier")).toBe(96_000);
    expect(resolveBuildMaxOutputTokens(null)).toBe(96_000);
    expect(resolveBuildMaxOutputTokens(undefined)).toBe(96_000);
  });
});
