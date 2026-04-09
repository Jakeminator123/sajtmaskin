import { describe, expect, it } from "vitest";
import { buildErrorLogSummary } from "./summary";

describe("buildErrorLogSummary", () => {
  it("prefers latest pass logs for active counters and latest signals", () => {
    const logs = [
      {
        level: "info",
        category: "preflight:summary",
        message: "new pass ok",
        meta: { logPassId: "pass-new" },
      },
      {
        level: "info",
        category: "preview",
        message: "preview ready",
        meta: { logPassId: "pass-new", previewCode: "preview_ready", previewStage: "iframe" },
      },
      {
        level: "error",
        category: "preflight:summary",
        message: "older failed pass",
        meta: { logPassId: "pass-old", previewCode: "preflight_preview_blocked" },
      },
      {
        level: "warning",
        category: "seo",
        message: "older seo warning",
        meta: { logPassId: "pass-old" },
      },
    ];

    const summary = buildErrorLogSummary(logs);
    expect(summary.total).toBe(4);
    expect(summary.byLevel?.error).toBe(1);
    expect(summary.latestPassId).toBe("pass-new");
    expect(summary.activeTotal).toBe(2);
    expect(summary.activeByLevel?.error).toBe(0);
    expect(summary.latestPreviewCode).toBe("preview_ready");
  });

  it("falls back to full-log aggregation when pass ids are missing", () => {
    const logs = [
      { level: "warning", category: "seo", message: "warning", meta: {} },
      { level: "info", category: "preview", message: "preview", meta: { previewCode: "preview_ready" } },
    ];

    const summary = buildErrorLogSummary(logs);
    expect(summary.latestPassId).toBeNull();
    expect(summary.activeTotal).toBe(2);
    expect(summary.activeByLevel?.warning).toBe(1);
    expect(summary.latestPreviewCode).toBe("preview_ready");
  });
});
