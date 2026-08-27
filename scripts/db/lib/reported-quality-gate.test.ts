import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL,
  FINALIZE_PREFLIGHT_PASSED,
  LATEST_PRODUCT_BLOCKED_FOR_VERSION_SQL,
  LATEST_PRODUCT_POSTCHECK_JOIN,
  REPORTED_PRODUCT_BLOCKED,
  annotateReportedQualityGate,
  isQualityGatePassResult,
  isReportedQualityGateGreen,
  resolveReportedQualityGateResult,
  rollupReportedQualityGate,
} from "./reported-quality-gate.mjs";

const here = dirname(fileURLToPath(import.meta.url));

describe("resolveReportedQualityGateResult — tooling overlay (SM-068)", () => {
  it("does not report a green gate when postcheck set productBlocked", () => {
    const reported = resolveReportedQualityGateResult("preflight_passed", true);
    expect(reported).toBe(REPORTED_PRODUCT_BLOCKED);
    expect(isReportedQualityGateGreen(reported)).toBe(false);
    expect(isQualityGatePassResult(reported)).toBe(false);
  });

  it("keeps finalize pass when postcheck did not block", () => {
    expect(resolveReportedQualityGateResult("preflight_passed", false)).toBe(
      FINALIZE_PREFLIGHT_PASSED,
    );
    expect(resolveReportedQualityGateResult("preflight_passed", null)).toBe(
      FINALIZE_PREFLIGHT_PASSED,
    );
  });

  it("keeps finalize failures even if postcheck also blocked", () => {
    expect(resolveReportedQualityGateResult("verifier_failed", true)).toBe("verifier_failed");
    expect(resolveReportedQualityGateResult("preflight_failed", true)).toBe("preflight_failed");
  });

  it("overlays a persisted skip/transport degradation as non-pass", () => {
    const reported = resolveReportedQualityGateResult("preflight_passed", false, true);
    expect(reported).toBe("product_postcheck_degraded");
    expect(isQualityGatePassResult(reported)).toBe(false);
    expect(
      annotateReportedQualityGate({
        quality_gate_result: "preflight_passed",
        product_blocked: false,
        product_degraded: true,
      }),
    ).toEqual(
      expect.objectContaining({
        quality_gate_result: "preflight_passed",
        reported_quality_gate: "product_postcheck_degraded",
        quality_gate_overlaid: true,
      }),
    );
  });

  it("stamps overlay fields so a human can tell reported from finalize", () => {
    const before = { quality_gate_result: "preflight_passed", product_blocked: true };
    const after = annotateReportedQualityGate(before);
    expect(after.quality_gate_result).toBe("preflight_passed");
    expect(after.reported_quality_gate).toBe("product_blocked");
    expect(after.quality_gate_overlaid).toBe(true);
  });

  it("does not mark a raw finalize pass as overlaid", () => {
    const after = annotateReportedQualityGate({
      quality_gate_result: "preflight_passed",
      product_blocked: false,
    });
    expect(after.reported_quality_gate).toBe("preflight_passed");
    expect(after.quality_gate_overlaid).toBe(false);
  });
});

describe("isQualityGatePassResult", () => {
  it("counts preflight_passed and legacy pass words, never product_blocked", () => {
    expect(isQualityGatePassResult("preflight_passed")).toBe(true);
    expect(isQualityGatePassResult("passed")).toBe(true);
    expect(isQualityGatePassResult("pass")).toBe(true);
    expect(isQualityGatePassResult("product_blocked")).toBe(false);
    expect(isQualityGatePassResult("verifier_failed")).toBe(false);
  });
});

