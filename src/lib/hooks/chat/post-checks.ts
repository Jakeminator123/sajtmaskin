import type { UiMessagePart } from "@/lib/builder/types";
import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import { appendToolPartToMessage } from "./helpers";
import {
  buildPostCheckBaseline,
  type PostCheckBaseline,
} from "./post-checks-analysis";
import { resolvePreviousVersionId } from "./post-checks-diff";
import {
  fetchChatFiles,
  fetchChatVersions,
  triggerImageMaterialization,
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
  SetMessages,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";
import { maybeAutoDeployVersion } from "./auto-deploy";

async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
}) {
  const { chatId, versionId, logs } = params;
  if (!logs.length) return;
  try {
    await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
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
      `/api/v0/chats/${encodeURIComponent(chatId)}/validate-images`,
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

export { triggerImageMaterialization };

export async function runPostGenerationChecks(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
  assistantMessageId: string;
  setMessages: SetMessages;
  streamQuality?: StreamQualitySignal;
  onAutoFix?: (payload: AutoFixPayload) => void;
  /** When true, sandbox quality gate was already executed (e.g. SANDBOX_AUTO preview defer). */
  skipQualityGate?: boolean;
  /** Override the post-check handling when runtime preview is pending or unavailable. */
  runtimePreviewState?: "pending" | "skipped" | null;
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
    skipQualityGate,
    runtimePreviewState,
  } = params;
  const resolvedRuntimePreviewState =
    runtimePreviewState ?? (!demoUrl && preflight?.previewBlocked === false ? "pending" : null);
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
      runtimePreviewState: resolvedRuntimePreviewState,
    });

    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: artifacts.logItems,
    });

    const postCheckAutoFixReasons = artifacts.autoFixReasons;
    const postCheckAutoFixMeta = postCheckAutoFixReasons.length > 0
      ? buildAutoFixMeta(baseline, imageValidation, artifacts.finalDemoUrl, preflight)
      : undefined;

    if (postCheckAutoFixReasons.length > 0) {
      console.info(`[post-check] Critical reasons (${postCheckAutoFixReasons.length}): ${postCheckAutoFixReasons.join(", ")}`);
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

    // Always run sandbox quality gate when configured so that tsc/build
    // diagnostics are persisted regardless of whether post-check autofix
    // was already queued. Quality gate can still trigger its own autofix
    // if the sandbox reveals additional failures.
    /** Preflight could not prepare preview — skip redundant sandbox round-trip. */
    const skipGateForPreflight = Boolean(preflight?.previewBlocked);
    const skipGateForPreviewIssue = postCheckAutoFixReasons.some((reason) =>
      reason.toLowerCase().startsWith("preview"),
    );
    if ((skipGateForPreflight || skipGateForPreviewIssue) && !skipQualityGate) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          reason: skipGateForPreflight
            ? "Preview blocked in preflight"
            : "Preview issue already detected in post-check",
        },
      } as UiMessagePart);
      if (postCheckAutoFixReasons.length > 0 && onAutoFix) {
        console.info(`[autofix-trigger] Gate skipped, firing post-check reasons only (${postCheckAutoFixReasons.length})`);
        onAutoFix({
          chatId,
          versionId,
          reasons: postCheckAutoFixReasons,
          meta: postCheckAutoFixMeta ?? {},
        });
      }
    } else if (!skipQualityGate && !skipGateForPreflight) {
      void runSandboxQualityGate({
        chatId,
        versionId,
        assistantMessageId,
        setMessages,
        onAutoFix,
        pendingPostCheckReasons: postCheckAutoFixReasons,
        pendingPostCheckMeta: postCheckAutoFixMeta as Record<string, unknown> | undefined,
      });
    } else if (postCheckAutoFixReasons.length > 0 && onAutoFix) {
      console.info(`[autofix-trigger] No gate configured, firing post-check reasons only (${postCheckAutoFixReasons.length})`);
      onAutoFix({
        chatId,
        versionId,
        reasons: postCheckAutoFixReasons,
        meta: postCheckAutoFixMeta ?? {},
      });
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
};

