import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AUDIT_AI_SCHEMA } from "@/app/api/audit/modules/schema";
import { AUDIT_ADVANCED_ONLY_FIELDS, resolveAuditRun } from "@/lib/audit/audit-tier";
import type {
  AuditResponsesAttemptReceipt,
  RunWebsiteAuditFailure,
  RunWebsiteAuditSuccess,
  runWebsiteAudit,
} from "@/lib/audit/run-website-audit";
import { validateSsrfTarget } from "@/lib/ssrf-guard";
import { normalizeWebsiteInputUrl } from "@/lib/website-input-url";
import type { scrapeWebsite } from "@/lib/webscraper";
import type { AuditResult, WebsiteContent } from "@/types/audit";
import { createEvalRunId, type EvalDumpMode } from "./artifact-dump";
import type { CanonicalTopOutcome } from "./canonical";

type AuditRunResult = RunWebsiteAuditSuccess | RunWebsiteAuditFailure;
type Variant = "current" | "low";
type MeasurementStatus = "success" | "fallback" | "incomplete" | "provider_error" | "infra_error";
const quietLogger = { info() {}, warn() {}, error() {} };

export interface AuditLatencyDeps {
  scrape?: typeof scrapeWebsite;
  runAudit?: typeof runWebsiteAudit;
  environmentReady?: () => Promise<boolean>;
  now?: () => number;
}

export interface AuditFieldCoverage {
  schemaComplete: boolean;
  missingOrInvalidPaths: string[];
  advancedFields: Record<string, boolean>;
  improvementCount: number | null;
  minimumImprovements: number;
  structurePassed: boolean;
}

export interface AuditLatencyMeasurement {
  variant: Variant;
  status: MeasurementStatus;
  wallMs: number;
  providerMs: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  webSearchCalls: number | null;
  outputTextChars: number | null;
  missingMeasurements: string[];
  modelFallbackAttempts: number;
  usedReportFallback: boolean | null;
  usedModel: string | null;
  coverage: AuditFieldCoverage | null;
  attempts: AuditResponsesAttemptReceipt[];
}

export interface AuditLatencyCase {
  caseIndex: number;
  inputSha256: string | null;
  scrapeMs: number;
  scrapeStatus: "success" | "infra_error";
  executionOrder: Variant[];
  measurements: AuditLatencyMeasurement[];
  comparison: {
    comparable: boolean;
    wallReductionPercent: number | null;
    providerReductionPercent: number | null;
    cachedInputTokenDelta: number | null;
    webSearchCallDelta: number | null;
  };
}

export interface AuditLatencyReport {
  timestamp: string;
  outcome: CanonicalTopOutcome;
  preflight: "ready" | "unavailable";
  suiteAborted: boolean;
  abortedAfter: { caseIndex: number; variant: Variant } | null;
  skippedRuns: Array<{ caseIndex: number; variant: Variant; reason: "permanent_provider_fault" }>;
  cases: AuditLatencyCase[];
  artifactDir: string | null;
  artifactWriteError?: true;
  qualityAcceptance: "manual_review_required";
}

type SchemaNode = {
  type?: string;
  enum?: readonly unknown[];
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  items?: SchemaNode;
};

/** Structural evidence against the actual full schema, never a semantic quality score. */
function invalidSchemaPaths(value: unknown, schema: SchemaNode, at: string): string[] {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [at];
    const record = value as Record<string, unknown>;
    return (schema.required ?? []).flatMap((key) =>
      invalidSchemaPaths(record[key], schema.properties?.[key] ?? {}, `${at}.${key}`),
    );
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [at];
    return value.flatMap((item, index) => invalidSchemaPaths(item, schema.items ?? {}, `${at}[${index}]`));
  }
  if (schema.type === "string" && typeof value !== "string") return [at];
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return [at];
  if (schema.enum && !schema.enum.includes(value)) return [at];
  return [];
}

