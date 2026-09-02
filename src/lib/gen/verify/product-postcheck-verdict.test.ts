import { describe, expect, it } from "vitest";
import type { ProductPostcheckResult } from "./product-postcheck";
import {
  f3MayReleaseOnVerdict,
  interpretProductPostcheckClaim,
  interpretProductPostcheckLogs,
  interpretProductPostcheckSummaryRead,
  isRetryableProductPostcheckVerdict,
  isUnattestedProductPostcheckVerdictWriteAllowed,
  productPostcheckF3GateReason,
  productPostcheckResultFromVerdict,
  verdictFromProductPostcheckResult,
  verdictFromSummaryMeta,
} from "./product-postcheck-verdict";

const ATTESTATION = {
  previewSessionId: "ps_1",
  lifecycleToken: "life_1",
  filesRevision: "rev_1",
};

function result(
  patch: Partial<ProductPostcheckResult>,
): ProductPostcheckResult {
  return {
    ok: true,
    skipped: false,
    skippedReason: null,
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    durationMs: 1,
    checkedUrl: "http://127.0.0.1/",
    routesChecked: 1,
    attestation: ATTESTATION,
    ...patch,
  };
}

describe("Product Postcheck verdict (L2)", () => {
  it("(a) saknad summary är pending — aldrig pass", () => {
    expect(interpretProductPostcheckLogs([])).toBe("pending");
    expect(interpretProductPostcheckSummaryRead({ status: "missing" })).toBe(
      "pending",
    );
    expect(f3MayReleaseOnVerdict("pending")).toBe(false);
    expect(productPostcheckF3GateReason("pending")).toBe(
      "product_postcheck_pending",
    );
  });

  it("(b) DB-läsfel är indeterminate och blockerar F3 med retry", () => {
    expect(
      interpretProductPostcheckLogs([], { readFailed: true }),
    ).toBe("indeterminate");
    expect(interpretProductPostcheckSummaryRead({ status: "error" })).toBe(
      "indeterminate",
    );
    expect(f3MayReleaseOnVerdict("indeterminate")).toBe(false);
    expect(isRetryableProductPostcheckVerdict("indeterminate")).toBe(true);
    expect(productPostcheckF3GateReason("indeterminate")).toBe(
      "product_postcheck_indeterminate",
    );
  });

  it("(d) blocked persisterad blockerar F3", () => {
    expect(verdictFromSummaryMeta({ verdict: "blocked" })).toBe("blocked");
    expect(verdictFromSummaryMeta({ productBlocked: true })).toBe("blocked");
    expect(
      interpretProductPostcheckLogs([
        { category: "product_postcheck.summary", meta: { productBlocked: true } },
      ]),
    ).toBe("blocked");
    expect(f3MayReleaseOnVerdict("blocked")).toBe(false);
    expect(productPostcheckF3GateReason("blocked")).toBe(
      "product_postcheck_blocked",
    );
  });

  it("(e) passed persisterad släpper F3", () => {
    expect(verdictFromSummaryMeta({ verdict: "passed" })).toBe("passed");
    expect(verdictFromSummaryMeta({ productBlocked: false })).toBe("passed");
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "passed", productBlocked: false },
        },
      ]),
    ).toBe("passed");
    expect(f3MayReleaseOnVerdict("passed")).toBe(true);
    expect(productPostcheckF3GateReason("passed")).toBeNull();
  });

  it("(g) superseded är retrybar — aldrig pass", () => {
    expect(verdictFromProductPostcheckResult(result({
      skipped: true,
      skippedReason: "preview_superseded",
      attestation: null,
    }))).toBe("superseded");
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "superseded" },
        },
      ]),
    ).toBe("superseded");
    expect(f3MayReleaseOnVerdict("superseded")).toBe(false);
    expect(isRetryableProductPostcheckVerdict("superseded")).toBe(true);
    expect(productPostcheckF3GateReason("superseded")).toBe(
      "product_postcheck_superseded",
    );
  });

  it("allowed_skip släpper F3 bara när skipet är attesterat", () => {
    expect(
      verdictFromProductPostcheckResult(
        result({
          skipped: true,
          skippedReason: "feature_disabled",
          attestation: null,
        }),
      ),
    ).toBe("allowed_skip");
    expect(
      verdictFromProductPostcheckResult(
        result({ skipped: true, skippedReason: "feature_disabled" }),
      ),
    ).toBe("allowed_skip");
    expect(
      verdictFromProductPostcheckResult(
        result({
          skipped: true,
          skippedReason: "browser_crashed",
          attestation: null,
        }),
      ),
    ).toBe("pending");
    expect(
      verdictFromProductPostcheckResult(
        result({ skipped: true, skippedReason: "browser_crashed" }),
      ),
    ).toBe("allowed_skip");
    expect(f3MayReleaseOnVerdict("allowed_skip")).toBe(true);
    expect(f3MayReleaseOnVerdict("pending")).toBe(false);
  });

  it("blocked sedan skip på samma revision förblir blocked", () => {
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.skipped",
          meta: {
            skippedReason: "browser_crashed",
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
      ]),
    ).toBe("blocked");
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "allowed_skip",
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:01:00Z",
        },
        {
          category: "product_postcheck.summary",
          meta: {
            verdict: "blocked",
            attestedFilesRevision: "rev_1",
          },
          created_at: "2026-09-02T10:00:00Z",
        },
      ]),
    ).toBe("blocked");
  });

  it("oattesterad skip är pending — F3 blockerar; attesterad feature_disabled släpper", () => {
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "pending", skippedReason: "unknown" },
        },
      ]),
    ).toBe("pending");
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.skipped",
          meta: { skippedReason: "browser_crashed" },
        },
      ]),
    ).toBe("pending");
    expect(f3MayReleaseOnVerdict("pending")).toBe(false);
    expect(
      interpretProductPostcheckLogs([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "allowed_skip", skippedReason: "feature_disabled" },
        },
      ]),
    ).toBe("allowed_skip");
    expect(f3MayReleaseOnVerdict("allowed_skip")).toBe(true);
  });

  it("senare passed på samma revision släpper en äldre blocked", () => {
    expect(
      interpretProductPostcheckLogs([
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
      ]),
    ).toBe("passed");
  });

  it("produkt-skip utan produktdom är pending", () => {
    expect(
      verdictFromProductPostcheckResult(
        result({ skipped: true, skippedReason: "preview_not_running" }),
      ),
    ).toBe("pending");
    expect(verdictFromProductPostcheckResult(null)).toBe("pending");
  });

  it("L6 running-claim utan summary är pending", () => {
    expect(interpretProductPostcheckClaim({ status: "running" })).toBe("pending");
    expect(
      interpretProductPostcheckLogs([], { claim: { status: "running" } }),
    ).toBe("pending");
    expect(
      interpretProductPostcheckLogs(
        [{ category: "product_postcheck.summary", meta: { verdict: "passed" } }],
        { claim: { status: "running" } },
      ),
    ).toBe("passed");
  });

  it("explicit verdict vinner över legacy productBlocked", () => {
    expect(
      verdictFromSummaryMeta({ verdict: "pending", productBlocked: false }),
    ).toBe("pending");
  });

  it("oläsbar summary-meta är pending, inte pass", () => {
    expect(verdictFromSummaryMeta({})).toBeNull();
    expect(
      interpretProductPostcheckLogs([
        { category: "product_postcheck.summary", meta: { warningCount: 1 } },
      ]),
    ).toBe("pending");
  });

  it("tillåter oattesterad skrivning bara för icke-pass-domar", () => {
    expect(
      isUnattestedProductPostcheckVerdictWriteAllowed([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "superseded" },
        },
      ]),
    ).toBe(true);
    expect(
      isUnattestedProductPostcheckVerdictWriteAllowed([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "passed" },
        },
      ]),
    ).toBe(false);
    expect(
      isUnattestedProductPostcheckVerdictWriteAllowed([
        {
          category: "product_postcheck.summary",
          meta: { productBlocked: false },
        },
      ]),
    ).toBe(false);
    expect(
      isUnattestedProductPostcheckVerdictWriteAllowed([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "allowed_skip", skippedReason: "feature_disabled" },
        },
      ]),
    ).toBe(true);
    expect(
      isUnattestedProductPostcheckVerdictWriteAllowed([
        {
          category: "product_postcheck.summary",
          meta: { verdict: "allowed_skip", skippedReason: "browser_crashed" },
        },
      ]),
    ).toBe(false);
  });

  it("L6 loser-replay: report-state kommer från L2-domen + activeRunId", () => {
    const passed = productPostcheckResultFromVerdict({
      verdict: "passed",
      runId: "run_winner",
      claimStatus: "passed",
      previewUrl: "https://preview.example",
      attestation: ATTESTATION,
    });
    expect(passed.skipped).toBe(false);
    expect(passed.productBlocked).toBe(false);
    expect(passed.activeRunId).toBe("run_winner");
    expect(passed.attestation).toEqual(ATTESTATION);

    const busy = productPostcheckResultFromVerdict({
      verdict: "pending",
      runId: "run_winner",
      claimStatus: "running",
      previewUrl: "https://preview.example",
    });
    expect(busy.skippedReason).toBe("claim_busy");
    expect(busy.activeRunId).toBe("run_winner");
    expect(busy.attestation).toBeNull();

    const settled = productPostcheckResultFromVerdict({
      verdict: "pending",
      runId: "run_winner",
      claimStatus: "failed",
      previewUrl: "https://preview.example",
    });
    expect(settled.skippedReason).toBe("claim_settled");
    expect(settled.activeRunId).toBe("run_winner");
  });
});
