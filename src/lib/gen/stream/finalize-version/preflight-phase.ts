/**
 * Parse + merge + preflight phase for `runFinalizeFastPath`. Handles:
 *
 *  - CodeProject → files JSON parsing (via `parseFilesFromContent`)
 *  - `mergeGeneratedProjectFiles` against scaffold/previous
 *  - OMTAG 1·05 scaffold-default block (missing emitted essentials)
 *  - `injectIntegrationManifestIntoFilesJson` + project env injection
 *  - `runFinalizePreflight`
 *  - Partial-file repair retry (re-parse/merge/preflight if the repair
 *    LLM produced content)
 *  - `inferScaffoldRetrySuggestion`
 *  - Content-shrink warning on follow-ups
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CodeFile } from "@/lib/gen/parser";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { ScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { inferScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { warnLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { injectIntegrationManifestIntoFilesJson } from "@/lib/integrations/inject-integration-manifest";
import { injectProjectEnvFileIntoFilesJson } from "@/lib/gen/preview/project-env-file";
import { mergeGeneratedProjectFiles } from "../finalize-merge";
import {
  runFinalizePreflight,
  type FinalizePreflightIssue,
} from "../finalize-preflight";
import { createFinalizeStepTelemetry } from "./step-telemetry";
import { PartialFileOutputError } from "./errors";
import {
  isPartialFileOutputIssue,
  tryRepairPartialFileOutput,
} from "./partial-file";
import type {
  FinalizePreflightResult,
  FinalizeProgressCallback,
  FinalizeStepTelemetry,
} from "./types";

export interface PreflightPhaseResult {
  contentForVersion: string;
  filesJson: string;
  preflightResult: FinalizePreflightResult;
  preflightIssues: FinalizePreflightIssue[];
  preflightFileCount: number;
  previewBlockingReason: string | null;
  finalizedFilesForPreview: CodeFile[];
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  rejectedShrinks: Array<{ file: string; previousSize: number; newSize: number }>;
  rejectedStructural: Array<{
    file: string;
    droppedElements: Array<{ kind: string; label: string }>;
  }>;
  /**
   * Cross-file imports that resolved to missing files. The checker either
   * stubs them or rewires obvious sibling-name mistakes; post-finalize
   * persists a `warning`-level diagnostics row for both cases.
   */
  crossFileStubs: Array<{
    sourceFile: string;
    missingImport: string;
    stubFile: string;
    rewireTarget?: string;
    dossierId?: string;
    capability?: string;
  }>;
  stepTelemetry: FinalizeStepTelemetry;
}

