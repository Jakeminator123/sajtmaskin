import { describe, expect, it } from "vitest";
import {
  applyProductPostcheckReportToVersionStatus,
  filterProductPostcheckEventsForCurrentFilesRevision,
  isReportedQualityGateGreen,
  productPostcheckEventMatchesCurrentFilesRevision,
  resolveProductPostcheckReportState,
  resolveReportedQualityGateFromSignals,
  resolveReportedQualityGateResult,
} from "./reported-quality-gate";

describe("product postcheck event revision scope", () => {
  const event = {
    t: "version.degraded",
    kind: "product_postcheck_blocked",
    message: "blocked",
  };

  it("drops a stamped N event after the same version becomes N+1", () => {
    const stale = { ...event, meta: { attestedFilesRevision: "rev_n" } };
    expect(productPostcheckEventMatchesCurrentFilesRevision(stale, "rev_n_plus_1")).toBe(false);
    expect(filterProductPostcheckEventsForCurrentFilesRevision([stale], "rev_n_plus_1")).toEqual([]);
  });

  it("keeps current, legacy, and unrelated events", () => {
    expect(
      productPostcheckEventMatchesCurrentFilesRevision(
        { ...event, meta: { attestedFilesRevision: "rev_n" } },
        "rev_n",
      ),
    ).toBe(true);
    expect(productPostcheckEventMatchesCurrentFilesRevision(event, "rev_n_plus_1")).toBe(true);
    expect(
      productPostcheckEventMatchesCurrentFilesRevision(
        { ...event, kind: "typecheck_advisory", meta: { attestedFilesRevision: "rev_n" } },
        "rev_n_plus_1",
      ),
    ).toBe(true);
  });
});

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

  it("overlays a newer persisted skip as non-green without changing finalize", () => {
    expect(
      resolveReportedQualityGateFromSignals({
        qualityGateResult: "preflight_passed",
        productPostcheckLogs: [
          {
            category: "product_postcheck.skipped",
            meta: { skippedReason: "transport_error" },
            created_at: "2026-08-26T10:01:00Z",
          },
          {
            category: "product_postcheck.summary",
            meta: { productBlocked: false },
            created_at: "2026-08-26T10:00:00Z",
          },
        ],
      }),
    ).toBe("product_postcheck_degraded");
  });

  it("lets a clean later summary clear an older skip", () => {
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:01:00Z",
        },
        {
          category: "product_postcheck.skipped",
          meta: { skippedReason: "timeout" },
          created_at: "2026-08-26T10:00:00Z",
        },
      ]).kind,
    ).toBe("clear");
  });

  it("treats a same-timestamp skip as degraded instead of hiding it behind clean", () => {
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.skipped",
          meta: { skippedReason: "transport_error" },
          created_at: "2026-08-26T10:00:00.000Z",
        },
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:00:00.000Z",
        },
      ]).kind,
    ).toBe("degraded");
  });

  it("does not let a later skip erase the latest concrete blocker", () => {
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.skipped",
          meta: { skippedReason: "timeout" },
          created_at: "2026-08-26T10:01:00Z",
        },
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: true },
          created_at: "2026-08-26T10:00:00Z",
        },
      ]).kind,
    ).toBe("blocked");
  });

  it("replaces stale bus skip degradation from persisted clean truth", () => {
    const status = applyProductPostcheckReportToVersionStatus(
      {
        runId: "run_1",
        phase: "done",
        previewBlocked: false,
        verificationBlocked: false,
        repairPassIndex: 0,
        lastBuildError: null,
        eventCount: 1,
        done: true,
        verifierOutcome: "passed",
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "stale",
            meta: null,
          },
        ],
      },
      [
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:01:00Z",
        },
      ],
    );
    expect(status.degradations).toEqual([]);
  });

  it("preserves a newer bus blocker when DB still only has an older clean summary", () => {
    const status = applyProductPostcheckReportToVersionStatus(
      {
        runId: "run_1",
        phase: "done",
        previewBlocked: false,
        verificationBlocked: false,
        repairPassIndex: 0,
        lastBuildError: null,
        eventCount: 2,
        done: true,
        verifierOutcome: "passed",
        degradations: [
          {
            kind: "product_postcheck_blocked",
            message: "fresh blocker",
            meta: null,
          },
        ],
      },
      [
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:00:00Z",
        },
      ],
      [
        {
          t: "version.degraded",
          kind: "product_postcheck_blocked",
          message: "fresh blocker",
          ts: "2026-08-26T10:01:00Z",
          meta: null,
        },
      ],
    );
    expect(status.degradations.map((item) => item.kind)).toContain(
      "product_postcheck_blocked",
    );
  });

  it("preserves a newer bus skip when DB still only has an older clean summary", () => {
    const status = applyProductPostcheckReportToVersionStatus(
      {
        runId: "run_1",
        phase: "done",
        previewBlocked: false,
        verificationBlocked: false,
        repairPassIndex: 0,
        lastBuildError: null,
        eventCount: 2,
        done: true,
        verifierOutcome: "passed",
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "fresh skip",
            meta: { skippedReason: "transport_error" },
          },
        ],
      },
      [
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:00:00Z",
        },
      ],
      [
        {
          t: "version.degraded",
          kind: "product_postcheck_skipped",
          message: "fresh skip",
          ts: "2026-08-26T10:01:00Z",
          meta: { skippedReason: "transport_error" },
        },
      ],
    );
    expect(status.degradations).toEqual([
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        message: "fresh skip",
      }),
    ]);
    expect(status.verificationBlocked).toBe(false);
  });

  it("lets a strictly later clean DB summary clear an older bus skip", () => {
    const status = applyProductPostcheckReportToVersionStatus(
      {
        runId: "run_1",
        phase: "done",
        previewBlocked: false,
        verificationBlocked: false,
        repairPassIndex: 0,
        lastBuildError: null,
        eventCount: 2,
        done: true,
        verifierOutcome: "passed",
        degradations: [
          {
            kind: "product_postcheck_skipped",
            message: "old skip",
            meta: null,
          },
        ],
      },
      [
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
          created_at: "2026-08-26T10:01:00Z",
        },
      ],
      [
        {
          t: "version.degraded",
          kind: "product_postcheck_skipped",
          message: "old skip",
          ts: "2026-08-26T10:00:00Z",
          meta: null,
        },
      ],
    );
    expect(status.degradations).toEqual([]);
  });
});
