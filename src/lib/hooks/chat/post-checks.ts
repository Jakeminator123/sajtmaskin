import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { UiMessagePart } from "@/lib/builder/types";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS } from "@/lib/gen/verify/quality-gate-checks";
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
import { toast } from "sonner";
import type {
  AutoFixPayload,
  RepairContext,
  SetMessages,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

/**
 * Exported for the resume-verify lane (`useResumePendingVerification`), which
 * mirrors this lane's tail and must persist the SAME log rows — notably the
 * `product_postcheck.summary` row that `PreviewPanelF3Trigger` reads to block
 * F3 on product-blocked versions (Codex P1 on #353).
 *
 * Returns whether the write verifiably succeeded (2xx). The normal lane
 * stays fire-and-forget, but the resume lane must fail closed when a
 * product-BLOCKER row could not be persisted (Codex P1 round 4).
 */
export async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
}): Promise<boolean> {
  const { chatId, versionId, logs } = params;
  if (!logs.length) return true;
  try {
    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
    );
    return res.ok;
  } catch {
    // Best-effort only
    return false;
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

async function runProductPostcheckApi(params: {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
  signal: AbortSignal;
}): Promise<ProductPostcheckResult | null> {
  const { chatId, versionId, previewUrl, signal } = params;
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/product-postcheck`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, previewUrl }),
        signal,
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as ProductPostcheckResult;
  } catch {
    return null;
  }
}

/** Exported for the resume-verify lane — see `persistVersionErrorLogs`. */
export function buildProductPostcheckLogItems(
  result: ProductPostcheckResult | null,
): VersionErrorLogPayload[] {
  if (!result) return [];
  if (result.skipped) {
    return [
      {
        level: "info",
        category: "product_postcheck.skipped",
        message: "F2 Product Postcheck skipped.",
        meta: {
          skippedReason: result.skippedReason ?? "unknown",
          durationMs: result.durationMs ?? null,
          checkedUrl: result.checkedUrl ?? null,
        },
      },
    ];
  }

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const logs: VersionErrorLogPayload[] = warnings.map((warning) => ({
    level: "warning" as const,
    category: `product_postcheck.${warning.code || "warning"}`,
    message: warning.message || "F2 Product Postcheck warning.",
    meta: {
      ...warning,
      durationMs: result.durationMs ?? null,
      checkedUrl: result.checkedUrl ?? null,
    },
  }));
  logs.unshift({
    level: warnings.length > 0 ? "warning" : "info",
    category: "product_postcheck.summary",
    message:
      warnings.length > 0
        ? `F2 Product Postcheck found ${warnings.length} warning(s).`
        : "F2 Product Postcheck passed.",
    meta: {
      warningCount: warnings.length,
      productBlocked: result.productBlocked === true,
      durationMs: result.durationMs ?? null,
      checkedUrl: result.checkedUrl ?? null,
    },
  });
  return logs;
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
  mutateVersions?: () => void;
  onAutoFix?: (payload: AutoFixPayload) => void;
  /**
   * Område 6-3 punkt 1: fired exactly once when this post-check
   * invocation finishes (success OR catch path), from the `finally`
   * block. The builder wires this to a `refreshNonce` bump so
   * `useVersionStatus` does a guaranteed final read AFTER the
   * product-postcheck has emitted any late `version.degraded`.
   */
  onComplete?: () => void;
}) {
  const {
    chatId,
    versionId,
    demoUrl,
    preflight,
    assistantMessageId,
    setMessages,
    streamQuality,
    mutateVersions,
    onAutoFix,
    onComplete,
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
    const productPostcheck = await runProductPostcheckApi({
      chatId,
      versionId,
      previewUrl: baseline.resolvedDemoUrl ?? null,
      signal: controller.signal,
    });
    const warnings = [...baseline.warnings];
    if (imageValidation?.warnings?.length) {
      warnings.push(...imageValidation.warnings);
    }
    if (!productPostcheck?.skipped && productPostcheck?.warnings?.length) {
      warnings.push(...productPostcheck.warnings.map((warning) => `Product: ${warning.message}`));
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
      productPostcheck,
      resolvedDemoUrl: baseline.resolvedDemoUrl,
    });

    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: [...artifacts.logItems, ...buildProductPostcheckLogItems(productPostcheck)],
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
        verifyPending: artifacts.verifyPending,
        autoFixQueued: artifacts.autoFixQueued,
        qualityTier: artifacts.qualityTier,
        warningReasons: artifacts.warningReasons,
        productBlocked: productPostcheck?.productBlocked === true,
      }),
    );

    // Verify-lane only runs when the version is actually verify-pending.
    // `autoFixReasons === []` alone is NOT enough: degenerate output (M#dgc)
    // clears the autofix queue while the version is terminally failed
    // server-side (`verifyPending === false`) — running the VM verify lane
    // there just burns work on a version the degeneracy guard already failed.
    if (artifacts.autoFixReasons.length === 0 && artifacts.verifyPending) {
      void runTier2VerifyLane({
        chatId,
        versionId,
        assistantMessageId,
        setMessages,
        mutateVersions,
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
          reason: artifacts.autoFixQueued
            ? "Autofix köad från post-check — verify-lane körs efter fix."
            : "Versionen är terminalt failad (degenererad output) — verify-lane hoppas över.",
          autoFixQueued: artifacts.autoFixQueued,
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
    // Deterministic completion signal (runs on both the success and catch
    // paths, exactly once). Refetches BOTH status surfaces after the
    // postcheck has emitted any late `version.degraded`: `mutateVersions`
    // revalidates `/versions` (VersionHistory `busStatus`, whose SWR
    // otherwise idles ~60s) and `onComplete` bumps `refreshNonce` for the
    // preview badge (`useVersionStatus`). Without the former the two
    // surfaces disagree — history keeps the pre-postcheck green while the
    // preview already shows degraded (Codex P2, område 6-3).
    mutateVersions?.();
    onComplete?.();
  }
}

type QualityGateCheckResult = {
  check: string;
  passed: boolean;
  advisory?: boolean;
  repairable?: boolean;
  failureKind?: "code" | "tooling" | null;
  errorCount?: number;
  warningCount?: number;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

type QualityGateVisualQaResult = {
  overallScore: number;
  passed: boolean;
  checks: Array<{ check: string; passed: boolean; score: number; detail: string }>;
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

async function runTier2VerifyLane(params: {
  chatId: string;
  versionId: string;
  assistantMessageId: string;
  setMessages: SetMessages;
  mutateVersions?: () => void;
  onAutoFix?: (payload: AutoFixPayload) => void;
  previewPolicy?: "fidelity2" | "fidelity3";
}) {
  const {
    chatId,
    versionId,
    assistantMessageId,
    setMessages,
    mutateVersions,
    onAutoFix,
    previewPolicy = "fidelity2",
  } = params;
  const toolCallId = `quality-gate:${versionId}`;
  const checks = DESIGN_PREVIEW_QUALITY_GATE_CHECKS;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId, checks },
  } as UiMessagePart);

  try {
    if (previewPolicy === "fidelity2" && checks.includes("build")) {
      console.warn(
        "[F2 contract violation] build belongs to F3 (integrationsBuild). " +
          "This call site sends build to designPreview gate. Investigate.",
        { chatId, versionId, checks },
      );
      // Soft landing: warning-only during telemetry week.
    }

    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/quality-gate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks }),
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
      // Env kill-switch (SAJTMASKIN_DISABLE_QUALITY_GATE): the server
      // short-circuited the F2 RenderGate and auto-promoted the version.
      skipped?: boolean;
      disabled?: boolean;
      reason?: string;
      visualQA?: QualityGateVisualQaResult;
      // Promotion guard markers (route returns `passed:false` alongside these):
      // `vmGatePassed` keeps the underlying VM-check status for diagnostics.
      vmGatePassed?: boolean;
      promotionBlocked?: boolean;
      promotionBlockedReason?: string | null;
      promoteError?: boolean;
      // F2 render-first advisory: `passed:true` with `vmGatePassed:false` means a
      // typecheck-only failure was treated as non-blocking on a design preview
      // (the version was promoted). No auto-repair should run for this.
      designAdvisory?: boolean;
      qualityGateAdvisory?: boolean;
      advisoryChecks?: string[];
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

    // Env kill-switch: the F2 quality gate is turned off server-side. The
    // version was already auto-promoted; surface an informational (not error)
    // card and refresh the version status so the promoted state shows.
    if (data.disabled || data.skipped) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: {
          skipped: true,
          reason:
            typeof data.reason === "string" && data.reason.trim()
              ? data.reason
              : "Quality gate avstängd.",
        },
      } as UiMessagePart);
      mutateVersions?.();
      return;
    }

    const steps: string[] = [];
    const failedChecks: string[] = [];
    for (const check of data.checks ?? []) {
      const icon = check.advisory ? "Varning" : check.passed ? "Godkänd" : "Underkänd";
      const durationLabel = formatDurationMs(check.durationMs);
      steps.push(
        `${check.check}: ${icon} (exit ${check.exitCode}${durationLabel ? `, ${durationLabel}` : ""})`,
      );
      if (!check.passed && check.repairable !== false) failedChecks.push(check.check);
    }
    const totalDurationLabel = formatDurationMs(data.verifyLaneDurationMs);
    if (totalDurationLabel) {
      steps.push(`Tid: ${totalDurationLabel}`);
    }
    const startedAtLabel = formatUtcClock(data.jobStartedAt);
    if (startedAtLabel) {
      steps.push(`Start: ${startedAtLabel}`);
    }
    const finishedAtLabel = formatUtcClock(data.jobFinishedAt);
    if (finishedAtLabel) {
      steps.push(`Slut: ${finishedAtLabel}`);
    }
    if (typeof data.firstFailureCheck === "string" && data.firstFailureCheck.trim()) {
      steps.push(`Första fel: ${data.firstFailureCheck.trim()}`);
    }
    // The VM checks can all pass while promotion is still blocked because the
    // finalize verifier flagged the version. Surface that explicitly so the
    // card reads as "not green" with a reason, instead of a confusing all-PASS.
    if (data.promotionBlocked) {
      steps.push(
        "Promotion blockerad: finalize-verifieraren flaggade blockerande fynd (bygg-checkar gröna).",
      );
    } else if (data.promoteError) {
      steps.push("Promotion misslyckades tillfälligt — försök verifiera igen.");
    } else if (data.designAdvisory) {
      const advisoryLabel =
        Array.isArray(data.advisoryChecks) && data.advisoryChecks.length > 0
          ? data.advisoryChecks.join(", ")
          : "typecheck";
      steps.push(
        `F2 render-first: ${advisoryLabel}-varning (advisory) — previewen renderar, versionen är användbar. Åtgärda i lugn och ro; ingen automatisk reparation kördes.`,
      );
    } else if (data.qualityGateAdvisory) {
      const advisoryLabel =
        Array.isArray(data.advisoryChecks) && data.advisoryChecks.length > 0
          ? data.advisoryChecks.join(", ")
          : "lint";
      steps.push(
        `ReleaseGate: ${advisoryLabel}-varningar är advisory — versionen kan publiceras och ingen automatisk reparation kördes.`,
      );
    }

    const visualQa =
      data.visualQA &&
      typeof data.visualQA.overallScore === "number" &&
      Array.isArray(data.visualQA.checks)
        ? data.visualQA
        : undefined;

    if (visualQa) {
      const vqaSteps = visualQa.checks.map(
        (c) => `visuell:${c.check}: ${c.passed ? "Godkänd" : "Underkänd"} (${c.score}/100) — ${c.detail}`,
      );
      steps.push(
        `Visuell QA: ${visualQa.overallScore}/100 ${visualQa.passed ? "Godkänd" : "Under tröskel"}`,
      );
      steps.push(...vqaSteps);
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
        visualQA: visualQa,
        promotionBlocked: data.promotionBlocked === true ? true : undefined,
        promotionBlockedReason:
          data.promotionBlocked && typeof data.promotionBlockedReason === "string"
            ? data.promotionBlockedReason
            : undefined,
        designAdvisory: data.designAdvisory === true ? true : undefined,
        qualityGateAdvisory:
          data.qualityGateAdvisory === true ? true : undefined,
        advisoryChecks:
          (data.designAdvisory || data.qualityGateAdvisory) &&
          Array.isArray(data.advisoryChecks)
            ? data.advisoryChecks
            : undefined,
      },
    } as UiMessagePart);

    // F2 render-first: a typecheck-only advisory returns `passed:true`, so this
    // guard is already false — but keep `!data.designAdvisory` explicit so a
    // future response shape change can never route an advisory into auto-repair.
    if (!data.passed && !data.designAdvisory && failedChecks.length > 0) {
      const handled = handleEnvSignal(data.checks ?? [], versionId, setMessages, assistantMessageId);
      if (handled) return;

      await handleRepairOrAutofix({
        chatId,
        versionId,
        data,
        failedChecks,
        setMessages,
        assistantMessageId,
        mutateVersions,
        onAutoFix,
      });
    } else if (data.passed && visualQa && !visualQa.passed && onAutoFix) {
      handleVisualQaAutofix({ chatId, versionId, visualQa, onAutoFix });
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

function handleEnvSignal(
  checks: QualityGateCheckResult[],
  versionId: string,
  setMessages: SetMessages,
  assistantMessageId: string,
): boolean {
  const missingEnvKeys = extractMissingEnvKeysFromQualityGate(checks);
  if (missingEnvKeys.length === 0) return false;
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
  return true;
}

async function handleRepairOrAutofix(params: {
  chatId: string;
  versionId: string;
  data: {
    checks?: QualityGateCheckResult[];
    verifyLaneDurationMs?: number;
    firstFailureCheck?: string | null;
    jobStartedAt?: string | null;
    jobFinishedAt?: string | null;
  };
  failedChecks: string[];
  setMessages: SetMessages;
  assistantMessageId: string;
  mutateVersions?: () => void;
  onAutoFix?: (payload: AutoFixPayload) => void;
}) {
  const {
    chatId,
    versionId,
    data,
    failedChecks,
    setMessages,
    assistantMessageId,
    mutateVersions,
    onAutoFix,
  } = params;

  // M#rep1: the verify lane may include info-signals (`install-cache-share`,
  // `install-peer-fallback`, …) in `checks[]`. The repair route's zod enum only
  // accepts the three canonical checks, so anything else would 400 the whole
  // repair POST if it ever arrived as `passed:false`. Filter, don't cast blindly.
  const CANONICAL_QUALITY_GATE_CHECKS = new Set(["typecheck", "build", "lint"]);
  const repair: RepairContext = {
    qualityGate: (data.checks ?? [])
      .filter(
        (c) =>
          !c.passed &&
          c.repairable !== false &&
          CANONICAL_QUALITY_GATE_CHECKS.has(c.check),
      )
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
  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Server repair",
    toolCallId: `server-repair:${versionId}`,
    state: "output-available",
    output: {
      repaired: serverRepaired.repaired,
      method:
        serverRepaired.status === "completed" || serverRepaired.status === "repair_available"
        ? serverRepaired.deterministic
          ? "deterministic"
          : "llm"
        : null,
      newVersionId: serverRepaired.newVersionId,
      remainingErrors: serverRepaired.remainingErrors ?? null,
      improvedSyntax: serverRepaired.improvedSyntax ?? null,
      earlyStopReason: serverRepaired.earlyStopReason ?? null,
      status: serverRepaired.status ?? "completed",
      reason: serverRepaired.reason ?? null,
    },
  } as UiMessagePart);

  if (serverRepaired.repaired && serverRepaired.status === "repair_available") {
    mutateVersions?.();
    toast.message("Serverreparation tillgänglig", {
      description: "Acceptera reparationen i versionspanelen för att applicera fixen.",
    });
  }

  if (!serverRepaired.repaired) {
    onAutoFix?.({
      chatId,
      versionId,
      reasons: failedChecks.map((check) => `${check} failed`),
      repair,
    });
  }
}

function handleVisualQaAutofix(params: {
  chatId: string;
  versionId: string;
  visualQa: QualityGateVisualQaResult;
  onAutoFix: (payload: AutoFixPayload) => void;
}) {
  const { chatId, versionId, visualQa, onAutoFix } = params;
  const repair: RepairContext = {
    visualQA: visualQa.checks
      .filter((c) => !c.passed)
      .map((c) => ({ check: c.check, score: c.score, detail: c.detail }))
      .slice(0, 4),
  };
  onAutoFix({
    chatId,
    versionId,
    reasons: [`Visual QA score ${visualQa.overallScore}/100 below threshold`],
    repair,
  });
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
  earlyStopReason?:
    | "fixer_noop"
    | "no_improvement"
    | "time_budget_exceeded"
    | "superseded"
    | null;
  status?: "completed" | "repair_available" | "skipped" | "request_failed" | "superseded";
  reason?: string | null;
};

async function tryServerRepair(
  chatId: string,
  versionId: string,
  repair: RepairContext,
): Promise<ServerRepairResult> {
  if (isServerRepairDisabled()) {
    return {
      repaired: false,
      deterministic: false,
      status: "skipped",
      reason: "Server repair är avstängt i klienten.",
    };
  }
  try {
    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/repair`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, repairContext: repair }),
      },
    );
    if (!res.ok) {
      return {
        repaired: false,
        deterministic: false,
        status: "request_failed",
        reason: `Repair request failed (HTTP ${res.status})`,
      };
    }
    const data = (await res.json().catch(() => null)) as ServerRepairResult | null;
    if (!data) {
      return {
        repaired: false,
        deterministic: false,
        status: "request_failed",
        reason: "Repair request returned invalid payload.",
      };
    }
    return {
      ...data,
      status: data.status ?? "completed",
      reason: data.reason ?? null,
    };
  } catch {
    return {
      repaired: false,
      deterministic: false,
      status: "request_failed",
      reason: "Repair request failed (network error)",
    };
  }
}
