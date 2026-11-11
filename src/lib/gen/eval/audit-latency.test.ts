import { describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { AUDIT_AI_SCHEMA } from "@/app/api/audit/modules/schema";
import type { AuditResponsesAttemptReceipt } from "@/lib/audit/run-website-audit";
import type { AuditResult, WebsiteContent } from "@/types/audit";
import { measureAuditFieldCoverage, normalizeAuditLatencyUrls, runAuditLatencyEval, type AuditLatencyDeps } from "./audit-latency";

// Valid structural fixture from the current full schema; individual tests remove
// or corrupt real fields. This deliberately makes no assertion of report quality.
function schemaValue(value: unknown): unknown {
  const schema = value as { type: string; enum?: unknown[]; properties?: Record<string, unknown>; items?: unknown };
  if (schema.enum) return schema.enum[0];
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child]) => [key, schemaValue(child)]));
  if (schema.type === "array") return [schemaValue(schema.items)];
  if (schema.type === "number") return 50;
  return "Private customer report marker";
}

function fullAudit(): AuditResult {
  const audit = schemaValue(AUDIT_AI_SCHEMA) as AuditResult;
  audit.audit_mode = "advanced";
  audit.improvements = Array.from({ length: 12 }, () => ({ ...audit.improvements![0] }));
  return audit;
}

const website: WebsiteContent = {
  url: "https://example.com/", title: "Private site content marker", description: "Services",
  headings: ["Services"], text: "Frozen content", textPreview: "Frozen content", wordCount: 300,
  images: 1, links: { internal: 1, external: 0 }, meta: {}, hasSSL: true, responseTime: 10,
};

function receipt(overrides: Partial<AuditResponsesAttemptReceipt> = {}): AuditResponsesAttemptReceipt {
  return {
    attemptIndex: 1, candidateCount: 1, workloadId: "audit_structured", model: "test-model",
    reasoningEffort: "medium", attemptBudgetMs: 270_000, remainingTotalBudgetMs: 270_000,
    elapsedMs: 100, totalElapsedMs: 101, scrapeElapsedMs: 0,
    inputTokens: 100, cachedInputTokens: 0, outputTokens: 300, reasoningTokens: 50,
    outputTextChars: 500, webSearchCalls: 2, outcome: "completed", signalReason: null,
    errorClass: null, errorCode: null, httpStatus: null, responseStatus: "completed", responseLifecycle: "completed", incompleteReason: null,
    ...overrides,
  };
}

function dependencies(options: { missingUsage?: boolean; usedFallback?: boolean } = {}): AuditLatencyDeps {
  let clock = 1_000;
  return {
    now: () => { clock += 10; return clock; },
    environmentReady: vi.fn(async () => true),
    scrape: vi.fn(async () => structuredClone(website)),
    runAudit: vi.fn(async (_input, runOptions) => {
      const low = runOptions?.responsesTextVerbosity === "low";
      runOptions?.onResponsesAttempt?.(receipt({
        elapsedMs: low ? 80 : 100,
        cachedInputTokens: low ? 30 : 0,
        outputTokens: options.missingUsage ? null : low ? 200 : 300,
        webSearchCalls: low ? 1 : 2,
      }));
      return { ok: true as const, result: fullAudit(), usedFallback: options.usedFallback ?? false, usedModel: "test-model" };
    }),
  };
}

describe("audit field coverage", () => {
  it("checks every required full-schema field and at least twelve improvements", () => {
    expect(measureAuditFieldCoverage(fullAudit())).toMatchObject({ schemaComplete: true, structurePassed: true, improvementCount: 12, minimumImprovements: 12 });
    const fewer = fullAudit();
    fewer.improvements!.pop();
    expect(measureAuditFieldCoverage(fewer)).toMatchObject({ schemaComplete: true, structurePassed: false, improvementCount: 11 });
    const partial = fullAudit();
    delete (partial.business_profile as Partial<NonNullable<AuditResult["business_profile"]>>).business_model;
    expect(measureAuditFieldCoverage(partial)).toMatchObject({ schemaComplete: false, structurePassed: false, advancedFields: { business_profile: false } });
    expect(measureAuditFieldCoverage(partial).missingOrInvalidPaths).toContain("$.business_profile.business_model");
    const wrongShape = fullAudit();
    wrongShape.site_content!.sections[0].type = "unknown" as "hero";
    expect(measureAuditFieldCoverage(wrongShape).missingOrInvalidPaths).toContain("$.site_content.sections[0].type");
  });
});

