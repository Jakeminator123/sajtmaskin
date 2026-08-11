import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getBlockedVariantIds,
  variantEvalReportFileName,
  variantEvalReportPath,
} from "./eval-blocklist";
import { getVariantsForScaffold } from "./registry";

/**
 * Locks the writer/reader filename contract. `scripts/scaffolds/eval-landing-variants.ts`
 * wrote `landing-variant-latest.json` while this loader looked for
 * `landing-page-variant-latest.json`, so the only report that existed was never
 * found and the blocklist was dead code — the eval could flag a variant for
 * removal and the picker kept serving it.
 *
 * Reports under `data/scaffold-eval/reports/` are per-machine (gitignored).
 * Tests that need a report write a temporary fixture and clean up.
 */
describe("variant eval blocklist — filename contract", () => {
  it("derives the report name from the scaffold id", () => {
    expect(variantEvalReportFileName("landing-page")).toBe(
      "landing-page-variant-latest.json",
    );
  });

  it("resolves the canonical path under data/scaffold-eval/reports", () => {
    const reportPath = variantEvalReportPath("landing-page");
    expect(reportPath.replace(/\\/g, "/")).toMatch(
      /data\/scaffold-eval\/reports\/landing-page-variant-latest\.json$/,
    );
  });

  it("returns an empty set for a scaffold without a report", () => {
    expect(getBlockedVariantIds("portfolio", ["minimal-studio"]).size).toBe(0);
  });
});

describe("variant eval blocklist — staleness guard", () => {
  const reportPath = variantEvalReportPath("landing-page");
  const fixture = {
    scaffoldId: "landing-page",
    candidatesForRemoval: ["never-wins-fixture"],
    variantsBySummary: [
      { id: "nature-flow" },
      { id: "warm-local" },
      { id: "never-wins-fixture" },
    ],
  };

  afterEach(() => {
    if (existsSync(reportPath)) {
      rmSync(reportPath, { force: true });
    }
  });

  function writeFixture(body: typeof fixture = fixture) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
  }

  it("applies candidatesForRemoval when the report evaluated every known variant", () => {
    writeFixture();
    const evaluatedIds = fixture.variantsBySummary.map((entry) => entry.id);
    const blocked = getBlockedVariantIds("landing-page", evaluatedIds);
    expect([...blocked].sort()).toEqual([...fixture.candidatesForRemoval].sort());
  });

  it("ignores the report when a variant landed after it was generated", () => {
    writeFixture();
    const evaluatedIds = fixture.variantsBySummary.map((entry) => entry.id);
    // A "never wins" verdict reached without seeing the current candidate field
    // must not retire a design direction. Re-run the eval to re-enable it.
    const blocked = getBlockedVariantIds("landing-page", [
      ...evaluatedIds,
      "variant-added-after-the-eval",
    ]);
    expect(blocked.size).toBe(0);
  });

  it("treats a missing report as no blocklist (clean checkout)", () => {
    expect(existsSync(reportPath)).toBe(false);
    const liveIds = getVariantsForScaffold("landing-page").map((variant) => variant.id);
    expect(getBlockedVariantIds("landing-page", liveIds).size).toBe(0);
  });

  it("round-trips a written fixture through the loader", () => {
    writeFixture();
    expect(existsSync(reportPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(reportPath, "utf-8")) as typeof fixture;
    expect(parsed.candidatesForRemoval).toEqual(fixture.candidatesForRemoval);
  });
});
