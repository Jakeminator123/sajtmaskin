import { isGenericIntegrationName, resolveIntegrationDisplayName } from "@/lib/integrations/suggestion-display";
import type { ToolUIPart } from "ai";
import type {
  IntegrationCardData,
  PostCheckSummary,
  QualityGateCheckInfo,
  QualityGateSummary,
  ServerRepairSummary,
  ToolIntegrationSummary,
} from "./types";
import type { LiveReviewResult, LiveReviewSkipReason } from "@/lib/gen/verify/live-review-types";
import { parseReviewDecision } from "@/lib/gen/verify/live-review-types";

export function resolveToolLabels(tool: Partial<ToolUIPart> & { type?: string }) {
  const rawToolType = typeof tool.type === "string" ? `${tool.type}` : "";
  const toolType = (() => {
    if (!rawToolType || rawToolType === "tool") return "tool-unknown";
    if (rawToolType.startsWith("tool-")) return rawToolType;
    if (rawToolType.startsWith("tool:")) return `tool-${rawToolType.slice(5)}`;
    if (rawToolType.startsWith("tool_")) return `tool-${rawToolType.slice(5)}`;
    return `tool-${rawToolType}`;
  })() as ToolUIPart["type"];
  const toolTitle =
    typeof (tool as { name?: string }).name === "string"
      ? (tool as { name?: string }).name
      : typeof (tool as { toolName?: string }).toolName === "string"
        ? (tool as { toolName?: string }).toolName
        : toolType.replace(/^tool[-_:]/, "") || "Tool";

  return { toolType, toolTitle };
}

export function isIntegrationOrEnvToolPart(
  tool: Partial<ToolUIPart> & { type?: string },
): boolean {
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const name =
    `${(tool as { name?: string }).name ?? ""} ${(tool as { toolName?: string }).toolName ?? ""}`
      .toLowerCase();
  return type.includes("integration") || name.includes("integration") || looksLikeEnvVarEvent(type) || looksLikeEnvVarEvent(name);
}

export function looksLikeEnvVarEvent(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized.includes("environment")) return true;
  if (normalized.includes("env-var") || normalized.includes("env_var") || normalized.includes("envvar")) {
    return true;
  }
  if (normalized.includes("env") && (normalized.includes("var") || normalized.includes("variable"))) {
    return true;
  }
  return false;
}

export function getToolIntegrationSummary(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): ToolIntegrationSummary | null {
  const rawName =
    extractIntegrationName(tool.input) ||
    extractIntegrationName(tool.output) ||
    extractIntegrationName(tool);
  const provider =
    extractIntegrationProvider(tool.input) ||
    extractIntegrationProvider(tool.output) ||
    extractIntegrationProvider(tool);
  const name = resolveIntegrationDisplayName({ name: rawName, provider });
  const envKeys = dedupeStrings([
    ...extractEnvKeys(tool.input),
    ...extractEnvKeys(tool.output),
  ]);
  let status = extractStatus(tool.output) || extractStatus(tool.input);
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  if (!status && type.includes("added-environment-variables")) {
    status = "Miljövariabler tillagda";
  }
  if (!status && type.includes("added-integration")) {
    status = "Integration tillagd";
  }

  if (!name && envKeys.length === 0 && !status) return null;
  return {
    name: name || undefined,
    envKeys: envKeys.length > 0 ? envKeys : undefined,
    status: status || undefined,
  };
}

export function getIntegrationCardData(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): IntegrationCardData | null {
  const summary = getToolIntegrationSummary(tool);
  const output =
    tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  const intentRaw = typeof output?.intent === "string" ? output.intent : null;
  const intentLabel =
    intentRaw === "install"
      ? "Installera"
      : intentRaw === "connect"
        ? "Koppla"
        : intentRaw === "env_vars"
          ? "Konfigurera miljövariabler"
          : intentRaw === "configure"
            ? "Konfigurera"
            : undefined;
  const marketplaceUrl =
    (typeof output?.marketplaceUrl === "string" && output.marketplaceUrl) ||
    (typeof output?.installUrl === "string" && output.installUrl) ||
    null;
  const sourceEvent = typeof output?.sourceEvent === "string" ? output.sourceEvent : null;
  const name = resolveIntegrationDisplayName({
    name: summary?.name ?? (typeof output?.name === "string" ? output.name : null),
    provider:
      typeof output?.provider === "string"
        ? output.provider
        : typeof output?.key === "string"
          ? output.key
          : null,
  });
  const envKeys = summary?.envKeys ?? [];
  const status = summary?.status || (typeof output?.status === "string" ? output.status : undefined);

  if (!name && envKeys.length === 0 && !marketplaceUrl && !intentLabel) return null;
  return {
    name: name ?? undefined,
    status,
    intentLabel,
    envKeys,
    marketplaceUrl,
    sourceEvent,
  };
}