describe("rollupReportedQualityGate — before/after on a productBlocked row", () => {
  it("moves preflight_passed + productBlocked out of the pass bucket", () => {
    const rolled = rollupReportedQualityGate([
      { result: "preflight_passed", product_blocked: false, n: 9 },
      { result: "preflight_passed", product_blocked: true, n: 1 },
    ]);
    expect(rolled.overlaidN).toBe(1);
    expect(rolled.finalizeRows).toEqual([{ result: "preflight_passed", n: 10 }]);
    expect(rolled.rows).toEqual([
      { result: "preflight_passed", n: 9 },
      { result: "product_blocked", n: 1, overlaid: 1 },
    ]);
    const passN = rolled.rows
      .filter((row) => isQualityGatePassResult(row.result))
      .reduce((sum, row) => sum + row.n, 0);
    expect(passN).toBe(9);
  });

  it("keeps extra group keys when rolling up by mode", () => {
    const rolled = rollupReportedQualityGate(
      [
        { mode: "init", result: "preflight_passed", product_blocked: true, n: 2 },
        { mode: "init", result: "preflight_passed", product_blocked: false, n: 3 },
      ],
      ["mode"],
    );
    expect(rolled.rows).toEqual([
      { mode: "init", result: "preflight_passed", n: 3 },
      { mode: "init", result: "product_blocked", n: 2, overlaid: 2 },
    ]);
  });

  it("counts blocked and inconclusive overlays separately", () => {
    const rolled = rollupReportedQualityGate([
      {
        result: "preflight_passed",
        product_blocked: true,
        product_degraded: false,
        n: 2,
      },
      {
        result: "preflight_passed",
        product_blocked: false,
        product_degraded: true,
        n: 3,
      },
    ]);
    expect(rolled.overlaidN).toBe(5);
    expect(rolled.blockedOverlaidN).toBe(2);
    expect(rolled.degradedOverlaidN).toBe(3);
  });
});

describe("mjs readers import the shared overlay", () => {
  const readers = [
    join(here, "..", "generation-history.mjs"),
    join(here, "..", "control-stats.mjs"),
    join(here, "..", "latest-site.mjs"),
    join(here, "..", "dump-logs.mjs"),
    join(here, "..", "..", "observability", "compare-control-stats.mjs"),
  ];

  it.each(readers)("%s imports the shared overlay module", (file) => {
    expect(readFileSync(file, "utf8")).toContain("reported-quality-gate.mjs");
  });
});

describe("SQL/TypeScript timestamp parity", () => {
  it("keeps a same-timestamp skip visible in both shared SQL projections", () => {
    expect(LATEST_PRODUCT_POSTCHECK_JOIN).toContain(
      "skipped.created_at >= summary.created_at",
    );
    expect(LATEST_PRODUCT_BLOCKED_FOR_VERSION_SQL).toContain(
      "skipped.created_at >= summary.created_at",
    );
  });

  it("filters attested stale revisions while keeping legacy null rows", () => {
    for (const sql of [LATEST_PRODUCT_POSTCHECK_JOIN, LATEST_PRODUCT_BLOCKED_FOR_VERSION_SQL]) {
      expect(sql).toContain("attestedFilesRevision' IS NULL");
      expect(sql).toContain("SELECT ev.files_revision FROM engine_versions ev");
    }
    expect(LATEST_PRODUCT_POSTCHECK_JOIN.match(/attestedFilesRevision/g)).toHaveLength(4);
    expect(LATEST_PRODUCT_BLOCKED_FOR_VERSION_SQL.match(/attestedFilesRevision/g)).toHaveLength(4);
  });

  it("gives raw /logg readers the same revision predicate", () => {
    expect(CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL).toContain(
      "COALESCE(e.category, '') NOT LIKE 'product_postcheck.%'",
    );
    expect(CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL).toContain(
      "e.meta->>'attestedFilesRevision' IS NULL",
    );
    expect(CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL).toContain(
      "SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = e.version_id",
    );
    for (const file of [
      join(here, "..", "generation-history.mjs"),
      join(here, "..", "latest-site.mjs"),
    ]) {
      expect(readFileSync(file, "utf8")).toContain("CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL");
    }
  });
});
