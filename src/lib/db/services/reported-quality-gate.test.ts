import { describe, expect, it } from "vitest";
import {
  applyProductPostcheckLogReadFailureToVersionStatus,
  applyProductPostcheckReportToVersionStatus,
  filterProductPostcheckEventsForCurrentFilesRevision,
  isReportedQualityGateGreen,
  productPostcheckEventMatchesCurrentFilesRevision,
  productBlockedFromSummaryMeta,
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

  it("propagates skippedReason into the degradation message", () => {
    const status = applyProductPostcheckReportToVersionStatus(
      {
        runId: "run_1",
        phase: "done",
        previewBlocked: false,
        verificationBlocked: false,
        repairPassIndex: 0,
        lastBuildError: null,
        eventCount: 0,
        done: true,
        verifierOutcome: "passed",
        degradations: [],
      },
      [
        {
          category: "product_postcheck.skipped",
          message: "F2 Product Postcheck skipped.",
          meta: { skippedReason: "preview_not_running" },
          created_at: "2026-08-31T10:00:00Z",
        },
      ],
    );
    expect(status.degradations).toEqual([
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        message: "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
        meta: expect.objectContaining({ skippedReason: "preview_not_running" }),
      }),
    ]);
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

describe("infrastruktur-skip blir advisory, inte degraded — SM-072", () => {
  const baseStatus = {
    runId: "run_1",
    phase: "done" as const,
    previewBlocked: false,
    verificationBlocked: false,
    repairPassIndex: 0,
    lastBuildError: null,
    eventCount: 0,
    done: true,
    verifierOutcome: "passed" as const,
    degradations: [],
  };

  const skipLog = (reason: string) => ({
    category: "product_postcheck.skipped",
    message: "F2 Product Postcheck skipped.",
    meta: { skippedReason: reason },
    created_at: "2026-09-01T01:16:24Z",
  });

  it("rapporterar advisory när Chromium dog av /tmp-svält", () => {
    // Prod 2026-09-01 01:16:24Z: `Target page, context or browser has been
    // closed` med 8 MB fritt i /tmp, på en version som passerade allt annat.
    expect(resolveProductPostcheckReportState([skipLog("browser_crashed")]).kind).toBe("advisory");
    expect(resolveProductPostcheckReportState([skipLog("playwright_unavailable")]).kind).toBe(
      "advisory",
    );
  });

  it("degraderar på catch-all runtime_error", () => {
    expect(resolveProductPostcheckReportState([skipLog("runtime_error")]).kind).toBe("degraded");
  });

  it("håller kvar degraded när skipen säger något om produkten", () => {
    expect(resolveProductPostcheckReportState([skipLog("preview_not_running")]).kind).toBe(
      "degraded",
    );
    expect(resolveProductPostcheckReportState([skipLog("navigation_failed")]).kind).toBe(
      "degraded",
    );
  });

  it("låter kvalitetsgrinden förbli grön vid advisory men inte vid degraded", () => {
    expect(
      resolveReportedQualityGateFromSignals({
        qualityGateResult: "preflight_passed",
        productPostcheckLogs: [skipLog("playwright_unavailable")],
      }),
    ).toBe("preflight_passed");
    expect(
      resolveReportedQualityGateFromSignals({
        qualityGateResult: "preflight_passed",
        productPostcheckLogs: [skipLog("preview_not_running")],
      }),
    ).toBe("product_postcheck_degraded");
  });

  it("behåller noteringen för diagnostiken men märker den infrastructureSkip", () => {
    const status = applyProductPostcheckReportToVersionStatus(baseStatus, [
      skipLog("browser_crashed"),
    ]);
    expect(status.degradations).toEqual([
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        meta: expect.objectContaining({
          skippedReason: "browser_crashed",
          infrastructureSkip: true,
        }),
      }),
    ]);
  });

  it("märker inte en produktbärande skip som infrastruktur", () => {
    const status = applyProductPostcheckReportToVersionStatus(baseStatus, [
      skipLog("preview_not_running"),
    ]);
    expect(status.degradations[0]?.meta).not.toHaveProperty("infrastructureSkip");
  });

  it("en misslyckad loggläsning degraderar — aldrig advisory", () => {
    // Fail-closed: loggen kan ha burit ett product_postcheck_blocked som vi
    // aldrig fick se. Att visa Publicerad då vore false-green.
    const status = applyProductPostcheckLogReadFailureToVersionStatus(baseStatus);
    expect(status.degradations[0]?.meta).toEqual(
      expect.objectContaining({ skippedReason: "log_read_error", transient: true }),
    );
    expect(status.degradations[0]?.meta).not.toHaveProperty("infrastructureSkip");
  });

  it("en blockerande summary vinner fortfarande över allt", () => {
    const state = resolveProductPostcheckReportState([
      { category: "product_postcheck.summary", meta: { productBlocked: true }, created_at: "2026-09-01T01:00:00Z" },
      skipLog("browser_crashed"),
    ]);
    expect(state.kind).toBe("blocked");
  });

  it("pending/indeterminate-summary är waiting — inte clear/ej-blockerad", () => {
    expect(
      productBlockedFromSummaryMeta({ verdict: "pending", productBlocked: false }),
    ).toBe(false);
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "pending", productBlocked: false },
          created_at: "2026-09-02T10:00:00Z",
        },
      ]).kind,
    ).toBe("waiting");
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "indeterminate", productBlocked: false },
          created_at: "2026-09-02T10:00:00Z",
        },
      ]).kind,
    ).toBe("waiting");
  });

  it("senare passed-summary på samma revision rensar äldre blocked", () => {
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "passed",
            productBlocked: false,
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:01:00Z",
        },
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "blocked",
            productBlocked: true,
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:00:00Z",
        },
      ]).kind,
    ).toBe("clear");
  });

  it("blocked sedan allowed_skip-summary på samma revision förblir blocked", () => {
    expect(
      resolveProductPostcheckReportState([
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "allowed_skip",
            productBlocked: false,
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:01:00Z",
        },
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "blocked",
            productBlocked: true,
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:00:00Z",
        },
      ]).kind,
    ).toBe("blocked");
  });

  it("waiting overlayar inte bort en tidigare blocked-degradering", () => {
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
            kind: "product_postcheck_blocked",
            message: "Mobilmeny",
            meta: { productBlocked: true },
          },
        ],
      },
      [
        {
          category: "product_postcheck.summary",
          meta: { verdict: "pending", productBlocked: false },
          created_at: "2026-09-02T10:00:00Z",
        },
      ],
    );
    expect(status.degradations.map((item) => item.kind)).toEqual([
      "product_postcheck_blocked",
    ]);
  });
});