export async function runPreflightPhase(params: {
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
  contentForVersion: string;
  onProgress?: FinalizeProgressCallback;
  /**
   * Dossiers vars verbatim-filer ska skyddas mot LLM-omskrivning i merge.
   * Trådas in från finalize-runner som härleder via orchestrationStreamMeta.
   * Om tom: verbatim-policy körs men hittar inga dossiers att skydda.
   */
  selectedDossiers?: DossierEntry[];
}): Promise<PreflightPhaseResult> {
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
    selectedDossiers,
  } = params;
  let contentForVersion = params.contentForVersion;

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

  const mergeResult = mergeGeneratedProjectFiles({
    chatId,
    originalFilesJson: filesJson,
    generatedFiles,
    resolvedScaffold,
    previousFiles,
    selectedDossiers,
  });
  filesJson = mergeResult.filesJson;
  let rejectedShrinks = mergeResult.rejectedShrinks;
  let rejectedStructural = mergeResult.rejectedStructural;
  let crossFileStubs = mergeResult.crossFileStubs;

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
  // OMTAG 1·05: scaffold-default blocking on LLM-only paths surfaces as a
  // hard preflight error so the version is marked verification-blocked
  // rather than silently serving a scaffold page.tsx under a user-specific
  // layout.tsx ("Nordic Future Summit" bug class).
  if (mergeResult.missingEmittedEssentials.length > 0) {
    const blockedIssues: FinalizePreflightIssue[] = mergeResult.missingEmittedEssentials.map(
      (path) => ({
        file: path,
        severity: "error" as const,
        message: `LLM did not emit ${path}; scaffold default was blocked to prevent brand leak (OMTAG 05).`,
        category: "code_structure_failure" as const,
      }),
    );
    preflightResult = {
      ...preflightResult,
      preflightIssues: [...preflightResult.preflightIssues, ...blockedIssues],
    };
  }
  const envLifecycleStage =
    buildSpec?.previewPolicy === "fidelity3" ? "integrations" : "design";
  filesJson = injectIntegrationManifestIntoFilesJson(filesJson, {
    lifecycleStage: envLifecycleStage,
  });

  // Cache appProjectId across both injection callsites (initial + post
  // partial-file-repair). Lookup is lazy because most generations don't
  // hit the repair branch.
  let cachedAppProjectId: string | null | undefined;
  const resolveAppProjectId = async (): Promise<string | null> => {
    if (cachedAppProjectId !== undefined) return cachedAppProjectId;
    try {
      const row = await chatRepo.getChat(chatId);
      const pid =
        typeof row?.project_id === "string" && row.project_id.trim()
          ? row.project_id.trim()
          : null;
      cachedAppProjectId = pid;
      return pid;
    } catch {
      cachedAppProjectId = null;
      return null;
    }
  };
  filesJson = await injectProjectEnvFileIntoFilesJson(filesJson, {
    appProjectId: await resolveAppProjectId(),
    lifecycleStage: envLifecycleStage,
  });
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

    const partialRepair = await tryRepairPartialFileOutput({
      contentForVersion,
      chatId,
      resolvedTier,
      partialFileIssues,
      previewPolicy: buildSpec?.previewPolicy,
    });
    const repairedContent = partialRepair.repairedContent;

    if (repairedContent) {
      contentForVersion = repairedContent;
      filesJson = parseFilesFromContent(contentForVersion);
      const reGeneratedFiles = (
        JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>
      ).map((f) => ({ ...f, language: f.language || "tsx" }));

      const remergeResult = mergeGeneratedProjectFiles({
        chatId,
        originalFilesJson: filesJson,
        generatedFiles: reGeneratedFiles,
        resolvedScaffold,
        previousFiles,
        selectedDossiers,
      });
      filesJson = remergeResult.filesJson;
      // Concat shrink/structural rejections from the remerge so the SSE
      // payload reflects the full picture across both merge passes.
      rejectedShrinks = [...rejectedShrinks, ...remergeResult.rejectedShrinks];
      rejectedStructural = [...rejectedStructural, ...remergeResult.rejectedStructural];
      crossFileStubs = [...crossFileStubs, ...remergeResult.crossFileStubs];

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
      // OMTAG 1·05: re-check LLM-only paths after the partial-file repair
      // remerge. If the repair LLM still didn't emit `app/page.tsx`, keep
      // the preflight error live.
      if (remergeResult.missingEmittedEssentials.length > 0) {
        const blockedIssues: FinalizePreflightIssue[] = remergeResult.missingEmittedEssentials.map(
          (path) => ({
            file: path,
            severity: "error" as const,
            message: `LLM did not emit ${path}; scaffold default was blocked to prevent brand leak (OMTAG 05).`,
            category: "code_structure_failure" as const,
          }),
        );
        preflightResult = {
          ...preflightResult,
          preflightIssues: [...preflightResult.preflightIssues, ...blockedIssues],
        };
      }
      filesJson = injectIntegrationManifestIntoFilesJson(filesJson, {
        lifecycleStage: envLifecycleStage,
      });
      filesJson = await injectProjectEnvFileIntoFilesJson(filesJson, {
        appProjectId: await resolveAppProjectId(),
        lifecycleStage: envLifecycleStage,
      });
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
        repairAttempted: partialRepair.attempts > 0,
        repairAttempts: partialRepair.attempts,
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
      repairAttempts: partialRepair.attempts,
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

  const stepTelemetry = createFinalizeStepTelemetry(
    parseMergePreflightStartedAt,
    "done",
    {
      fileCount: preflightFileCount,
      issueCount: preflightIssues.length,
      previewBlocked: !preflightResult.previewStart.canStartPreview,
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
    },
  );

  return {
    contentForVersion,
    filesJson,
    preflightResult,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    finalizedFilesForPreview,
    scaffoldRetry,
    rejectedShrinks,
    rejectedStructural,
    crossFileStubs,
    stepTelemetry,
  };
}
