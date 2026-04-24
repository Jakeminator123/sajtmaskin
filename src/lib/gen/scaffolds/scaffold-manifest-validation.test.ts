import { describe, expect, it } from "vitest";
import { runScaffoldManifestChecks } from "./scaffold-manifest-validation";
import { landingPageManifest } from "./landing-page/manifest";

describe("runScaffoldManifestChecks", () => {
  it("keeps all registered scaffolds free from structural errors", () => {
    const issues = runScaffoldManifestChecks();
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("landing-page scaffold prompt hints (plan-12 #14)", () => {
  it("warns the LLM that sub-routes must not redirect back to '/'", () => {
    // Repro chat 2026-04-24: LLM generated a /afrikanska-bonor sub-route
    // that auto-redirected to '/' via router.push in useEffect, because it
    // misread the scaffold's one-page-marketing structureProfile as "all
    // navigation funnels back to the one-page version". This hint stops
    // that misreading at prompt-construction time.
    const subRouteHint = landingPageManifest.promptHints.find((h) =>
      h.includes("Sub-routes"),
    );
    expect(subRouteHint).toBeDefined();
    expect(subRouteHint).toMatch(/router\.push\('\/'\)/);
    expect(subRouteHint).toMatch(/redirect\('\/'\)/);
  });
});
