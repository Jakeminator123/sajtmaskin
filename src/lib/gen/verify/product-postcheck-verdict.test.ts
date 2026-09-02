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

  it("allowed_skip släpper F3 (infra / feature_disabled)", () => {
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
        result({ skipped: true, skippedReason: "browser_crashed" }),
      ),
    ).toBe("allowed_skip");
    expect(f3MayReleaseOnVerdict("allowed_skip")).toBe(true);
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
  });
});
