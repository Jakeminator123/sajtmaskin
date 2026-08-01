import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
 */
describe("variant eval blocklist — filename contract", () => {
  it("derives the report name from the scaffold id", () => {
    expect(variantEvalReportFileName("landing-page")).toBe(
      "landing-page-variant-latest.json",
    );
  });

  it("finds the committed landing-page report at the canonical path", () => {
    expect(existsSync(variantEvalReportPath("landing-page"))).toBe(true);
  });

  it("returns an empty set for a scaffold without a report", () => {
    expect(getBlockedVariantIds("portfolio", ["minimal-studio"]).size).toBe(0);
  });
});

describe("variant eval blocklist — staleness guard", () => {
  const reportPath = variantEvalReportPath("landing-page");
  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as {
    candidatesForRemoval?: string[];
    variantsBySummary?: Array<{ id: string }>;
  };
  const evaluatedIds = (report.variantsBySummary ?? []).map((entry) => entry.id);

  it("applies candidatesForRemoval when the report evaluated every known variant", () => {
    const blocked = getBlockedVariantIds("landing-page", evaluatedIds);
    expect([...blocked].sort()).toEqual([...(report.candidatesForRemoval ?? [])].sort());
  });

  it("ignores the report when a variant landed after it was generated", () => {
    // A "never wins" verdict reached without seeing the current candidate field
    // must not retire a design direction. Re-run the eval to re-enable it.
    const blocked = getBlockedVariantIds("landing-page", [
      ...evaluatedIds,
      "variant-added-after-the-eval",
    ]);
    expect(blocked.size).toBe(0);
  });

  it("dagens committade rapport täcker hela registret — blocklistan är aktiv", () => {
    // Rapporten regenererades 2026-07-31 (40 prompts, alla live-varianter).
    // Landar en ny variant utan omkörd eval blir rapporten stale igen och
    // detta test rött — kör då om `npx tsx scripts/scaffolds/eval-landing-variants.ts`
    // i stället för att försvaga assertionen.
    const liveIds = getVariantsForScaffold("landing-page").map((variant) => variant.id);
    const unevaluated = liveIds.filter((id) => !evaluatedIds.includes(id));
    expect(unevaluated).toEqual([]);
    expect([...getBlockedVariantIds("landing-page", liveIds)].sort()).toEqual(
      [...(report.candidatesForRemoval ?? [])].sort(),
    );
  });
});
