import { describe, expect, it } from "vitest";
import { buildSeoAdvisoriesFromMeta, withReadinessCategory } from "./readiness-payload";

describe("readiness payload category mapping", () => {
  it("klassar missing-metadata/missing-title som Advisory", () => {
    const advisories = buildSeoAdvisoriesFromMeta({
      issues: [
        { code: "missing-metadata", category: "non_blocking_quality_warning" },
        { code: "missing-title", category: "non_blocking_quality_warning" },
      ],
    });

    expect(advisories.map((item) => item.id)).toEqual([
      "seo-missing-metadata",
      "seo-missing-title",
    ]);
    expect(advisories.every((item) => item.category === "advisory")).toBe(true);
    expect(advisories.every((item) => item.severity === "warning")).toBe(true);
  });

  it("klassar quality-gate/typecheck-fel som Blocker", () => {
    const item = withReadinessCategory({
      id: "version-failed",
      title: "Versionen underkändes av quality gate (typecheck/build).",
      severity: "blocker",
      action: "versions",
    });

    expect(item.category).toBe("blocker");
  });
});
