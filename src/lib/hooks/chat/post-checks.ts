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
) {
  return {
    previousVersionId: baseline.previousVersionId,
    missingRoutes: baseline.missingRoutes,
    lucideLinkMisuse: baseline.lucideLinkMisuse,
    suspiciousUseCalls: baseline.suspiciousUseCalls,
    sanityIssues: baseline.sanityIssues,
    imageValidation,
    demoUrl: finalDemoUrl,
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
      lucideLinkMisuse: baseline.lucideLinkMisuse,
      suspiciousUseCalls: baseline.suspiciousUseCalls,
      designTokens: baseline.designTokens,
      seoReview: baseline.seoReview,
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
        meta: buildAutoFixMeta(baseline, imageValidation, artifacts.finalDemoUrl),
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
      }),
    );

    if (artifacts.autoFixReasons.length === 0) {
      void runSandboxQualityGate({
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
};

async function runSandboxQualityGate(params: {
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
    input: { chatId, versionId, checks: ["typecheck", "build"] },
  } as UiMessagePart);

  try {
    const res = await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/quality-gate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks: ["typecheck", "build"] }),
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
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      passed?: boolean;
      checks?: QualityGateCheckResult[];
      sandboxDurationMs?: number;
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
      return;
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
      },
    } as UiMessagePart);

    if (!data.passed && failedChecks.length > 0 && onAutoFix) {
      const failedOutputs: Record<string, string> = {};
      for (const check of data.checks ?? []) {
        if (!check.passed) failedOutputs[check.check] = check.output.slice(0, 2000);
      }
      onAutoFix({
        chatId,
        versionId,
        reasons: failedChecks.map((check) => `${check} failed`),
        meta: { qualityGate: failedOutputs },
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
