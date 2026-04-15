import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import { FEATURES } from "@/lib/config";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { expandUrls } from "@/lib/gen/url-compress";
import type { PreviewPreflightSummary } from "@/lib/gen/preview/diagnostics";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import {
  inferScaffoldRetrySuggestion,
  type ScaffoldRetrySuggestion,
} from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { isVerifierPassEnabled, runVerifierPass } from "@/lib/gen/verify/verifier-pass";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createGenerationTelemetryRecord } from "@/lib/db/services/generation-telemetry";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { getPhaseRoutingSummary, resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, warnLog } from "@/lib/utils/debug";
import { buildFinalizePreflightLogBundle } from "./finalize-preflight-logs";
import {
  type FinalizePreflightIssue,
  runFinalizePreflight,
} from "./finalize-preflight";
import { mergeGeneratedProjectFiles } from "./finalize-merge";
import { injectIntegrationManifestIntoFilesJson } from "@/lib/integrations/inject-integration-manifest";
import {
  buildPersistedOrchestrationSnapshot,
  mergePersistedOrchestrationSnapshots,
} from "@/lib/gen/orchestration-snapshot";
import {
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "./finalize-pipeline-contract";

export type FinalizeProgressCallback = (
  step: OwnEnginePostStreamPhaseId,
  data: Record<string, unknown>,
) => void;

export interface FinalizeParams {
  accumulatedContent: string;
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
  buildSpec?: BuildSpec | null;
  routePlan?: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: Record<string, string>;
  startedAt: number;
  runAutofix?: boolean;
  tokenUsage?: { prompt?: number; completion?: number };
  logNote?: string;
  /** For follow-up: merge generated files against previous version instead of scaffold base */
  previousFiles?: CodeFile[];
  /** Optional callback for emitting progress SSE events during finalization */
  onProgress?: FinalizeProgressCallback;
  /** SSE `meta` from own-engine stream — persisted on chat after save (K-019). */
  orchestrationStreamMeta?: Record<string, unknown> | null;
  /** 0 = first generation, 1+ = quality-gate-triggered repair pass. */
  repairPassIndex?: number;
  /** SHA-256 of deterministic generation inputs (prompt lineage). */
  lineageHash?: string | null;
  /**
   * When set, update this existing version's files instead of creating a new version row.
   * Used by autofix so a repair attempt replaces v1 in-place rather than minting v2.
   */
  targetVersionId?: string | null;
}

export interface FinalizeResult {
  version: Awaited<ReturnType<typeof chatRepo.createDraftVersion>>;
  messageId: string;
  telemetryRecordId: string | null;
  previewUrl: string | null;
  /** Tier-2 live preview URL when the VM session boots (null until available). */
  tier2PreviewUrl: string | null;
  filesJson: string;
  contentForVersion: string;
  preflight: PreviewPreflightSummary;
}

interface FinalizePathPolicy {
  runDeepPath: boolean;
  reason:
    | "default"
    | "fast_path_disabled_by_flag"
    | "repair_pass"
    | "light_followup_fast_policy";
}

type FinalizeStepStatus = "done" | "skipped" | "error";

type FinalizeStepTelemetry = {
  status: FinalizeStepStatus;
  durationMs: number;
  reason?: string;
} & Record<string, unknown>;

type FinalizeStepTelemetryMap = Partial<Record<OwnEnginePostStreamPhaseId, FinalizeStepTelemetry>>;

type FinalizeSyntaxResult = Awaited<ReturnType<typeof validateAndFix>>;
type FinalizePreflightResult = Awaited<ReturnType<typeof runFinalizePreflight>>;

interface FinalizeFastPathResult {
  contentForVersion: string;
  syntaxResult: FinalizeSyntaxResult;
  filesJson: string;
  preflightResult: FinalizePreflightResult;
  preflightIssues: FinalizePreflightIssue[];
  preflightFileCount: number;
  previewBlockingReason: string | null;
  finalizedFilesForPreview: CodeFile[];
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  verifierBlockingFindings: Array<{ id: string; detail: string }>;
  stepTelemetry: FinalizeStepTelemetryMap;
}

function buildSyntaxFailureLog(params: {
  chatId: string;
  versionId: string;
  syntaxResult: FinalizeSyntaxResult;
  logPassId: string;
  repairPassIndex: number;
  lineageHash?: string | null;
}) {
  const { chatId, versionId, syntaxResult, logPassId, repairPassIndex, lineageHash } = params;
  if (syntaxResult.status === "passed") return null;

  const message =
    syntaxResult.status === "pipeline-error"
      ? "Syntax validation pipeline failed before preflight could trust the generated files."
      : "Syntax validation left blocking errors before preflight/preview.";

  return {
    chatId,
    versionId,
    level: "error" as const,
    category: "syntax",
    message,
    meta: {
      syntaxStatus: syntaxResult.status,
      errorsBefore: syntaxResult.errorsBefore,
      errorsAfter: syntaxResult.errorsAfter,
      fixerUsed: syntaxResult.fixerUsed,
      fixerImproved: syntaxResult.fixerImproved,
      pipelineError: syntaxResult.pipelineError,
      earlyStopReason: syntaxResult.earlyStopReason,
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  };
}

function buildVerifierFailureLogs(params: {
  chatId: string;
  versionId: string;
  blockingFindings: Array<{ id: string; detail: string }>;
  logPassId: string;
  repairPassIndex: number;
  lineageHash?: string | null;
}) {
  const { chatId, versionId, blockingFindings, logPassId, repairPassIndex, lineageHash } = params;
  return blockingFindings.map((finding) => ({
    chatId,
    versionId,
    level: "warning" as const,
    category: "quality-gate:verifier",
    message: finding.detail,
    meta: {
      verifierFindingId: finding.id,
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  }));
}

function createFinalizeStepTelemetry(
  startedAtMs: number,
  status: FinalizeStepStatus,
  extra?: Record<string, unknown>,
): FinalizeStepTelemetry {
  return {
    status,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    ...(extra ?? {}),
  };
}

function resolveImageMaterializationLimit(buildSpec?: BuildSpec | null): number {
  if (!buildSpec) return 6;
  if (
    buildSpec.previewPolicy === "fidelity3" ||
    buildSpec.qualityTarget === "release-candidate"
  ) {
    return 8;
  }
  if (
    buildSpec.qualityTarget !== "standard" ||
    buildSpec.buildIntent === "app" ||
    buildSpec.contextPolicy === "heavy" ||
    buildSpec.changeScope === "integration"
  ) {
    return 7;
  }
  return 6;
}

function resolveVerifierPassPolicy(params: {
  buildSpec?: BuildSpec | null;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
}): { run: boolean; reason: string } {
  const { buildSpec, finalizePath, repairPassIndex } = params;

  if (!finalizePath.runDeepPath) {
    return { run: false, reason: finalizePath.reason };
  }
  if (repairPassIndex > 0) {
    return { run: false, reason: "repair_pass" };
  }
  if (!isVerifierPassEnabled()) {
    return { run: false, reason: "disabled" };
  }
  if (!buildSpec) {
    return { run: true, reason: "missing_build_spec" };
  }
  if (buildSpec.verificationPolicy === "strict") {
    return { run: true, reason: "strict_policy" };
  }
  if (buildSpec.qualityTarget !== "standard") {
    return { run: true, reason: "high_quality_target" };
  }
  if (buildSpec.buildIntent === "app") {
    return { run: true, reason: "app_intent" };
  }
  if (buildSpec.contextPolicy === "heavy") {
    return { run: true, reason: "heavy_context" };
  }
  if (buildSpec.changeScope === "integration" || buildSpec.changeScope === "page-addition") {
    return { run: true, reason: "high_risk_change_scope" };
  }
  if (buildSpec.generationMode === "followUp" && buildSpec.changeScope === "redesign") {
    return { run: true, reason: "followup_redesign" };
  }
  return { run: false, reason: "no_verifier_signal" };
}

export class EmptyGenerationError extends Error {
  readonly chatId: string;
  readonly scaffoldId: string | null;

  constructor(chatId: string, scaffoldId: string | null) {
    super("Generation produced no code output");
    this.name = "EmptyGenerationError";
    this.chatId = chatId;
    this.scaffoldId = scaffoldId;
  }
}

export class PartialFileOutputError extends Error {
  readonly chatId: string;
  readonly scaffoldId: string | null;
  readonly issues: string[];

  constructor(chatId: string, scaffoldId: string | null, issues: string[]) {
    super("Generation produced partial file output");
    this.name = "PartialFileOutputError";
    this.chatId = chatId;
    this.scaffoldId = scaffoldId;
    this.issues = issues;
  }
}

function isPartialFileOutputIssue(issue: FinalizePreflightIssue): boolean {
  const message = issue.message.toLowerCase();
  return (
    message.includes("partial repair snippet") ||
    message.includes("file excerpt instead of a complete file") ||
    message.includes("overlapping import statements") ||
    message.includes("nested import inside an unfinished import block")
  );
}

const PARTIAL_FILE_REPAIR_TIMEOUT_MS = 60_000;

function extractPartialFileNames(issues: string[]): string[] {
  const files: string[] = [];
  for (const issue of issues) {
    const colonIdx = issue.indexOf(":");
    if (colonIdx > 0) {
      const candidate = issue.slice(0, colonIdx).trim();
      if (candidate && /\.\w{2,4}$/.test(candidate)) files.push(candidate);
    }
  }
  return [...new Set(files)];
}

function formatPartialIssuesAsFixerErrors(
  partialFiles: string[],
  issues: string[],
): string[] {
  const errors = partialFiles.map(
    (f) =>
      `${f}:1:1 CRITICAL: This file contains only a partial snippet or excerpt. Output the COMPLETE file from the first import to the last line.`,
  );
  for (const issue of issues) {
    if (!errors.some((e) => issue.startsWith(e.split(":")[0]))) {
      errors.push(issue);
    }
  }
  return errors;
}

async function tryRepairPartialFileOutput(params: {
  contentForVersion: string;
  chatId: string;
  resolvedTier?: CanonicalModelId;
  partialFileIssues: string[];
}): Promise<string | null> {
  const { contentForVersion, chatId, resolvedTier, partialFileIssues } = params;
  const partialFiles = extractPartialFileNames(partialFileIssues);
  if (partialFiles.length === 0) return null;

  const fixerModel = resolvedTier
    ? resolvePhaseModel(resolvedTier, "fixer").modelId
    : undefined;
  const fixerThinking = resolvedTier
    ? resolvePhaseThinking(resolvedTier, "fixer")
    : null;
  const errors = formatPartialIssuesAsFixerErrors(partialFiles, partialFileIssues);

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), PARTIAL_FILE_REPAIR_TIMEOUT_MS);
  try {
    const result = await runLlmFixer(contentForVersion, errors, {
      model: fixerModel,
      thinking: fixerThinking?.thinking,
      reasoningEffort: fixerThinking?.reasoningEffort,
      requiredFiles: partialFiles,
      abortSignal: abort.signal,
    });
    if (!result.success && !result.partial) return null;
    const reFixed = await runAutoFix(result.fixedContent);
    return reFixed.fixedContent;
  } catch (err) {
    devLogAppend("in-progress", {
      type: "partial-file-repair.error",
      chatId,
      message: err instanceof Error ? err.message : "Unknown repair error",
      partialFiles,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveFinalizePathPolicy(params: {
  buildSpec?: BuildSpec | null;
  repairPassIndex: number;
}): FinalizePathPolicy {
  const { buildSpec, repairPassIndex } = params;
  if (!FEATURES.useFinalizeDeepPath) {
    // Historical env naming: false here disables the light pipeline shortcut
    // and keeps finalize on the full pipeline for every run.
    return { runDeepPath: true, reason: "fast_path_disabled_by_flag" };
  }
  if (repairPassIndex > 0) {
    return { runDeepPath: true, reason: "repair_pass" };
  }
  const isLightFollowUp =
    buildSpec?.generationMode === "followUp" &&
    buildSpec?.verificationPolicy === "fast" &&
    buildSpec?.contextPolicy === "light" &&
    (buildSpec?.changeScope === "copy" || buildSpec?.changeScope === "local-layout");
  if (isLightFollowUp) {
    return { runDeepPath: false, reason: "light_followup_fast_policy" };
  }
  return { runDeepPath: true, reason: "default" };
}

function ensureNonEmptyGenerationContent(params: {
  contentForVersion: string;
  chatId: string;
  resolvedScaffold: ScaffoldManifest | null;
  previousFiles?: CodeFile[];
  stage: "before_validation" | "after_validation";
}): void {
  const { contentForVersion, chatId, resolvedScaffold, previousFiles, stage } = params;
  if (contentForVersion.trim()) return;
  warnLog(
    "engine",
    stage === "before_validation"
      ? "Skipping empty generation output"
      : "Skipping empty generation output after validation",
    {
      chatId,
      scaffold: resolvedScaffold?.id ?? null,
      hadPreviousFiles: Boolean(previousFiles && previousFiles.length > 0),
    },
  );
  throw new EmptyGenerationError(chatId, resolvedScaffold?.id ?? null);
}

async function runFinalizeFastPath(params: {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
  buildSpec?: BuildSpec | null;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  previousFiles?: CodeFile[];
  onProgress?: FinalizeProgressCallback;
  contentForVersion: string;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
}): Promise<FinalizeFastPathResult> {
  const {
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    resolvedScaffold,
    routePlan,
    orchestrationContract,
    previousFiles,
    onProgress,
    finalizePath,
    repairPassIndex,
  } = params;
  let contentForVersion = params.contentForVersion;
  const stepTelemetry: FinalizeStepTelemetryMap = {};

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "before_validation",
  });

  const validateStartedAt = Date.now();
  onProgress?.("validate_syntax", { phase: "start" });
  const syntaxResult = await validateAndFix(contentForVersion, {
    chatId,
    model,
    resolvedTier,
    onProgress: (evt) => {
      onProgress?.("validate_syntax", {
        pass: evt.pass,
        phase: evt.phase,
        errorCount: evt.errorCount,
      });
    },
  });
  contentForVersion = syntaxResult.content;
  onProgress?.("validate_syntax", {
    phase: "done",
    durationMs: Date.now() - validateStartedAt,
    fixerUsed: syntaxResult.fixerUsed,
    errorsBefore: syntaxResult.errorsBefore,
    errorsAfter: syntaxResult.errorsAfter,
    result: syntaxResult.status,
  });
  stepTelemetry.validate_syntax = createFinalizeStepTelemetry(validateStartedAt, "done", {
    fixerUsed: syntaxResult.fixerUsed,
    fixerImproved: syntaxResult.fixerImproved,
    errorsBefore: syntaxResult.errorsBefore,
    errorsAfter: syntaxResult.errorsAfter,
    earlyStopReason: syntaxResult.earlyStopReason,
    result: syntaxResult.status,
  });

  if (syntaxResult.fixerUsed || syntaxResult.status !== "passed") {
    devLogAppend("in-progress", {
      type: "syntax-validation.result",
      chatId,
      fixerImproved: syntaxResult.fixerImproved,
      errorsBefore: syntaxResult.errorsBefore,
      errorsAfter: syntaxResult.errorsAfter,
      status: syntaxResult.status,
      pipelineError: syntaxResult.pipelineError,
      scaffoldId: params.resolvedScaffold?.id ?? null,
      resolvedTier: params.resolvedTier ?? null,
    });
  }

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "after_validation",
  });

  if (finalizePath.runDeepPath) {
    const imageStartedAt = Date.now();
    const maxReplacements = resolveImageMaterializationLimit(buildSpec);
    onProgress?.("materialize_images", { phase: "start" });
    try {
      const imgResult = await materializeImages(contentForVersion, { maxReplacements });
      if (imgResult.replacedCount > 0) {
        contentForVersion = imgResult.content;
        devLogAppend("in-progress", {
          type: "image-materialization",
          chatId,
          replacedCount: imgResult.replacedCount,
          skippedCount: imgResult.skippedCount,
          queries: imgResult.queries.slice(0, 10),
        });
      }
      onProgress?.("materialize_images", {
        phase: "done",
        durationMs: Date.now() - imageStartedAt,
        replacedCount: imgResult.replacedCount,
        skippedCount: imgResult.skippedCount,
      });
      stepTelemetry.materialize_images = createFinalizeStepTelemetry(imageStartedAt, "done", {
        maxReplacements,
        replacedCount: imgResult.replacedCount,
        skippedCount: imgResult.skippedCount,
      });
    } catch (imgErr) {
      console.warn("[image-materializer] Non-fatal error, continuing with placeholders:", imgErr);
      onProgress?.("materialize_images", { phase: "error" });
      stepTelemetry.materialize_images = createFinalizeStepTelemetry(imageStartedAt, "error");
    }
  } else {
    onProgress?.("materialize_images", { phase: "skipped", reason: finalizePath.reason });
    stepTelemetry.materialize_images = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: finalizePath.reason,
    });
  }

  const verifierTier = resolvedTier ?? "pro";
  const verifierPolicy = resolveVerifierPassPolicy({
    buildSpec,
    finalizePath,
    repairPassIndex,
  });
  let verifierBlockingFindings: Array<{ id: string; detail: string }> = [];
  if (verifierPolicy.run) {
    const verifierStartedAt = Date.now();
    onProgress?.("verifier", { phase: "start" });
    try {
      const findings = await runVerifierPass(contentForVersion, { resolvedTier: verifierTier });
      verifierBlockingFindings = findings.blocking.slice(0, 5);
      devLogAppend("in-progress", {
        type: "verifier-pass",
        chatId,
        blocking: findings.blocking.length,
        quality: findings.quality.length,
        blockingFindings: findings.blocking.slice(0, 5),
        qualityFindings: findings.quality.slice(0, 5),
        scaffoldId: params.resolvedScaffold?.id ?? null,
        resolvedTier: params.resolvedTier ?? null,
      });
      onProgress?.("verifier", {
        phase: "done",
        durationMs: Date.now() - verifierStartedAt,
        blockingCount: findings.blocking.length,
        qualityCount: findings.quality.length,
      });
      stepTelemetry.verifier = createFinalizeStepTelemetry(verifierStartedAt, "done", {
        trigger: verifierPolicy.reason,
        blockingCount: findings.blocking.length,
        qualityCount: findings.quality.length,
      });
    } catch (verifierErr) {
      console.warn("[verifier-pass] Non-fatal error, skipping:", verifierErr);
      onProgress?.("verifier", { phase: "error" });
      stepTelemetry.verifier = createFinalizeStepTelemetry(verifierStartedAt, "error");
    }
  } else {
    onProgress?.("verifier", {
      phase: "skipped",
      reason: verifierPolicy.reason,
    });
    stepTelemetry.verifier = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: verifierPolicy.reason,
    });
  }

  const parseMergePreflightStartedAt = Date.now();
  onProgress?.("parse_merge_preflight", { phase: "start" });

  let filesJson = parseFilesFromContent(contentForVersion);
  const generatedFiles = (
    JSON.parse(filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>
  ).map((f) => ({ ...f, language: f.language || "tsx" }));

  filesJson = mergeGeneratedProjectFiles({
    chatId,
    originalFilesJson: filesJson,
    generatedFiles,
    resolvedScaffold,
    previousFiles,
  });

  if (previousFiles && previousFiles.length > 0) {
    const previousContentLen = previousFiles.reduce((sum, f) => sum + (f.content?.length ?? 0), 0);
    const mergedContentLen = filesJson.length;
    const shrinkRatio = previousContentLen > 0 ? mergedContentLen / previousContentLen : 1;
    if (shrinkRatio < 0.25 && previousContentLen > 2000) {
      warnLog("engine", "Follow-up output is drastically smaller than previous version", {
        chatId,
        previousContentLen,
        mergedContentLen,
        shrinkRatio: Math.round(shrinkRatio * 100),
        generatedFileCount: generatedFiles.length,
        previousFileCount: previousFiles.length,
      });
      devLogAppend("in-progress", {
        type: "finalize.content-shrink-warning",
        chatId,
        previousContentLen,
        mergedContentLen,
        shrinkPercent: Math.round((1 - shrinkRatio) * 100),
        generatedFileCount: generatedFiles.length,
        previousFileCount: previousFiles.length,
      });
    }
  }

  let preflightResult = await runFinalizePreflight({
    chatId,
    model,
    resolvedTier,
    filesJson,
    buildSpec,
    routePlan,
    orchestrationContract,
    originalPrompt,
  });
  filesJson = preflightResult.filesJson;
  filesJson = injectIntegrationManifestIntoFilesJson(filesJson);
  let finalizedFilesForPreview = preflightResult.finalizedFilesForPreview;
  let preflightFileCount = preflightResult.preflightFileCount;
  let preflightIssues = preflightResult.preflightIssues;
  let previewBlockingReason = preflightResult.previewBlockingReason;
  let partialFileIssues = preflightIssues
    .filter(isPartialFileOutputIssue)
    .map((issue) => `${issue.file}: ${issue.message}`);

  if (partialFileIssues.length > 0) {
    const originalPartialCount = partialFileIssues.length;
    devLogAppend("in-progress", {
      type: "partial-file-repair.attempting",
      chatId,
      issueCount: originalPartialCount,
      issues: partialFileIssues,
    });
    onProgress?.("parse_merge_preflight", {
      phase: "partial_file_repair",
      issueCount: originalPartialCount,
    });

    const repairedContent = await tryRepairPartialFileOutput({
      contentForVersion,
      chatId,
      resolvedTier,
      partialFileIssues,
    });

    if (repairedContent) {
      contentForVersion = repairedContent;
      filesJson = parseFilesFromContent(contentForVersion);
      const reGeneratedFiles = (
        JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>
      ).map((f) => ({ ...f, language: f.language || "tsx" }));

      filesJson = mergeGeneratedProjectFiles({
        chatId,
        originalFilesJson: filesJson,
        generatedFiles: reGeneratedFiles,
        resolvedScaffold,
        previousFiles,
      });

      preflightResult = await runFinalizePreflight({
        chatId,
        model,
        resolvedTier,
        filesJson,
        buildSpec,
        routePlan,
        orchestrationContract,
        originalPrompt,
      });
      filesJson = preflightResult.filesJson;
      filesJson = injectIntegrationManifestIntoFilesJson(filesJson);
      finalizedFilesForPreview = preflightResult.finalizedFilesForPreview;
      preflightFileCount = preflightResult.preflightFileCount;
      preflightIssues = preflightResult.preflightIssues;
      previewBlockingReason = preflightResult.previewBlockingReason;
      partialFileIssues = preflightIssues
        .filter(isPartialFileOutputIssue)
        .map((issue) => `${issue.file}: ${issue.message}`);
    }

    if (partialFileIssues.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity.error",
        chatId,
        message: repairedContent
          ? "Partial file repair attempted but issues persist."
          : "Generation produced partial file output before persist.",
        issues: partialFileIssues,
        repairAttempted: Boolean(repairedContent),
      });
      throw new PartialFileOutputError(
        chatId,
        resolvedScaffold?.id ?? null,
        partialFileIssues,
      );
    }

    devLogAppend("in-progress", {
      type: "partial-file-repair.success",
      chatId,
      repairedFileCount: originalPartialCount,
    });
  }

  let scaffoldRetry: ScaffoldRetrySuggestion | null = null;
  if (resolvedScaffold && originalPrompt && buildIntent) {
    scaffoldRetry = await inferScaffoldRetrySuggestion({
      prompt: originalPrompt,
      buildIntent,
      resolvedScaffold,
      preflightIssues,
      previewBlockingReason,
      finalizedFilesForPreview,
    });
    if (scaffoldRetry) {
      devLogAppend("in-progress", {
        type: "scaffold-retry.suggested",
        chatId,
        currentScaffoldId: scaffoldRetry.currentScaffoldId,
        suggestedScaffoldId: scaffoldRetry.suggestedScaffoldId,
        failureType: scaffoldRetry.failureType,
        source: scaffoldRetry.source,
        confidence: scaffoldRetry.confidence,
      });
    }
  }

  stepTelemetry.parse_merge_preflight = createFinalizeStepTelemetry(
    parseMergePreflightStartedAt,
    "done",
    {
      fileCount: preflightFileCount,
      issueCount: preflightIssues.length,
      previewBlocked: Boolean(previewBlockingReason),
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
    },
  );

  return {
    contentForVersion,
    syntaxResult,
    filesJson,
    preflightResult,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    finalizedFilesForPreview,
    scaffoldRetry,
    verifierBlockingFindings,
    stepTelemetry,
  };
}

