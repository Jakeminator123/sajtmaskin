import { describe, expect, it } from "vitest";
import { buildErrorLogSummary } from "./summary";
import { partitionErrorLogsByPass } from "@/lib/builder/version-diagnostics-summary";

describe("partitionErrorLogsByPass", () => {
  it("keeps explicit passes and passless observations separate in stable newest-first order", () => {
    const latestFirst = [
      { level: "info", message: "latest first", meta: { logPassId: "pass-new" } },
      { level: "warning", message: "unscoped first", meta: {} },
      { level: "error", message: "older first", meta: { logPassId: "pass-old" } },
      { level: "info", message: "latest second", meta: { logPassId: "pass-new" } },
      { level: "info", message: "oldest", meta: { logPassId: "pass-oldest" } },
      { level: "info", message: "older second", meta: { logPassId: "pass-old" } },
      { level: "info", message: "unscoped second", meta: null },
    ];

    const partition = partitionErrorLogsByPass(latestFirst);

    expect(partition.latestPassId).toBe("pass-new");
    expect(partition.latestPassLogs.map((log) => log.message)).toEqual([
      "latest first",
      "latest second",
    ]);
    expect(partition.unscopedLogs.map((log) => log.message)).toEqual([
      "unscoped first",
      "unscoped second",
    ]);
    expect(partition.historicalPasses.map((pass) => pass.passId)).toEqual([
      "pass-old",
      "pass-oldest",
    ]);
    expect(partition.historicalPasses[0]?.logs.map((log) => log.message)).toEqual([
      "older first",
      "older second",
    ]);
  });

  it("keeps legacy all-passless logs unscoped without inventing a current pass", () => {
    const logs = [
      { level: "warning", message: "legacy first", meta: {} },
      { level: "info", message: "legacy second" },
    ];

    const partition = partitionErrorLogsByPass(logs);

    expect(partition.latestPassId).toBeNull();
    expect(partition.latestPassLogs).toEqual([]);
    expect(partition.historicalPasses).toEqual([]);
    expect(partition.unscopedLogs).toEqual(logs);
  });
});

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

  it("does not keep older passless quality-gate errors active after a newer clean pass", () => {
    const logs = [
      {
        level: "info",
        category: "preflight:summary",
        message: "new pass ok",
        meta: { logPassId: "pass-new" },
      },
      {
        level: "error",
        category: "preflight:quality-gate",
        message: "older server verify failed",
        meta: { checks: [{ check: "typecheck", passed: false }] },
      },
      {
        level: "error",
        category: "preflight:summary",
        message: "older preflight failed",
        meta: { logPassId: "pass-old" },
      },
    ];

    const summary = buildErrorLogSummary(logs);
    expect(summary.latestPassId).toBe("pass-new");
    expect(summary.activeTotal).toBe(1);
    expect(summary.activeByLevel?.error).toBe(0);
  });

  it("keeps passless lifecycle logs active when they are newer than the latest pass", () => {
    const logs = [
      {
        level: "error",
        category: "preflight:quality-gate",
        message: "current server verify failed",
        meta: { checks: [{ check: "typecheck", passed: false }] },
      },
      {
        level: "info",
        category: "preflight:summary",
        message: "new pass ok",
        meta: { logPassId: "pass-new" },
      },
    ];

    const summary = buildErrorLogSummary(logs);
    expect(summary.latestPassId).toBe("pass-new");
    expect(summary.activeTotal).toBe(2);
    expect(summary.activeByLevel?.error).toBe(1);
  });

  it("never falls back to historical signals when an explicit latest pass exists", () => {
    const logs = [
      {
        level: "info",
        category: "editorial",
        message: "current pass has no lifecycle signal",
        meta: { logPassId: "pass-new" },
      },
      {
        level: "error",
        category: "preflight:summary",
        message: "historical preflight",
        meta: { logPassId: "pass-old" },
      },
      {
        level: "error",
        category: "quality-gate:typecheck",
        message: "historical quality gate",
        meta: { logPassId: "pass-old" },
      },
      {
        level: "error",
        category: "preview",
        message: "historical preview",
        meta: { logPassId: "pass-old", previewCode: "preview_build_error" },
      },
    ];

    const summary = buildErrorLogSummary(logs);

    expect(summary.latestPreflight).toBeNull();
    expect(summary.latestQualityGate).toBeNull();
    expect(summary.latestRender).toBeNull();
    expect(summary.latestPreviewCode).toBeNull();
  });
});
