import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { UiMessagePart } from "@/lib/builder/types";
import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { appendToolPartToMessage, integrationSignalToToolPart } from "./helpers";
import {
  buildPostCheckBaseline,
  type PostCheckBaseline,
} from "./post-checks-analysis";
import { resolvePreviousVersionId } from "./post-checks-diff";
import {
  fetchChatFiles,
  fetchChatVersions,
} from "./post-checks-fetch";
import {
  buildPostCheckArtifacts,
  type ImageValidationResult,
} from "./post-checks-results";
import {
  appendPostCheckSummaryToMessage,
  buildPostCheckSummary,
} from "./post-checks-summary";
import type {
  AutoFixPayload,
  RepairContext,
  SetMessages,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";

async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
}) {
  const { chatId, versionId, logs } = params;
  if (!logs.length) return;
  try {
    await fetch(
      `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
    );
  } catch {
    // Best-effort only
  }
}

async function validateImages(params: {
  chatId: string;
  versionId: string;
  signal: AbortSignal;
}): Promise<ImageValidationResult | null> {
  const { chatId, versionId, signal } = params;
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/validate-images`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, autoFix: true }),
        signal,
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as ImageValidationResult;
  } catch {
    return null;
  }
}

const ENV_LOOKUP_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const ENV_ERROR_HINTS = [
  "environment variable",
  "environment variables",
  "env var",
  "env vars",
  "missing env",
  "missing required",
  "must be set",
  "process.env",
  "saknas fortfarande",
  "saknad",
];

function extractMissingEnvKeysFromQualityGate(checks: QualityGateCheckResult[]): string[] {
  const keys = new Set<string>();
  for (const check of checks) {
    const output = typeof check.output === "string" ? check.output : "";
    if (!output.trim()) continue;
    const lower = output.toLowerCase();
    if (!ENV_ERROR_HINTS.some((hint) => lower.includes(hint))) continue;
    for (const match of output.matchAll(ENV_LOOKUP_RE)) {
      const candidate = match[0];
      if (!candidate) continue;
      if (candidate.includes("_") || candidate.endsWith("URL")) {
        keys.add(candidate);
      }
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function buildAutoFixMeta(
  baseline: PostCheckBaseline,
  imageValidation: ImageValidationResult | null,
  finalDemoUrl: string | null,
  preflight?: PreviewPreflightState | null,
) {
  return {
    previousVersionId: baseline.previousVersionId,
    missingRoutes: baseline.missingRoutes,
    missingPlannedRoutes: baseline.missingPlannedRoutes,
    lucideLinkMisuse: baseline.lucideLinkMisuse,
    suspiciousUseCalls: baseline.suspiciousUseCalls,
    sanityIssues: baseline.sanityIssues,
    imageValidation,
    demoUrl: finalDemoUrl,
    scaffoldRetry: preflight?.scaffoldRetry ?? null,
  };
}

export async function runPostGenerationChecks(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
  assistantMessageId: string;
  setMessages: SetMessages;
  streamQuality?: StreamQualitySignal;
  onAutoFix?: (payload: AutoFixPayload) => void;
}) {
  const {
    chatId,
    versionId,
    demoUrl,
    preflight,
    assistantMessageId,
    setMessages,
    streamQuality,
    onAutoFix,
  } = params;
  const toolCallId = `post-check:${versionId}`;
  const controller = new AbortController();

  try {
    const [currentFiles, versions] = await Promise.all([
      fetchChatFiles(chatId, versionId, controller.signal, true),
      fetchChatVersions(chatId, controller.signal),
    ]);
    const previousVersionId = resolvePreviousVersionId(versionId, versions);
    const previousFiles = previousVersionId
      ? await fetchChatFiles(chatId, previousVersionId, controller.signal, true)
      : [];

    const baseline = buildPostCheckBaseline({
      currentFiles,
      previousFiles,
      previousVersionId,
      versions,
      versionId,
      demoUrl,
      preflight,
    });

    const imageValidation = await validateImages({
      chatId,
      versionId,
      signal: controller.signal,
    });
    const warnings = [...baseline.warnings];
    if (imageValidation?.warnings?.length) {
      warnings.push(...imageValidation.warnings);
    }

    const artifacts = buildPostCheckArtifacts({
      currentFileCount: currentFiles.length,
      versionId,
      changes: baseline.changes,
      warnings,
      preflight,
      previousVersionId: baseline.previousVersionId,
      streamQuality,
      missingRoutes: baseline.missingRoutes,
      missingPlannedRoutes: baseline.missingPlannedRoutes,
      lucideLinkMisuse: baseline.lucideLinkMisuse,
      suspiciousUseCalls: baseline.suspiciousUseCalls,
      designTokens: baseline.designTokens,
      seoReview: baseline.seoReview,
      analyticsReview: baseline.analyticsReview,
      editorialReview: baseline.editorialReview,
      businessWorkflowReview: baseline.businessWorkflowReview,
      sanityIssues: baseline.sanityIssues,
      sanityErrors: baseline.sanityErrors,
      sanityWarnings: baseline.sanityWarnings,
      imageValidation,
      resolvedDemoUrl: baseline.resolvedDemoUrl,
    });

    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: artifacts.logItems,
    });

    if (artifacts.autoFixReasons.length > 0) {
      onAutoFix?.({
        chatId,
        versionId,
        reasons: artifacts.autoFixReasons,
        meta: buildAutoFixMeta(baseline, imageValidation, artifacts.finalDemoUrl, preflight),
      });
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-available",
      input: { chatId, versionId, previousVersionId: baseline.previousVersionId },
      output: artifacts.output,
    });

    appendPostCheckSummaryToMessage(
      setMessages,
      assistantMessageId,
      buildPostCheckSummary({
        changes: baseline.changes,
        warnings,
        demoUrl: artifacts.finalDemoUrl,
        previewBlockingReason: artifacts.previewBlockingReason,
        provisional: artifacts.provisionalVersion,
        qualityGatePending: artifacts.qualityGatePending,
        autoFixQueued: artifacts.autoFixQueued,
        qualityTier: artifacts.qualityTier,
        warningReasons: artifacts.warningReasons,
      }),
    );

    if (artifacts.autoFixReasons.length === 0) {
      void runPreviewQualityGate({
        chatId,
        versionId,
        assistantMessageId,
        setMessages,
        onAutoFix,
      });
    } else {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          reason: "Skippad eftersom autofix redan har köats från post-check.",
          autoFixQueued: true,
        },
      } as UiMessagePart);
    }
  } catch (error) {
    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: [
        {
          level: "error",
          category: "post-check",
          message: error instanceof Error ? error.message : "Post-check failed",
        },
      ],
    });
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-error",
      input: { chatId, versionId },
      errorText: error instanceof Error ? error.message : "Post-check failed",
    });
  } finally {
    controller.abort();
  }
}