/**
 * Shared post-generation pipeline: autofix -> URL expansion -> syntax validate/fix ->
 * image materialize -> optional verifier -> file parsing -> scaffold merge ->
 * preflight -> assistant message -> version save.
 *
 * Assistant row + draft version are persisted in one DB transaction (no orphan assistant
 * if version insert fails). Steps after that (preflight error logs, telemetry, generation
 * log, verification state) are best-effort: the user already has a saved version + message;
 * failures there are logged but do not roll back the version.
 */
export async function finalizeAndSaveVersion(
  params: FinalizeParams,
): Promise<FinalizeResult> {
  const finalizePipelineStartedAt = Date.now();
  const {
    accumulatedContent,
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    routePlan,
    orchestrationContract,
    resolvedScaffold,
    urlMap,
    startedAt,
    runAutofix = true,
    tokenUsage,
    logNote,
    previousFiles,
    onProgress,
    orchestrationStreamMeta,
    repairPassIndex = 0,
    lineageHash,
    targetVersionId,
  } = params;

  let contentForVersion = accumulatedContent;
  const finalizePath = resolveFinalizePathPolicy({ buildSpec, repairPassIndex });
  let autoFixFixCount = 0;
  let autoFixWarningCount = 0;
  let autoFixDependencyCount = 0;
  let autoFixHeavyLoad = false;
  let telemetryRecordId: string | null = null;
  const finalizeStepTelemetry: FinalizeStepTelemetryMap = {};
  const resolveStepDurationMs = (step: OwnEnginePostStreamPhaseId): number => {
    const duration = finalizeStepTelemetry[step]?.durationMs;
    return typeof duration === "number" && Number.isFinite(duration) ? duration : 0;
  };

  devLogAppend("in-progress", {
    type: "finalize.pipeline",
    chatId,
    phases: OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id),
    repairPassIndex,
    finalizePath: finalizePath.runDeepPath ? "full" : "light",
    finalizePathReason: finalizePath.reason,
  });

  // 1. Autofix
  if (runAutofix) {
    const autoFixStartedAt = Date.now();
    onProgress?.("autofix", { phase: "start", chatId });
    try {
      const autoFixResult = await runAutoFix(accumulatedContent, {
        chatId,
        model,
      });
      contentForVersion = autoFixResult.fixedContent;
      autoFixFixCount = autoFixResult.fixes.length;
      autoFixWarningCount = autoFixResult.warnings.length;
      autoFixDependencyCount = Object.keys(autoFixResult.dependencies).length;
      autoFixHeavyLoad = autoFixFixCount > 5;

      if (autoFixResult.fixes.length > 0 || autoFixResult.warnings.length > 0) {
        devLogAppend("in-progress", {
          type: "autofix.result",
          chatId,
          fixes: autoFixResult.fixes,
          warnings: autoFixResult.warnings.slice(0, 20),
          dependencies: autoFixResult.dependencies,
          scaffoldId: params.resolvedScaffold?.id ?? null,
          resolvedTier: params.resolvedTier ?? null,
        });
      }
      if (autoFixHeavyLoad) {
        devLogAppend("in-progress", {
          type: "autofix.heavy_load",
          chatId,
          fixCount: autoFixFixCount,
          threshold: 5,
          warning:
            "Deterministic autofix had to repair many issues. This usually indicates instability earlier in generation.",
          scaffoldId: params.resolvedScaffold?.id ?? null,
        });
      }
      onProgress?.("autofix", {
        phase: "done",
        durationMs: Date.now() - autoFixStartedAt,
        fixes: autoFixResult.fixes.length,
        warnings: autoFixResult.warnings.length,
      });
      finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "done", {
        fixCount: autoFixResult.fixes.length,
        warningCount: autoFixResult.warnings.length,
        dependencyCount: Object.keys(autoFixResult.dependencies).length,
      });
    } catch (autofixErr) {
      console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
      onProgress?.("autofix", { phase: "error" });
      finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "error");
    }
  } else {
    finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: "disabled",
    });
  }

  // 2. URL expansion (before verifier / parse)
  const urlExpandStartedAt = Date.now();
  onProgress?.("url_expand", { phase: "start" });
  contentForVersion = expandUrls(contentForVersion, urlMap);
  onProgress?.("url_expand", { phase: "done", durationMs: Date.now() - urlExpandStartedAt });
  finalizeStepTelemetry.url_expand = createFinalizeStepTelemetry(urlExpandStartedAt, "done");

  const {
    contentForVersion: fastPathContent,
    syntaxResult,
    filesJson,
    preflightResult,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    finalizedFilesForPreview,
    scaffoldRetry,
    verifierBlockingFindings,
    stepTelemetry: fastPathStepTelemetry,
  } = await runFinalizeFastPath({
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    resolvedScaffold,
    routePlan,
    orchestrationContract,
    previousFiles,
    onProgress,
    contentForVersion,
    finalizePath,
    repairPassIndex,
  });
  contentForVersion = fastPathContent;
  Object.assign(finalizeStepTelemetry, fastPathStepTelemetry);

  // 5–6. Persist assistant + version atomically after merge/preflight.
  // When targetVersionId is set (autofix / repair), update existing version in-place
  // instead of minting a new version number.
  const { message: assistantMsg, version: initialVersion } = targetVersionId
    ? await chatRepo.addAssistantMessageAndUpdateExistingVersion(
        chatId,
        targetVersionId,
        contentForVersion,
        filesJson,
      )
    : await chatRepo.addAssistantMessageAndCreateDraftVersion(chatId, contentForVersion, filesJson);
  let version = initialVersion;
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
    repairPassIndex,
    lineageHash: lineageHash ?? null,
  });

  if (orchestrationStreamMeta && typeof orchestrationStreamMeta === "object") {
    try {
      const snap = buildPersistedOrchestrationSnapshot({
        streamMeta: { ...orchestrationStreamMeta, lineageHash: lineageHash ?? undefined },
        versionId: version.id,
        chatId,
        buildIntent: buildIntent ?? null,
      });
      const previous = await chatRepo.getChatOrchestrationSnapshot(chatId);
      const merged = mergePersistedOrchestrationSnapshots(previous, snap);
      await chatRepo.updateChatOrchestrationSnapshot(chatId, merged);
    } catch (e) {
      console.warn("[orchestration-snapshot] Failed to persist:", e);
    }
  }
  const scaffoldSelection =
    orchestrationStreamMeta?.scaffoldSelection &&
    typeof orchestrationStreamMeta.scaffoldSelection === "object"
      ? (orchestrationStreamMeta.scaffoldSelection as Record<string, unknown>)
      : null;
  const {
    preflightErrors,
    preflightWarnings,
    hasVerificationBlockingPreflightErrors,
    hasPreviewBlockingPreflightErrors,
    preflightLogs: rawPreflightLogs,
    preflightFailureSummary,
  } = buildFinalizePreflightLogBundle({
    chatId,
    versionId: version.id,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    previewStart: preflightResult.previewStart,
    finalizedPreviewFileCount: finalizedFilesForPreview.length,
    scaffoldRetry,
    routePlan,
    scaffoldSelection,
  });
  const logPassId = `${version.id}:repair-${repairPassIndex}:${Date.now()}`;
  const withLogPassMeta = <T extends { meta?: Record<string, unknown> | null }>(log: T): T => ({
    ...log,
    meta: {
      ...(log.meta ?? {}),
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  });
  const preflightLogs = rawPreflightLogs.map((log) => withLogPassMeta(log));
  const syntaxFailureLog = buildSyntaxFailureLog({
    chatId,
    versionId: version.id,
    syntaxResult,
    logPassId,
    repairPassIndex,
    lineageHash,
  });
  if (syntaxFailureLog) {
    preflightLogs.unshift(syntaxFailureLog);
  }
  const verifierFailureLogs = buildVerifierFailureLogs({
    chatId,
    versionId: version.id,
    blockingFindings: verifierBlockingFindings,
    logPassId,
    repairPassIndex,
    lineageHash,
  });
  if (verifierFailureLogs.length > 0) {
    preflightLogs.push(...verifierFailureLogs);
  }
  if (autoFixHeavyLoad) {
    preflightLogs.push({
      chatId,
      versionId: version.id,
      level: "warning",
      category: "autofix",
      message:
        "Deterministic autofix applied many repairs; generation quality may be unstable upstream.",
      meta: {
        event: "autofix_heavy_load",
        fixCount: autoFixFixCount,
        threshold: 5,
        warningCount: autoFixWarningCount,
        dependencyCount: autoFixDependencyCount,
        logPassId,
        repairPassIndex,
        lineageHash: lineageHash ?? null,
      },
    });
  }
  devLogAppend("in-progress", {
    type: "preflight.summary",
    chatId,
    versionId: version.id,
    filesChecked: preflightFileCount,
    issueCount: preflightIssues.length,
    errorCount: preflightErrors.length,
    warningCount: preflightWarnings.length,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    previewBlockingReason,
    scaffoldRetry,
    scaffoldSelection,
  });
  onProgress?.("parse_merge_preflight", {
    phase: "done",
    durationMs: resolveStepDurationMs("parse_merge_preflight"),
    versionId: version.id,
    fileCount: preflightFileCount,
    issueCount: preflightIssues.length,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
  });
  try {
    await createEngineVersionErrorLogs(preflightLogs);
    devLogAppend("in-progress", {
      type: "preflight.logs.persisted",
      chatId,
      versionId: version.id,
      logCount: preflightLogs.length,
    });
  } catch (logErr) {
    console.warn("[preflight] Failed to persist engine version error logs:", logErr);
    devLogAppend("in-progress", {
      type: "preflight.logs.persist-error",
      chatId,
      versionId: version.id,
      logCount: preflightLogs.length,
      message: logErr instanceof Error ? logErr.message : "Unknown preflight log persistence error",
    });
  }

  try {
    const telemetryMeta: Record<string, unknown> = {
      finalizePath: finalizePath.runDeepPath ? "full" : "light",
      finalizePathReason: finalizePath.reason,
      postStreamSteps: finalizeStepTelemetry,
      repairPassIndex,
      autofix: {
        fixCount: autoFixFixCount,
        warningCount: autoFixWarningCount,
        dependencyCount: autoFixDependencyCount,
        heavyLoad: autoFixHeavyLoad,
      },
      preflight: {
        previewBlocked: hasPreviewBlockingPreflightErrors,
        verificationBlocked: hasVerificationBlockingPreflightErrors,
        issueCount: preflightIssues.length,
        previewFileCount: finalizedFilesForPreview.length,
        unresolvedImportFallbackUsed: preflightResult.unresolvedImportFallbackUsed,
      },
    };
    if (buildSpec) {
      telemetryMeta.buildSpec = {
        generationMode: buildSpec.generationMode,
        changeScope: buildSpec.changeScope,
        qualityTarget: buildSpec.qualityTarget,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        contextPolicy: buildSpec.contextPolicy,
        scaffoldId: buildSpec.scaffoldId,
        stylePack: buildSpec.stylePack,
      };
    }
    if (resolvedTier && isCanonicalModelId(resolvedTier)) {
      telemetryMeta.phaseRouting = getPhaseRoutingSummary(resolvedTier);
    }
    const tls = orchestrationStreamMeta?.templateLibrarySearch;
    if (tls && typeof tls === "object") {
      telemetryMeta.templateLibrarySearch = tls;
    }

    const scaffoldSelectionMethod =
      scaffoldSelection && typeof scaffoldSelection.selectionMethod === "string"
        ? scaffoldSelection.selectionMethod
        : null;
    const scaffoldSelectionConfidence =
      scaffoldSelection && typeof scaffoldSelection.selectionConfidence === "string"
        ? scaffoldSelection.selectionConfidence
        : null;
    const briefInfluencedSelection =
      scaffoldSelection?.briefContextApplied === true;

    const telemetryRecord = await createGenerationTelemetryRecord({
      chatId,
      versionId: version.id,
      scaffoldId: resolvedScaffold?.id ?? null,
      scaffoldSelectionMethod,
      scaffoldSelectionConfidence,
      briefInfluencedSelection,
      model,
      buildIntent: buildIntent ?? null,
      retryCount: repairPassIndex,
      autofixApplied: runAutofix,
      syntaxFixerUsed: syntaxResult.fixerUsed,
      preflightErrorCount: preflightErrors.length,
      preflightWarningCount: preflightWarnings.length,
      previewSuccess: !hasPreviewBlockingPreflightErrors,
      previewBlockingReason,
      qualityGateResult: hasVerificationBlockingPreflightErrors
        ? "preflight_failed"
        : "preflight_passed",
      durationMs: Date.now() - startedAt,
      promptTokens: tokenUsage?.prompt ?? null,
      completionTokens: tokenUsage?.completion ?? null,
      fileCount: preflightFileCount,
      scaffoldRetryUsed: false,
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
      meta: telemetryMeta,
    });
    telemetryRecordId =
      telemetryRecord && typeof telemetryRecord.id === "string"
        ? telemetryRecord.id
        : null;
  } catch (telemetryErr) {
    console.warn("[telemetry] Failed to write generation telemetry:", telemetryErr);
  }

  // 7. Log generation
  try {
    await chatRepo.logGeneration(
      chatId,
      model,
      {
        prompt: tokenUsage?.prompt,
        completion: tokenUsage?.completion,
      },
      Date.now() - startedAt,
      !hasVerificationBlockingPreflightErrors,
      hasVerificationBlockingPreflightErrors ? preflightFailureSummary : logNote,
    );
    devLogAppend("in-progress", {
      type: "generation-log.persisted",
      chatId,
      versionId: version.id,
      model,
    });
  } catch (generationLogErr) {
    console.warn("[generation-log] Failed to persist engine generation log:", generationLogErr);
    devLogAppend("in-progress", {
      type: "generation-log.persist-error",
      chatId,
      versionId: version.id,
      model,
      message:
        generationLogErr instanceof Error
          ? generationLogErr.message
          : "Unknown generation log persistence error",
    });
  }

  if (hasVerificationBlockingPreflightErrors) {
    try {
      const failedVersion = await chatRepo.failVersionVerification(
        version.id,
        preflightFailureSummary,
      );
      if (failedVersion?.id) {
        version = failedVersion;
      }
      devLogAppend("in-progress", {
        type: "preflight.version.failed",
        chatId,
        versionId: version.id,
        errorCount: preflightErrors.length,
      });
    } catch (verificationErr) {
      console.warn("[preflight] Failed to mark version failed after blocking errors:", verificationErr);
      devLogAppend("in-progress", {
        type: "preflight.version.fail-error",
        chatId,
        versionId: version.id,
        message:
          verificationErr instanceof Error
            ? verificationErr.message
            : "Unknown preflight verification update error",
      });
    }
  }

  debugLog("finalize", "Finalize pipeline complete", {
    chatId,
    versionId: version.id,
    autofix: resolveStepDurationMs("autofix"),
    urlExpand: resolveStepDurationMs("url_expand"),
    syntaxValidation: resolveStepDurationMs("validate_syntax"),
    imageMaterialization: resolveStepDurationMs("materialize_images"),
    verifier: resolveStepDurationMs("verifier"),
    parseMergePreflight: resolveStepDurationMs("parse_merge_preflight"),
    totalMs: Math.max(0, Date.now() - finalizePipelineStartedAt),
  });

  debugLog("engine", "Version saved via finalizeAndSaveVersion", {
    chatId,
    versionId: version.id,
    contentLen: contentForVersion.length,
    scaffold: resolvedScaffold?.id ?? null,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
  });

  return {
    version,
    messageId: assistantMsg.id,
    telemetryRecordId,
    previewUrl: null,
    tier2PreviewUrl: null,
    filesJson,
    contentForVersion,
    preflight: {
      verificationBlocked: hasVerificationBlockingPreflightErrors,
      previewBlocked: hasPreviewBlockingPreflightErrors,
      issueCount: preflightIssues.length,
      errorCount: preflightErrors.length,
      warningCount: preflightWarnings.length,
      previewBlockingReason,
      primaryPreviewTarget: preflightResult.previewStart.primaryPreviewTarget,
      issueCategories: [...new Set(preflightIssues.map((issue) => issue.category))],
      previewStart: preflightResult.previewStart,
      scaffoldRetry,
      routePlan,
    },
  };
}
