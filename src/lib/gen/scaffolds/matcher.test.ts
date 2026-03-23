import { describe, expect, it, vi } from "vitest";
import { matchScaffoldWithEmbeddings } from "./matcher";

vi.mock("./scaffold-search", () => ({
  searchScaffolds: vi.fn().mockResolvedValue([]),
}));

describe("matchScaffoldWithEmbeddings", () => {
  it("returns content-site fallback for website intent when embeddings return nothing", async () => {
    const result = await matchScaffoldWithEmbeddings("Vi vill ha en hemsida", "website");
    expect(result.scaffold?.id).toBe("content-site");
    expect(result.matchMeta.matchSource).toBe("fallback");
  });

  it("returns app-shell fallback for app intent when embeddings return nothing", async () => {
    const result = await matchScaffoldWithEmbeddings("Bygg en enkel plattform", "app");
    expect(result.scaffold?.family).toBe("app-shell");
    expect(result.matchMeta.matchSource).toBe("fallback");
  });

  it("returns base-nextjs fallback when no intent and embeddings return nothing", async () => {
    const result = await matchScaffoldWithEmbeddings("gör något", undefined);
    expect(result.scaffold?.family).toBe("base-nextjs");
    expect(result.matchMeta.matchSource).toBe("fallback");
  });

  it("uses embedding result when searchScaffolds returns above threshold", async () => {
    const { searchScaffolds } = await import("./scaffold-search");
    const mock = vi.mocked(searchScaffolds);
    const { getScaffoldById } = await import("./registry");
    const blogScaffold = getScaffoldById("blog");

    mock.mockResolvedValueOnce([
      { scaffold: blogScaffold!, score: 0.72 },
    ]);

    const result = await matchScaffoldWithEmbeddings("En blogg med artiklar", "website");
    expect(result.scaffold?.id).toBe("blog");
    expect(result.matchMeta.matchSource).toBe("embedding");
    expect(result.matchMeta.embeddingScore).toBeGreaterThanOrEqual(0.35);
  });

  it("skips website-only embedding match when buildIntent is app", async () => {
    const { searchScaffolds } = await import("./scaffold-search");
    const mock = vi.mocked(searchScaffolds);
    const { getScaffoldById } = await import("./registry");
    const landingScaffold = getScaffoldById("landing-page");

    mock.mockResolvedValueOnce([
      { scaffold: landingScaffold!, score: 0.85 },
    ]);

    const result = await matchScaffoldWithEmbeddings("Build a project management tool", "app");
    expect(result.scaffold?.family).toBe("app-shell");
    expect(result.matchMeta.matchSource).toBe("fallback");
  });

  it("picks intent-compatible runner-up over incompatible top hit", async () => {
    const { searchScaffolds } = await import("./scaffold-search");
    const mock = vi.mocked(searchScaffolds);
    const { getScaffoldById, getScaffoldByFamily } = await import("./registry");
    const landingScaffold = getScaffoldById("landing-page");
    const dashboardScaffold = getScaffoldByFamily("dashboard");

    mock.mockResolvedValueOnce([
      { scaffold: landingScaffold!, score: 0.80 },
      { scaffold: dashboardScaffold!, score: 0.60 },
    ]);

    const result = await matchScaffoldWithEmbeddings("Bygg en dashboard med analytics", "app");
    expect(result.scaffold?.family).toBe("dashboard");
    expect(result.matchMeta.matchSource).toBe("embedding");
    expect(result.matchMeta.embeddingScore).toBe(0.6);
  });
});