type QualityGateCheckResult = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

function formatDurationMs(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1).replace(/\.0$/, "")}s`;
}

function formatUtcClock(timestamp: string | null | undefined): string | null {
  if (typeof timestamp !== "string" || !timestamp.trim()) return null;
  const value = timestamp.trim();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(11, 19)}Z`;
}

async function runPreviewQualityGate(params: {
  chatId: string;
  versionId: string;
  assistantMessageId: string;
  setMessages: SetMessages;
  onAutoFix?: (payload: AutoFixPayload) => void;
}) {
  const { chatId, versionId, assistantMessageId, setMessages, onAutoFix } = params;
  const toolCallId = `quality-gate:${versionId}`;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId, checks: ["typecheck", "build", "lint"] },
  } as UiMessagePart);

  try {
    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/quality-gate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks: ["typecheck", "build", "lint"] }),
      },
    );

    if (res.status === 501) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: { skipped: true, reason: "Quality gate not configured" },
      } as UiMessagePart);
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      passed?: boolean;
      checks?: QualityGateCheckResult[];
      verifyLaneDurationMs?: number;
      firstFailureCheck?: string | null;
      jobStartedAt?: string | null;
      jobFinishedAt?: string | null;
      error?: string;
      visualQA?: {
        overallScore: number;
        passed: boolean;
        checks: Array<{ check: string; passed: boolean; score: number; detail: string }>;
      };
    } | null;

    if (!res.ok || !data) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-error",
        errorText: data?.error || `Quality gate request failed (HTTP ${res.status})`,
      } as UiMessagePart);
      return;
    }

    const steps: string[] = [];
    const failedChecks: string[] = [];
    for (const check of data.checks ?? []) {
      const icon = check.passed ? "PASS" : "FAIL";
      const durationLabel = formatDurationMs(check.durationMs);
      steps.push(
        `${check.check}: ${icon} (exit ${check.exitCode}${durationLabel ? `, ${durationLabel}` : ""})`,
      );
      if (!check.passed) failedChecks.push(check.check);
    }
    const totalDurationLabel = formatDurationMs(data.verifyLaneDurationMs);
    if (totalDurationLabel) {
      steps.push(`Duration: ${totalDurationLabel}`);
    }
    const startedAtLabel = formatUtcClock(data.jobStartedAt);
    if (startedAtLabel) {
      steps.push(`Started: ${startedAtLabel}`);
    }
    const finishedAtLabel = formatUtcClock(data.jobFinishedAt);
    if (finishedAtLabel) {
      steps.push(`Finished: ${finishedAtLabel}`);
    }
    if (typeof data.firstFailureCheck === "string" && data.firstFailureCheck.trim()) {
      steps.push(`First failure: ${data.firstFailureCheck.trim()}`);
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-available",
      output: {
        passed: data.passed,
        steps,
        checks: data.checks,
        verifyLaneDurationMs: data.verifyLaneDurationMs,
        firstFailureCheck:
          typeof data.firstFailureCheck === "string" ? data.firstFailureCheck : null,
        jobStartedAt:
          typeof data.jobStartedAt === "string" ? data.jobStartedAt : null,
        jobFinishedAt:
          typeof data.jobFinishedAt === "string" ? data.jobFinishedAt : null,
      },
    } as UiMessagePart);

    if (data.visualQA) {
      const vqaSteps = data.visualQA.checks.map(
        (c) => `visual:${c.check}: ${c.passed ? "PASS" : "FAIL"} (${c.score}/100) — ${c.detail}`,
      );
      steps.push(`Visual QA: ${data.visualQA.overallScore}/100 ${data.visualQA.passed ? "PASS" : "BELOW THRESHOLD"}`);
      steps.push(...vqaSteps);
    }

    if (!data.passed && failedChecks.length > 0) {
      const missingEnvKeys = extractMissingEnvKeysFromQualityGate(data.checks ?? []);
      if (missingEnvKeys.length > 0) {
        appendToolPartToMessage(
          setMessages,
          assistantMessageId,
          integrationSignalToToolPart(
            {
              key: `quality-gate-env:${versionId}`,
              name: "Miljövariabler",
              intent: "env_vars",
              envVars: missingEnvKeys,
              status:
                "Bygget kräver miljövariabler innan live-preview kan nå Fidelity 2. Lägg in nycklarna och starta om previewn i stället för att generera om sajten.",
              sourceEvent: "quality-gate",
            },
            versionId,
          ),
        );
        return;
      }

      const repair: RepairContext = {
        qualityGate: (data.checks ?? [])
          .filter((c) => !c.passed)
          .map((c) => ({
            check: c.check as "typecheck" | "build" | "lint",
            exitCode: c.exitCode,
            output: c.output.slice(0, 4000),
            durationMs: c.durationMs ?? null,
          })),
        qualityGateMeta: {
          verifyLaneDurationMs: data.verifyLaneDurationMs ?? null,
          firstFailureCheck:
            typeof data.firstFailureCheck === "string" ? data.firstFailureCheck : null,
          jobStartedAt: typeof data.jobStartedAt === "string" ? data.jobStartedAt : null,
          jobFinishedAt: typeof data.jobFinishedAt === "string" ? data.jobFinishedAt : null,
        },
      };

      const serverRepaired = await tryServerRepair(chatId, versionId, repair);
      if (serverRepaired) {
        appendToolPartToMessage(setMessages, assistantMessageId, {
          type: "tool:quality-gate",
          toolName: "Server repair",
          toolCallId: `server-repair:${versionId}`,
          state: "output-available",
          output: {
            repaired: serverRepaired.repaired,
            method: serverRepaired.deterministic ? "deterministic" : "llm",
            newVersionId: serverRepaired.newVersionId,
            remainingErrors: serverRepaired.remainingErrors ?? null,
            improvedSyntax: serverRepaired.improvedSyntax ?? null,
            earlyStopReason: serverRepaired.earlyStopReason ?? null,
          },
        } as UiMessagePart);
        if (!serverRepaired.repaired) {
          onAutoFix?.({
            chatId,
            versionId,
            reasons: failedChecks.map((check) => `${check} failed`),
            repair,
          });
        }
      } else {
        onAutoFix?.({
          chatId,
          versionId,
          reasons: failedChecks.map((check) => `${check} failed`),
          repair,
        });
      }
    } else if (data.passed && data.visualQA && !data.visualQA.passed && onAutoFix) {
      const repair: RepairContext = {
        visualQA: data.visualQA.checks
          .filter((c) => !c.passed)
          .map((c) => ({ check: c.check, score: c.score, detail: c.detail }))
          .slice(0, 4),
      };
      onAutoFix({
        chatId,
        versionId,
        reasons: [`Visual QA score ${data.visualQA.overallScore}/100 below threshold`],
        repair,
      });
    }
  } catch {
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-error",
      errorText: "Quality gate request failed (network error)",
    } as UiMessagePart);
  }
}

function isServerRepairDisabled(): boolean {
  try {
    return typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__SAJTMASKIN_SKIP_SERVER_REPAIR__ === true;
  } catch {
    return false;
  }
}

type ServerRepairResult = {
  repaired: boolean;
  deterministic: boolean;
  newVersionId?: string | null;
  remainingErrors?: number;
  improvedSyntax?: boolean;
  earlyStopReason?: "fixer_noop" | "no_improvement" | null;
};

async function tryServerRepair(
  chatId: string,
  versionId: string,
  repair: RepairContext,
): Promise<ServerRepairResult | null> {
  if (isServerRepairDisabled()) return null;
  try {
    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/repair`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, repairContext: repair }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as ServerRepairResult | null;
    return data;
  } catch {
    return null;
  }
}