function looksLikeFilePath(value: string): boolean {
  return /[/\\]/.test(value) || /\.\w{1,4}$/.test(value);
}

function extractIntegrationName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || looksLikeFilePath(trimmed) || isGenericIntegrationName(trimmed)) return null;
    return trimmed;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [obj.integration, obj.service, obj.name, obj.title];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (!trimmed || looksLikeFilePath(trimmed) || isGenericIntegrationName(trimmed)) continue;
      return trimmed;
    }
  }
  return null;
}

function extractIntegrationProvider(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.provider, obj.key, obj.integration];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && !looksLikeFilePath(trimmed)) {
        return trimmed;
      }
    }
  }
  return null;
}

function extractEnvKeys(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return looksLikeEnvKey(value) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractEnvKeys(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const directKey = typeof obj.key === "string" && looksLikeEnvKey(obj.key) ? obj.key.trim() : null;
    const containers = [
      obj.envVars,
      obj.environmentVariables,
      obj.requiredEnv,
      obj.variables,
      obj.vars,
      obj.keys,
      obj.env,
    ];
    const fromContainers = containers.flatMap((item) => extractEnvKeys(item));
    if (directKey) fromContainers.push(directKey);
    if (fromContainers.length > 0) return fromContainers;

    if (Array.isArray(obj.steps)) {
      const fromSteps = (obj.steps as unknown[])
        .filter((step): step is string => typeof step === "string")
        .flatMap((step) => {
          const match = step.match(/Milj.variabler:\s*(.+)/i);
          if (!match) return [];
          return match[1].split(",").map((key) => key.trim()).filter(looksLikeEnvKey);
        });
      if (fromSteps.length > 0) return fromSteps;
    }
  }
  return [];
}

function extractStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidate =
    (typeof obj.status === "string" && obj.status) ||
    (typeof obj.state === "string" && obj.state) ||
    (typeof obj.result === "string" && obj.result) ||
    null;
  return candidate ? String(candidate) : null;
}

function looksLikeEnvKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z][A-Z0-9_]+$/.test(trimmed);
}

export function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function getToolStateLabel(state: ToolUIPart["state"]) {
  switch (state) {
    case "approval-requested":
      return "Behöver godkännande";
    case "input-streaming":
      return "Förbereder";
    case "input-available":
      return "Redo";
    case "output-available":
      return "Klart";
    case "output-error":
      return "Fel";
    case "output-denied":
      return "Nekad";
    case "approval-responded":
      return "Besvarad";
    default:
      return "Åtgärd";
  }
}

function getPostCheckSummary(output: unknown): PostCheckSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  const summary =
    obj.summary && typeof obj.summary === "object"
      ? (obj.summary as Record<string, unknown>)
      : null;
  const toNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const toString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const warningsValue = summary?.warnings ?? obj.warnings;
  const warningsCount = Array.isArray(warningsValue) ? warningsValue.length : toNumber(warningsValue);

  const summaryData: PostCheckSummary = {
    files: toNumber(summary?.files ?? obj.files),
    added: toNumber(summary?.added ?? obj.added),
    modified: toNumber(summary?.modified ?? obj.modified),
    removed: toNumber(summary?.removed ?? obj.removed),
    warnings: warningsCount,
    demoUrl: toString(obj.demoUrl),
    previousVersionId: toString(obj.previousVersionId),
    provisional: Boolean(summary?.provisional ?? obj.provisional),
    qualityGatePending: Boolean(summary?.qualityGatePending ?? obj.qualityGatePending),
    autoFixQueued: Boolean(summary?.autoFixQueued ?? obj.autoFixQueued),
  };

  const hasAnyValue = [
    summaryData.files,
    summaryData.added,
    summaryData.modified,
    summaryData.removed,
    summaryData.warnings,
    summaryData.demoUrl,
    summaryData.previousVersionId,
    summaryData.provisional ? true : null,
    summaryData.qualityGatePending ? true : null,
    summaryData.autoFixQueued ? true : null,
  ].some((value) => value !== null);
  return hasAnyValue ? summaryData : null;
}

