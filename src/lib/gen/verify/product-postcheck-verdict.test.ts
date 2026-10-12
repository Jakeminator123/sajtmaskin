import { describe, expect, it } from "vitest";
import type { ProductPostcheckResult } from "./product-postcheck";
import {
  buildProductPostcheckLogItems,
  f3MayReleaseOnVerdict,
  interpretProductPostcheckClaim,
  interpretProductPostcheckLogs,
  interpretProductPostcheckSummaryRead,
  isNonBlockingPreviewBootResult,
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

  it("icke-blockerande preview_boot_page är pending — aldrig pass (SM-077)", () => {
    const boot = result({
      warnings: [{ code: "preview_boot_page", message: "boot" }],
      warningCount: 1,
      productBlocked: false,
    });
    expect(isNonBlockingPreviewBootResult(boot)).toBe(true);
    expect(verdictFromProductPostcheckResult(boot)).toBe("pending");
    expect(f3MayReleaseOnVerdict("pending")).toBe(false);
    expect(
      isNonBlockingPreviewBootResult(
        result({
          warnings: [{ code: "preview_boot_page", message: "boot" }],
          productBlocked: true,
        }),
      ),
    ).toBe(false);
    const noWarnings = {
      skipped: false,
      productBlocked: false,
      attestation: ATTESTATION,
    } as ProductPostcheckResult;
    expect(isNonBlockingPreviewBootResult(noWarnings)).toBe(false);
    expect(verdictFromProductPostcheckResult(noWarnings)).toBe("passed");
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

const CURRENT_POSTCHECK_ATTESTATION = {
  previewSessionId: "ps_n",
  lifecycleToken: "life_n",
  filesRevision: "rev_n",
};

describe("buildProductPostcheckLogItems live review", () => {
  it("persists a transport failure when the postcheck API returned no result", () => {
    expect(buildProductPostcheckLogItems(null)).toEqual([
      expect.objectContaining({
        level: "warning",
        category: "post-check.product-postcheck-transport",
        meta: expect.objectContaining({ skippedReason: "transport_error" }),
      }),
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "pending",
          skippedReason: "transport_error",
        }),
      }),
    ]);
  });

  it("skriver skip-orsaken i stället för 'screenshots captured'", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: null, mobileUrl: null },
      liveReview: { status: "skipped", reason: "no_screenshots" },
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review skipped: no_screenshots.",
    );
  });

  it("bär postcheck-attesteringen i varje durabel loggrad", () => {
    const attestation = {
      previewSessionId: "preview_n",
      lifecycleToken: null,
      filesRevision: "rev_n",
    };
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [{ code: "console_error", message: "boom" }],
      warningCount: 1,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      liveReview: { status: "skipped", reason: "no_screenshots" },
      attestation,
    });

    expect(logs.length).toBeGreaterThan(1);
    for (const log of logs) {
      expect(log.meta).toEqual(
        expect.objectContaining({
          attestedPreviewSessionId: "preview_n",
          attestedLifecycleToken: null,
          attestedFilesRevision: "rev_n",
        }),
      );
    }
  });

  it("binder run-id till varje rad och redovisar reported vs persisted antal", () => {
    // OpenClaw 2026-09-01: "9 varningar rapporterade, 7 redovisade" gick inte
    // att utreda utan körnings-id + separata räknare i summaryn.
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [
        { code: "cta_no_handler", message: "CTA-knapp saknar tydlig handling." },
        { code: "broken_image", message: "Bilden laddade inte: x", src: "https://x" },
      ],
      warningCount: 9,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      attestation: CURRENT_POSTCHECK_ATTESTATION,
      verificationRunId: "run_abc",
    });

    for (const log of logs) {
      expect(log.meta).toEqual(expect.objectContaining({ verificationRunId: "run_abc" }));
    }
    const summary = logs.find((log) => log.category === "product_postcheck.summary");
    expect(summary?.meta).toEqual(
      expect.objectContaining({
        reportedWarningCount: 9,
        persistedWarningCount: 2,
        warningCount: 2,
        verdict: "passed",
      }),
    );
  });

  it("behåller verdikten när review är completed", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      liveReview: {
        status: "completed",
        decision: {
          verdict: "pass",
          confidence: 0.8,
          rationale: "Sajten följer briefen.",
          reasoning: "",
          issues: [],
        },
        durationMs: 9,
        modelId: "gpt-4o",
      },
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review: pass.",
    );
  });

  it("persists superseded as an explicit non-release verdict, never a legacy skip", () => {
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "preview_superseded",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: "https://preview.example",
        routesChecked: 1,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "superseded",
          skippedReason: "preview_superseded",
        }),
      }),
    ]);
  });

  it("attesterad skip skriver bara skipped — ingen ny summary som kan radera blocked", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: true,
      skippedReason: "browser_crashed",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 0,
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.map((log) => log.category)).toEqual(["product_postcheck.skipped"]);
    expect(logs[0]?.meta).toEqual(
      expect.objectContaining({
        verdict: "allowed_skip",
        skippedReason: "browser_crashed",
      }),
    );
  });

  it("oattesterad skip persisteras som pending; feature_disabled som allowed_skip", () => {
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "browser_crashed",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: "https://preview.example",
        routesChecked: 0,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "pending",
          skippedReason: "browser_crashed",
        }),
      }),
    ]);
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "feature_disabled",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: null,
        routesChecked: 0,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "allowed_skip",
          skippedReason: "feature_disabled",
        }),
      }),
    ]);
  });

  it("L7: oattesterad preview_not_ready/preview_not_running lämnar ingen durabel skip", () => {
    const pending = {
      ok: true as const,
      skipped: true,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 1,
      checkedUrl: "https://preview.example",
      routesChecked: 0,
      attestation: null,
    };
    expect(
      buildProductPostcheckLogItems({ ...pending, skippedReason: "preview_not_ready" }),
    ).toEqual([]);
    expect(
      buildProductPostcheckLogItems({ ...pending, skippedReason: "preview_not_running" }),
    ).toEqual([]);
  });
});
