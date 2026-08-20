import { describe, expect, it } from "vitest";
import {
  isReportedQualityGateGreen,
  resolveReportedQualityGateFromSignals,
  resolveReportedQualityGateResult,
} from "./reported-quality-gate";

describe("resolveReportedQualityGateResult — SM-017", () => {
  it("does not report a green gate when postcheck set productBlocked", () => {
    const reported = resolveReportedQualityGateResult("preflight_passed", {
      productBlocked: true,
    });
    expect(reported).not.toBe("preflight_passed");
    expect(reported).toBe("product_blocked");
    expect(isReportedQualityGateGreen(reported)).toBe(false);
  });

  it("reads productBlocked from product_postcheck.summary meta", () => {
    const reported = resolveReportedQualityGateFromSignals({
      qualityGateResult: "preflight_passed",
      productPostcheckSummaryMeta: { productBlocked: true, warningCount: 1 },
    });
    expect(isReportedQualityGateGreen(reported)).toBe(false);
  });

  it("keeps finalize pass when postcheck did not block", () => {
    expect(
      resolveReportedQualityGateResult("preflight_passed", { productBlocked: false }),
    ).toBe("preflight_passed");
  });

  it("keeps finalize pass when no postcheck summary exists", () => {
    expect(resolveReportedQualityGateResult("preflight_passed", null)).toBe(
      "preflight_passed",
    );
  });

  it("keeps finalize failures even if postcheck also blocked", () => {
    expect(
      resolveReportedQualityGateResult("verifier_failed", { productBlocked: true }),
    ).toBe("verifier_failed");
    expect(
      resolveReportedQualityGateResult("preflight_failed", { productBlocked: true }),
    ).toBe("preflight_failed");
  });
});