export function measureAuditFieldCoverage(result: AuditResult): AuditFieldCoverage {
  const invalid = invalidSchemaPaths(result, AUDIT_AI_SCHEMA, "$");
  const advancedFields = Object.fromEntries(AUDIT_ADVANCED_ONLY_FIELDS.map((field) => [
    field,
    !invalid.some((at) => at === `$.${field}` || at.startsWith(`$.${field}.`)),
  ]));
  const improvementCount = Array.isArray(result.improvements) ? result.improvements.length : null;
  const minimumImprovements = resolveAuditRun({ promptKind: "product", auditMode: "advanced" }).improvementTarget.min;
  return {
    schemaComplete: invalid.length === 0,
    missingOrInvalidPaths: invalid,
    advancedFields,
    improvementCount,
    minimumImprovements,
    structurePassed: invalid.length === 0 && improvementCount !== null && improvementCount >= minimumImprovements,
  };
}

export function normalizeAuditLatencyUrls(urls: string[]): string[] {
  if (urls.length < 1 || urls.length > 2) throw new Error("--audit-latency requires one or two explicit URLs (maximum four audits).");
  const normalized = urls.map((url) => {
    const value = normalizeWebsiteInputUrl(url);
    const checked = validateSsrfTarget(new URL(value));
    if (!checked.ok) throw new Error("--audit-latency requires public http(s) URLs without credentials.");
    return value;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error("--audit-latency URLs must be distinct.");
  return normalized;
}

function sumKnown(attempts: AuditResponsesAttemptReceipt[], field: keyof AuditResponsesAttemptReceipt): number | null {
  if (!attempts.length) return null;
  const values = attempts.map((attempt) => attempt[field]);
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function isPermanentProviderFault(attempt: AuditResponsesAttemptReceipt | undefined): boolean {
  return attempt?.outcome === "permanent_error" || attempt?.responseLifecycle === "permanent";
}

function measureVariant(variant: Variant, wallMs: number, attempts: AuditResponsesAttemptReceipt[], result: AuditRunResult | null): AuditLatencyMeasurement {
  const metrics = {
    providerMs: sumKnown(attempts, "elapsedMs"),
    inputTokens: sumKnown(attempts, "inputTokens"),
    cachedInputTokens: sumKnown(attempts, "cachedInputTokens"),
    outputTokens: sumKnown(attempts, "outputTokens"),
    reasoningTokens: sumKnown(attempts, "reasoningTokens"),
    webSearchCalls: sumKnown(attempts, "webSearchCalls"),
    outputTextChars: sumKnown(attempts, "outputTextChars"),
  };
  const missingMeasurements = Object.entries(metrics).filter(([, value]) => value === null).map(([key]) => key);
  const coverage = result?.ok ? measureAuditFieldCoverage(result.result) : null;
  const usedReportFallback = result?.ok
    ? result.usedFallback || ("_fallback" in result.result && result.result._fallback === true)
    : null;
  let status: MeasurementStatus;
  if (!result?.ok) {
    const terminal = attempts.at(-1);
    status = isPermanentProviderFault(terminal) || terminal?.responseStatus === "failed" ||
      terminal?.outcome === "transient_error" || terminal?.outcome === "timeout" ? "provider_error"
      : terminal?.outcome === "completed" || !terminal ? "infra_error" : "incomplete";
  } else if (usedReportFallback || attempts.length > 1) {
    status = "fallback";
  } else if (!coverage?.structurePassed || missingMeasurements.length || attempts.at(-1)?.outcome !== "completed") {
    status = "incomplete";
  } else {
    status = "success";
  }
  return {
    variant, status, wallMs, ...metrics, missingMeasurements,
    modelFallbackAttempts: Math.max(0, attempts.length - 1),
    usedReportFallback,
    usedModel: result?.ok ? result.usedModel : null,
    coverage, attempts,
  };
}

function compareMeasurements(measurements: AuditLatencyMeasurement[]): AuditLatencyCase["comparison"] {
  const current = measurements.find((entry) => entry.variant === "current");
  const low = measurements.find((entry) => entry.variant === "low");
  const comparable = current?.status === "success" && low?.status === "success" &&
    current.usedModel === low.usedModel &&
    current.attempts[0]?.reasoningEffort === low.attempts[0]?.reasoningEffort;
  const reduction = (before: number | null | undefined, after: number | null | undefined) =>
    comparable && before != null && after != null && before > 0 ? (before - after) / before * 100 : null;
  const delta = (before: number | null | undefined, after: number | null | undefined) =>
    before != null && after != null ? after - before : null;
  return {
    comparable,
    wallReductionPercent: reduction(current?.wallMs, low?.wallMs),
    providerReductionPercent: reduction(current?.providerMs, low?.providerMs),
    cachedInputTokenDelta: delta(current?.cachedInputTokens, low?.cachedInputTokens),
    webSearchCallDelta: delta(current?.webSearchCalls, low?.webSearchCalls),
  };
}

async function environmentReady(): Promise<boolean> {
  const { FEATURES, SECRETS } = await import("@/lib/config");
  return Boolean(SECRETS.openaiApiKey) && FEATURES.useResponsesApi;
}

/** Paid opt-in lane: no route handlers, database, credits or audit persistence. */
export async function runAuditLatencyEval(options: {
  urls: string[];
  dumpMode?: EvalDumpMode;
  print?: (line: string) => void;
  deps?: AuditLatencyDeps;
}): Promise<AuditLatencyReport> {
  const urls = normalizeAuditLatencyUrls(options.urls);
  const print = options.print ?? (() => undefined);
  const report: AuditLatencyReport = {
    timestamp: new Date().toISOString(), outcome: "infra_error", preflight: "unavailable",
    suiteAborted: false, abortedAfter: null, skippedRuns: [],
    cases: [], artifactDir: null, qualityAcceptance: "manual_review_required",
  };
  if (!(await (options.deps?.environmentReady ?? environmentReady)())) {
    print("Audit latency unavailable: OPENAI_API_KEY and the Responses API must be enabled. No audits ran.");
    return report;
  }
  report.preflight = "ready";
  const scrape = options.deps?.scrape ?? (await import("@/lib/webscraper")).scrapeWebsite;
  const runAudit = options.deps?.runAudit ?? (await import("@/lib/audit/run-website-audit")).runWebsiteAudit;
  const now = options.deps?.now ?? Date.now;
  const fullResults: Array<{ caseIndex: number; url: string; inputSha256: string; frozenWebsiteContent: WebsiteContent; variants: Array<{ variant: Variant; result: AuditRunResult | null }> }> = [];
  const run = resolveAuditRun({ promptKind: "product", auditMode: "advanced" });

  for (const [index, url] of urls.entries()) {
    const caseIndex = index + 1;
    const scrapeStarted = now();
    let snapshot: string;
    try {
      snapshot = JSON.stringify(await scrape(url, { maxPages: run.maxPages, logger: quietLogger }));
    } catch {
      report.cases.push({
        caseIndex, inputSha256: null, scrapeMs: Math.max(0, now() - scrapeStarted), scrapeStatus: "infra_error",
        executionOrder: [], measurements: [], comparison: compareMeasurements([]),
      });
      print(`[audit-latency] case=${caseIndex} scrape=INFRA_ERROR; no audits ran for this input.`);
      continue;
    }
    const inputSha256 = createHash("sha256").update(snapshot).digest("hex");
    const entry: AuditLatencyCase = {
      caseIndex, inputSha256, scrapeMs: Math.max(0, now() - scrapeStarted), scrapeStatus: "success",
      executionOrder: index % 2 === 0 ? ["current", "low"] : ["low", "current"],
      measurements: [], comparison: compareMeasurements([]),
    };
    const full = { caseIndex, url, inputSha256, frozenWebsiteContent: JSON.parse(snapshot) as WebsiteContent, variants: [] as Array<{ variant: Variant; result: AuditRunResult | null }> };
    fullResults.push(full);
    for (const variant of entry.executionOrder) {
      const attempts: AuditResponsesAttemptReceipt[] = [];
      const started = now();
      let result: AuditRunResult | null = null;
      try {
        result = await runAudit({
          normalizedUrl: url, auditMode: "advanced", promptKind: "product",
          requestId: `audit-latency-${caseIndex}-${variant}`, requestStartTime: started,
        }, {
          frozenWebsiteContent: JSON.parse(snapshot) as WebsiteContent,
          ...(variant === "low" ? { responsesTextVerbosity: "low" as const } : {}),
          onResponsesAttempt: (receipt) => attempts.push({ ...receipt }), logger: quietLogger,
        });
      } catch {
        // The runtime receipt carries allowlisted fault evidence. Never log raw errors.
      }
      const measurement = measureVariant(variant, Math.max(0, now() - started), attempts, result);
      entry.measurements.push(measurement);
      full.variants.push({ variant, result });
      print(`[audit-latency] case=${caseIndex} variant=${variant} status=${measurement.status} wall_ms=${measurement.wallMs} provider_ms=${measurement.providerMs ?? "unknown"} scrape_ms=${entry.scrapeMs} output_tokens=${measurement.outputTokens ?? "unknown"} cached_input=${measurement.cachedInputTokens ?? "unknown"} searches=${measurement.webSearchCalls ?? "unknown"}`);
      if (isPermanentProviderFault(attempts.at(-1))) {
        report.suiteAborted = true;
        report.abortedAfter = { caseIndex, variant };
        for (const pending of entry.executionOrder.slice(entry.measurements.length)) {
          report.skippedRuns.push({ caseIndex, variant: pending, reason: "permanent_provider_fault" });
        }
        for (let later = index + 1; later < urls.length; later += 1) {
          const order: Variant[] = later % 2 === 0 ? ["current", "low"] : ["low", "current"];
          for (const pending of order) report.skippedRuns.push({ caseIndex: later + 1, variant: pending, reason: "permanent_provider_fault" });
        }
        print(`[audit-latency] permanent provider fault after case=${caseIndex} variant=${variant}; skipped ${report.skippedRuns.length} remaining paid audit(s).`);
        break;
      }
    }
    entry.comparison = compareMeasurements(entry.measurements);
    report.cases.push(entry);
    if (report.suiteAborted) break;
  }

  const statuses = report.cases.flatMap((entry) => entry.measurements.map((measurement) => measurement.status));
  report.outcome = report.suiteAborted || statuses.includes("provider_error") ? "provider_error"
    : report.cases.some((entry) => entry.scrapeStatus === "infra_error") || statuses.includes("infra_error") ? "infra_error"
      : report.cases.every((entry) => entry.comparison.comparable) ? "pass" : "fail";
  if (options.dumpMode === "all" || (options.dumpMode === "failed" && report.outcome !== "pass")) {
    const dir = path.join(process.cwd(), "data", "eval-runs", "audit-latency", `${createEvalRunId()}-${randomUUID().slice(0, 8)}`);
    try {
      await mkdir(dir, { recursive: true });
      report.artifactDir = dir;
      await writeFile(path.join(dir, "full-results.json"), `${JSON.stringify(fullResults, null, 2)}\n`, "utf8");
      await writeFile(path.join(dir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } catch {
      report.artifactDir = null;
      report.artifactWriteError = true;
      if (report.outcome !== "provider_error") report.outcome = "infra_error";
      print("Audit latency artifact write failed (INFRA_ERROR); complete reports were not confirmed saved.");
    }
  }
  print("Audit latency is an experiment: review complete reports manually. Order, input cache, web research and provider load can affect the observed difference.");
  return report;
}