/** Runs @vercel/sandbox typecheck/build; exported for SANDBOX_AUTO preview defer. */
export async function runSandboxQualityGate(params: {
  chatId: string;
  versionId: string;
  assistantMessageId: string;
  setMessages: SetMessages;
  onAutoFix?: (payload: AutoFixPayload) => void;
  bootRuntime?: boolean;
  pendingPostCheckReasons?: string[];
  pendingPostCheckMeta?: Record<string, unknown>;
}) {
  const {
    chatId, versionId, assistantMessageId, setMessages, onAutoFix,
    bootRuntime = true,
    pendingPostCheckReasons = [],
    pendingPostCheckMeta,
  } = params;
  const toolCallId = `quality-gate:${versionId}`;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId, checks: ["typecheck", "build"], bootRuntime },
  } as UiMessagePart);

  try {
    const res = await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/quality-gate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks: ["typecheck", "build"], bootRuntime }),
      },
    );

    if (res.status === 501) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: { skipped: true, reason: "Sandbox not configured" },
      } as UiMessagePart);
      return {
        status: "skipped" as const,
        passed: false,
        runtimeUrl: null,
        sandboxId: null,
        ports: [] as number[],
      };
    }

    const data = (await res.json().catch(() => null)) as {
      passed?: boolean;
      checks?: QualityGateCheckResult[];
      sandboxDurationMs?: number;
      runtimeUrl?: string | null;
      sandboxId?: string | null;
      ports?: number[];
      error?: string;
    } | null;

    if (!res.ok || !data) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-error",
        errorText: data?.error || `Quality gate request failed (HTTP ${res.status})`,
      } as UiMessagePart);
      return {
        status: "failed" as const,
        passed: false,
        runtimeUrl: null,
        sandboxId: null,
        ports: [] as number[],
      };
    }

    const steps: string[] = [];
    const failedChecks: string[] = [];
    for (const check of data.checks ?? []) {
      const icon = check.passed ? "PASS" : "FAIL";
      steps.push(`${check.check}: ${icon} (exit ${check.exitCode})`);
      if (!check.passed) failedChecks.push(check.check);
    }
    if (data.sandboxDurationMs) {
      steps.push(`Duration: ${Math.round(data.sandboxDurationMs / 1000)}s`);
    }
    if (bootRuntime) {
      steps.push(
        data.runtimeUrl
          ? "Runtime sandbox: READY"
          : "Runtime sandbox: not started",
      );
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
        sandboxDurationMs: data.sandboxDurationMs,
        runtimeUrl: data.runtimeUrl ?? null,
      },
    } as UiMessagePart);

    const gateReasons = !data.passed && failedChecks.length > 0
      ? failedChecks.map((check) => `${check} failed`)
      : [];
    const allReasons = [...pendingPostCheckReasons, ...gateReasons];

    if (data.passed && allReasons.length === 0) {
      maybeAutoDeployVersion({ chatId, versionId });
    }

    if (allReasons.length > 0 && onAutoFix) {
      const failedOutputs: Record<string, string> = {};
      for (const check of data.checks ?? []) {
        if (!check.passed) failedOutputs[check.check] = check.output.slice(0, 2000);
      }
      console.info(`[autofix-trigger] Merged reasons (${allReasons.length}): ${allReasons.join(", ")}`);
      onAutoFix({
        chatId,
        versionId,
        reasons: allReasons,
        meta: { ...pendingPostCheckMeta, qualityGate: Object.keys(failedOutputs).length > 0 ? failedOutputs : undefined },
      });
    }

    return {
      status: data.passed ? ("passed" as const) : ("failed" as const),
      passed: Boolean(data.passed),
      runtimeUrl: typeof data.runtimeUrl === "string" ? data.runtimeUrl : null,
      sandboxId: typeof data.sandboxId === "string" ? data.sandboxId : null,
      ports: Array.isArray(data.ports) ? data.ports : [],
    };
  } catch {
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-error",
      errorText: "Quality gate request failed (network error)",
    } as UiMessagePart);
    return {
      status: "failed" as const,
      passed: false,
      runtimeUrl: null,
      sandboxId: null,
      ports: [] as number[],
    };
  }
}
