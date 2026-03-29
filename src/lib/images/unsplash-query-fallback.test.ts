import { describe, expect, it } from "vitest";
import { buildUnsplashSearchCandidates } from "./unsplash-query-fallback";

describe("buildUnsplashSearchCandidates", () => {
  it("builds progressively shorter and broader candidates without domain hardcoding", () => {
    const candidates = buildUnsplashSearchCandidates("kaffebönor från Malaysia svartrost");

    expect(candidates[0]).toBeTruthy();
    expect(candidates).toContain("kaffebönor malaysia svartrost");
    expect(candidates).toContain("kaffebönor malaysia");
    expect(candidates).toContain("kaffebönor");
    expect(candidates).toContain("svartrost");
  });
});