describe("paid audit-latency experiment", () => {
  it("scrapes once per URL, clones the identical frozen input, alternates order and never requests public/basic audits", async () => {
    const deps = dependencies();
    const seenInputs: WebsiteContent[] = [];
    const runAudit = deps.runAudit!;
    deps.runAudit = vi.fn(async (input, options) => {
      seenInputs.push(structuredClone(options!.frozenWebsiteContent!));
      options!.frozenWebsiteContent!.text = "An accidental mutation must not reach the other variant";
      return runAudit(input, options);
    });
    const print = vi.fn();
    const report = await runAuditLatencyEval({ urls: ["example.com", "https://example.org"], deps, print });
    expect(deps.scrape).toHaveBeenCalledTimes(2);
    expect(deps.scrape).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ maxPages: 4, logger: expect.any(Object) }));
    expect(deps.runAudit).toHaveBeenCalledTimes(4);
    expect(seenInputs).toEqual([website, website, website, website]);
    expect(vi.mocked(deps.runAudit).mock.calls.map(([input, options]) => [input.promptKind, input.auditMode, options?.responsesTextVerbosity])).toEqual([
      ["product", "advanced", undefined], ["product", "advanced", "low"],
      ["product", "advanced", "low"], ["product", "advanced", undefined],
    ]);
    expect(report.outcome).toBe("pass");
    expect(report.qualityAcceptance).toBe("manual_review_required");
    expect(report.cases[0]).toMatchObject({ scrapeMs: 10, comparison: { comparable: true, providerReductionPercent: 20, cachedInputTokenDelta: 30, webSearchCallDelta: -1 } });
    expect(report.cases[0].inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(report)).not.toMatch(/Private customer|Private site|https:\/\/example/);
    expect(JSON.stringify(print.mock.calls)).not.toMatch(/Private customer|Private site/);
    expect(report.artifactDir).toBeNull();
  });

  it("rejects excess, duplicate, credentialed and private URLs before any scrape or paid work", async () => {
    const deps = dependencies();
    for (const urls of [[], ["one.com", "two.com", "three.com"], ["https://example.com", "example.com"], ["http://127.0.0.1"], ["https://user:secret@example.com"], ["ftp://example.com"]]) {
      await expect(runAuditLatencyEval({ urls, deps })).rejects.toThrow();
    }
    expect(deps.scrape).not.toHaveBeenCalled();
    expect(deps.runAudit).not.toHaveBeenCalled();
    expect(normalizeAuditLatencyUrls([" HTTPS://Example.com/path?a=1#view "])).toEqual(["https://example.com/path?a=1#view"]);
  });

  it("does not start scraping or models when Responses or the key is unavailable", async () => {
    const deps = dependencies();
    deps.environmentReady = async () => false;
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps });
    expect(report).toMatchObject({ outcome: "infra_error", preflight: "unavailable", cases: [] });
    expect(deps.scrape).not.toHaveBeenCalled();
    expect(deps.runAudit).not.toHaveBeenCalled();
  });

  it("keeps missing provider usage null and refuses a green comparison", async () => {
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps: dependencies({ missingUsage: true }) });
    expect(report.outcome).toBe("fail");
    expect(report.cases[0].measurements[0]).toMatchObject({ status: "incomplete", outputTokens: null, missingMeasurements: ["outputTokens"] });
    expect(report.cases[0].comparison).toMatchObject({ comparable: false, wallReductionPercent: null, providerReductionPercent: null });
  });

  it("separates report fallback from successful measurements", async () => {
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps: dependencies({ usedFallback: true }) });
    expect(report.outcome).toBe("fail");
    expect(report.cases[0].measurements[0]).toMatchObject({ status: "fallback", usedReportFallback: true });
    expect(report.cases[0].comparison.comparable).toBe(false);
  });

  it("detects the runtime's embedded fallback marker even when usedFallback was not set", async () => {
    const deps = dependencies();
    const runAudit = deps.runAudit!;
    deps.runAudit = async (input, options) => {
      const result = await runAudit(input, options);
      if (result.ok) Object.assign(result.result, { _fallback: true });
      return result;
    };
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps });
    expect(report.outcome).toBe("fail");
    expect(report.cases[0].measurements[0]).toMatchObject({ status: "fallback", usedReportFallback: true, coverage: { structurePassed: true } });
    expect(report.cases[0].comparison).toMatchObject({ comparable: false, providerReductionPercent: null });
  });

  it("classifies scrape failure as infra and does not invent zero-valued audit measurements", async () => {
    const deps = dependencies();
    deps.scrape = vi.fn(async () => { throw new Error("Private scrape failure marker"); });
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps });
    expect(deps.runAudit).not.toHaveBeenCalled();
    expect(report).toMatchObject({ outcome: "infra_error", cases: [{ scrapeStatus: "infra_error", inputSha256: null, measurements: [] }] });
    expect(JSON.stringify(report)).not.toContain("Private scrape failure marker");
  });

  it.each(["provider_error", "incomplete", "infra_error"] as const)("keeps %s separate from a successful audit", async (status) => {
    const deps = dependencies();
    deps.runAudit = vi.fn(async (_input, options) => {
      if (status !== "infra_error") options?.onResponsesAttempt?.(receipt({
        outcome: status === "incomplete" ? "transient_status" : "permanent_error",
        responseStatus: status === "incomplete" ? "incomplete" : null,
        responseLifecycle: status === "incomplete" ? "transient" : null,
        incompleteReason: status === "incomplete" ? "max_output_tokens" : null,
        inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null,
        outputTextChars: null, webSearchCalls: null,
      }));
      throw new Error("Private provider error marker");
    });
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps });
    expect(report.cases[0].measurements[0]).toMatchObject({ status, inputTokens: null, coverage: null });
    expect(report.outcome).toBe(status === "incomplete" ? "fail" : status);
    expect(JSON.stringify(report)).not.toContain("Private provider error marker");
  });

  it("classifies a local failure after a completed provider response as infra", async () => {
    const deps = dependencies();
    deps.runAudit = async (_input, options) => {
      options?.onResponsesAttempt?.(receipt());
      throw new Error("Private local post-processing fault");
    };
    const report = await runAuditLatencyEval({ urls: ["example.com"], deps });
    expect(report.outcome).toBe("infra_error");
    expect(report.cases[0].measurements[0].status).toBe("infra_error");
  });

  it.each([
    { outcome: "permanent_error", errorCode: "insufficient_quota", responseStatus: null, responseLifecycle: null },
    { outcome: "permanent_error", errorCode: "invalid_api_key", responseStatus: null, responseLifecycle: null },
    { outcome: "rejected_status", errorCode: "invalid_prompt", responseStatus: "failed", responseLifecycle: "permanent" },
    { outcome: "rejected_status", errorCode: null, responseStatus: "incomplete", responseLifecycle: "permanent", incompleteReason: "content_filter" },
  ] as const)("stops remaining paid work after the permanent $errorCode receipt", async (fault) => {
    const deps = dependencies();
    deps.runAudit = vi.fn(async (_input, options) => {
      options?.onResponsesAttempt?.(receipt(fault));
      throw new Error("Do not continue a permanently unavailable provider");
    });
    const report = await runAuditLatencyEval({ urls: ["example.com", "example.org"], deps });
    expect(deps.runAudit).toHaveBeenCalledTimes(1);
    expect(deps.scrape).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ outcome: "provider_error", suiteAborted: true, abortedAfter: { caseIndex: 1, variant: "current" } });
    expect(report.skippedRuns).toEqual([
      { caseIndex: 1, variant: "low", reason: "permanent_provider_fault" },
      { caseIndex: 2, variant: "low", reason: "permanent_provider_fault" },
      { caseIndex: 2, variant: "current", reason: "permanent_provider_fault" },
    ]);
    expect(report.cases[0].comparison).toMatchObject({ comparable: false, providerReductionPercent: null });
  });

  it.each([
    { outcome: "transient_error", errorCode: "rate_limit_exceeded", responseStatus: null, responseLifecycle: null },
    { outcome: "transient_error", errorCode: "ECONNRESET", responseStatus: null, responseLifecycle: null },
    { outcome: "transient_status", errorCode: "server_error", responseStatus: "failed", responseLifecycle: "transient" },
    { outcome: "rejected_status", errorCode: null, responseStatus: "queued", responseLifecycle: "uncertain" },
  ] as const)("does not report transient/uncertain $errorCode/$responseStatus as permanent", async (fault) => {
    const deps = dependencies();
    deps.runAudit = vi.fn(async (_input, options) => {
      options?.onResponsesAttempt?.(receipt(fault));
      return { ok: false as const, status: 502, error: "Unavailable attempt" };
    });
    const report = await runAuditLatencyEval({ urls: ["example.com", "example.org"], deps });
    expect(deps.runAudit).toHaveBeenCalledTimes(4);
    expect(report.suiteAborted).toBe(false);
    expect(report.skippedRuns).toEqual([]);
    expect(report.outcome).not.toBe("pass");
  });

  it("only dumps full reports with the explicit canonical dump flag into the ignored eval area", async () => {
    const passing = await runAuditLatencyEval({ urls: ["example.com"], dumpMode: "failed", deps: dependencies() });
    expect(passing.artifactDir).toBeNull();
    const report = await runAuditLatencyEval({ urls: ["example.com"], dumpMode: "all", deps: dependencies() });
    const dir = path.resolve(report.artifactDir!);
    const root = path.resolve(process.cwd(), "data", "eval-runs", "audit-latency");
    expect(path.dirname(dir)).toBe(root);
    try {
      const summary = await readFile(path.join(dir, "summary.json"), "utf8");
      const full = await readFile(path.join(dir, "full-results.json"), "utf8");
      expect(summary).not.toContain("Private customer report marker");
      expect(full).toContain("Private customer report marker");
      expect(full).toContain("Private site content marker");
      expect(JSON.parse(full)[0].frozenWebsiteContent).toEqual(website);
      expect(full).not.toContain("promptContent");
    } finally {
      // Delete only this run's exact directory after checking the absolute parent.
      if (path.dirname(dir) === root) await rm(dir, { recursive: true, force: true });
    }
  });
});