function getQualityGateSummary(output: unknown): QualityGateSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  if (obj.skipped) {
    return {
      passed: true,
      skipped: true,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
      checks: [],
      verifyLaneDurationMs: null,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
      visualQA: null,
    };
  }
  const checks = Array.isArray(obj.checks)
    ? (obj.checks as QualityGateCheckInfo[]).filter((check) => check && typeof check.check === "string")
    : [];
  if (checks.length === 0) return null;
  return {
    passed: Boolean(obj.passed),
    designAdvisory: obj.designAdvisory === true,
    qualityGateAdvisory: obj.qualityGateAdvisory === true,
    advisoryChecks: Array.isArray(obj.advisoryChecks)
      ? obj.advisoryChecks.filter(
          (check): check is string => typeof check === "string" && check.trim().length > 0,
        )
      : [],
    skipped: false,
    checks,
    verifyLaneDurationMs:
      typeof obj.verifyLaneDurationMs === "number" ? obj.verifyLaneDurationMs : null,
    firstFailureCheck:
      typeof obj.firstFailureCheck === "string" && obj.firstFailureCheck.trim()
        ? obj.firstFailureCheck.trim()
        : null,
    jobStartedAt:
      typeof obj.jobStartedAt === "string" && obj.jobStartedAt.trim()
        ? obj.jobStartedAt.trim()
        : null,
    jobFinishedAt:
      typeof obj.jobFinishedAt === "string" && obj.jobFinishedAt.trim()
        ? obj.jobFinishedAt.trim()
        : null,
    visualQA:
      obj.visualQA &&
      typeof obj.visualQA === "object" &&
      typeof (obj.visualQA as Record<string, unknown>).overallScore === "number" &&
      typeof (obj.visualQA as Record<string, unknown>).passed === "boolean" &&
      Array.isArray((obj.visualQA as Record<string, unknown>).checks)
        ? {
            overallScore: (obj.visualQA as Record<string, unknown>).overallScore as number,
            passed: (obj.visualQA as Record<string, unknown>).passed as boolean,
            checks: ((obj.visualQA as Record<string, unknown>).checks as Array<Record<string, unknown>>)
              .filter((check) => check && typeof check.check === "string")
              .map((check) => ({
                check: String(check.check),
                passed: check.passed === true,
                score:
                  typeof check.score === "number" && Number.isFinite(check.score) ? check.score : 0,
                detail: typeof check.detail === "string" ? check.detail : "",
              })),
          }
        : null,
  };
}

function getServerRepairSummary(output: unknown): ServerRepairSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  if (typeof obj.repaired !== "boolean") return null;
  return {
    repaired: obj.repaired,
    status: typeof obj.status === "string" && obj.status.trim() ? obj.status.trim() : null,
    reason: typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : null,
    method: typeof obj.method === "string" && obj.method.trim() ? obj.method.trim() : null,
    newVersionId:
      typeof obj.newVersionId === "string" && obj.newVersionId.trim()
        ? obj.newVersionId.trim()
        : null,
    remainingErrors:
      typeof obj.remainingErrors === "number" && Number.isFinite(obj.remainingErrors)
        ? obj.remainingErrors
        : null,
    improvedSyntax: typeof obj.improvedSyntax === "boolean" ? obj.improvedSyntax : null,
    earlyStopReason:
      typeof obj.earlyStopReason === "string" && obj.earlyStopReason.trim()
        ? obj.earlyStopReason.trim()
        : null,
  };
}

export function getLiveReviewResult(output: unknown): LiveReviewResult | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  const fromPostcheck =
    obj.productPostcheck && typeof obj.productPostcheck === "object"
      ? (obj.productPostcheck as Record<string, unknown>).liveReview
      : null;
  const nested =
    obj.liveReview && typeof obj.liveReview === "object"
      ? (obj.liveReview as Record<string, unknown>)
      : fromPostcheck && typeof fromPostcheck === "object"
        ? (fromPostcheck as Record<string, unknown>)
        : obj;
  if (nested.status === "skipped" && typeof nested.reason === "string") {
    return {
      status: "skipped",
      reason: nested.reason as LiveReviewSkipReason,
      detail: typeof nested.detail === "string" ? nested.detail : undefined,
    };
  }
  if (nested.status === "completed" && nested.decision) {
    return {
      status: "completed",
      decision: parseReviewDecision(nested.decision),
      durationMs: typeof nested.durationMs === "number" ? nested.durationMs : 0,
      modelId: typeof nested.modelId === "string" ? nested.modelId : "",
    };
  }
  return null;
}

export function extractToolSummaries(toolType: string, output: unknown) {
  const isPostCheck = toolType === "tool-post-check";
  const isQualityGate = toolType === "tool-quality-gate";
  const isLiveReview = toolType === "tool-live-review";
  return {
    postCheck: isPostCheck ? getPostCheckSummary(output) : null,
    qualityGate: isQualityGate ? getQualityGateSummary(output) : null,
    serverRepair: isQualityGate ? getServerRepairSummary(output) : null,
    // ONLY the dedicated part renders the verdict. The post-check output also
    // embeds `liveReview`, but a completed review always appends the dedicated
    // part too, so surfacing it from tool-post-check rendered the row twice
    // (bugbot medium, 2026-08-19).
    liveReview: isLiveReview ? getLiveReviewResult(output) : null,
  };
}
