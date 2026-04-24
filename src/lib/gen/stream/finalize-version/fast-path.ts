/**
 * `runFinalizeFastPath` — the post-autofix deep pipeline executed by
 * `finalizeAndSaveVersion` after URL expansion + mechanical autofix.
 *
 * Phases:
 *   1. validate syntax (+ optional forceTsc/forceEslint)
 *   2. materialize images (deep path only)
 *   3. verifier pass (+ optional LLM-fixer rerun)
 *   4. parse + merge + preflight (+ scaffold-default block check,
 *      integration manifest inject, project env inject, partial-file
 *      repair with retry)
 *   5. scaffold-retry suggestion
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change. Internally delegates verifier/preflight sub-logic to
 * `./verifier-phase.ts` and `./preflight-phase.ts` to keep each file
 * under the 400-line ceiling.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CodeFile } from "@/lib/gen/parser";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import { devLogAppend } from "@/lib/logging/devLog";
import { createFinalizeStepTelemetry } from "./step-telemetry";
import {
  ensureNonEmptyGenerationContent,
  resolveImageMaterializationLimit,
  resolveVerifierPassPolicy,
} from "./policy";
import { runVerifierPhase } from "./verifier-phase";
import { runPreflightPhase } from "./preflight-phase";
import type {
  FinalizeFastPathResult,
  FinalizePathPolicy,
  FinalizeProgressCallback,
  FinalizeStepTelemetryMap,
} from "./types";

export async function runFinalizeFastPath(params: {
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
  /**
   * True when the caller already ran a deterministic autofix pass on
   * `contentForVersion`. Forwarded to `validateAndFix` to skip its
   * redundant initial mechanical pass.
   */
  alreadyMechanicallyFixed: boolean;
  /**
   * True when a later quality-gate lane (client and/or async) is expected
   * to run for this generation.
   */
  willRunQualityGate: boolean;
  /**
   * Whether the downstream quality gate includes `typecheck`.
   */
  qualityGateChecksIncludesTypecheck: boolean;
  /**
   * Dossiers vars verbatim-filer ska skyddas vid merge. Trådas vidare
   * till `runPreflightPhase`. Default tom array (verbatim-policy körs men
   * hittar inga skyddade filer).
   */
  selectedDossiers?: DossierEntry[];
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
    alreadyMechanicallyFixed,
    willRunQualityGate,
    qualityGateChecksIncludesTypecheck,
    selectedDossiers,
  } = params;
  let contentForVersion = params.contentForVersion;
  const stepTelemetry: FinalizeStepTelemetryMap = {};
  // Wave 7 latens-vinst (~60s sparat per körning):
  // Om quality-gate kommer köra typecheck efteråt, hoppa över warm-tsc i finalize.
  //
  // FOTNOT (operativ risk): Om quality-gate sedan SKIP:as sent (t.ex. via
  // post-finalize-policy `design_preview_skip_verify` på F2-init med 0 preflight-fel),
  // har vi VARKEN warm-tsc-resultat NOR QG-resultat. Det är en medveten
  // trade-off för F2-design-preview där default är att skippa verify ändå —
  // men det är en lucka man ska känna till.
  //
  // Backoffice `llm_flode_telemetry.py` exponerar `warmTscSkipped`-rate i
  // `site.done`-events så vi kan mäta om luckan blir verklig i prod. Om
  // skip-rate blir hög + samtidigt design_preview_skip_verify körs ofta:
  // överväg fall-back-strategi i framtida wave (kör warm-tsc om policy
  // visar att QG skippas).
  const skipWarmTsc = willRunQualityGate && qualityGateChecksIncludesTypecheck;

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "before_validation",
  });

  // ── Phase 1: validate syntax ────────────────────────────────────────────
  const validateStartedAt = Date.now();
  onProgress?.("validate_syntax", { phase: "start" });
  const syntaxResult = await validateAndFix(contentForVersion, {
    chatId,
    model,
    resolvedTier,
    previewPolicy: buildSpec?.previewPolicy,
    alreadyMechanicallyFixed,
    // Wave 3 consolidation: the warm-tsc pass now lives inside
    // `validateAndFix` and runs after esbuild reaches `passed`. F3 keeps
    // forcing it on so the integrations build always pays for the check.
    resolvedScaffold,
    forceTsc: !skipWarmTsc && buildSpec?.previewPolicy === "fidelity3",
    skipWarmTsc,
    // P34 / SAJ-28: eslint pass mirrors tsc — feature-flag gated via
    // `SAJTMASKIN_BLOCKING_ESLINT`; F3 (integrations) also forces it on.
    forceEslint: buildSpec?.previewPolicy === "fidelity3",
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
    tsc: syntaxResult.tsc ?? null,
  });
  stepTelemetry.validate_syntax = createFinalizeStepTelemetry(validateStartedAt, "done", {
    fixerUsed: syntaxResult.fixerUsed,
    fixerImproved: syntaxResult.fixerImproved,
    errorsBefore: syntaxResult.errorsBefore,
    errorsAfter: syntaxResult.errorsAfter,
    earlyStopReason: syntaxResult.earlyStopReason,
    result: syntaxResult.status,
    tsc: syntaxResult.tsc ?? null,
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

  // ── Phase 2: materialize images (deep path only) ────────────────────────
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

  // ── Phase 3: verifier pass (+ optional LLM-fixer rerun) ─────────────────
  const verifierTier = resolvedTier ?? "pro";
  const verifierPolicy = resolveVerifierPassPolicy({
    buildSpec,
    finalizePath,
    repairPassIndex,
  });
  const verifierOutcome = await runVerifierPhase({
    enabled: verifierPolicy.run,
    reason: verifierPolicy.reason,
    chatId,
    model,
    resolvedTier,
    verifierTier,
    buildSpec,
    resolvedScaffold,
    repairPassIndex,
    contentForVersion,
    onProgress,
    runAutoFix: (content) =>
      runAutoFix(content, { chatId, model, previewPolicy: buildSpec?.previewPolicy }),
  });
  contentForVersion = verifierOutcome.contentForVersion;
  stepTelemetry.verifier = verifierOutcome.stepTelemetry;
  const verifierBlockingFindings = verifierOutcome.verifierBlockingFindings;

  // ── Phase 4: parse + merge + preflight + scaffold-retry ─────────────────
  const preflightOutcome = await runPreflightPhase({
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
    contentForVersion,
    onProgress,
    selectedDossiers,
  });

  return {
    contentForVersion: preflightOutcome.contentForVersion,
    syntaxResult,
    filesJson: preflightOutcome.filesJson,
    preflightResult: preflightOutcome.preflightResult,
    preflightIssues: preflightOutcome.preflightIssues,
    preflightFileCount: preflightOutcome.preflightFileCount,
    previewBlockingReason: preflightOutcome.previewBlockingReason,
    finalizedFilesForPreview: preflightOutcome.finalizedFilesForPreview,
    scaffoldRetry: preflightOutcome.scaffoldRetry,
    verifierBlockingFindings,
    rejectedShrinks: preflightOutcome.rejectedShrinks,
    rejectedStructural: preflightOutcome.rejectedStructural,
    crossFileStubs: preflightOutcome.crossFileStubs,
    stepTelemetry: {
      ...stepTelemetry,
      parse_merge_preflight: preflightOutcome.stepTelemetry,
    },
  };
}
