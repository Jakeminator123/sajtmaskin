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
import { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
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
import type { AutofixRiskSummary } from "./pre-phases";

const EMPTY_AUTOFIX_RISK: AutofixRiskSummary = {
  safeFixCount: 0,
  riskyFixCount: 0,
  riskyFixerIds: [],
};

function buildSpecOrCapabilitiesIndicate3D(params: {
  buildSpec?: BuildSpec | null;
  requestedCapabilities?: string[];
}): boolean {
  const buildSpecSignals = params.buildSpec?.capabilityFlags?.signals ?? [];
  if (buildSpecSignals.includes("needs3D") || buildSpecSignals.includes("needsPhysics")) {
    return true;
  }
  return (params.requestedCapabilities ?? []).some((capability) => {
    const normalized = capability.trim().toLowerCase();
    return (
      normalized === "visual-3d" ||
      normalized === "physics-3d" ||
      normalized === "needs3d" ||
      normalized === "needsphysics"
    );
  });
}

/**
 * Mirror of `isFeatureFlagEnabled` in
 * `src/lib/gen/preview/warm-typecheck.ts`. When `SAJTMASKIN_PRE_VM_TYPECHECK`
 * is truthy the operator wants pre-VM typecheck regardless of any
 * quality-gate-planning skip — preventing the white-preview bug where a
 * later QG lane was supposed to catch missing-imports/typecheck failures
 * but the build was already shipped to the user.
 *
 * Kept local (rather than imported) so this guard is self-contained and
 * does not pull `node:os`/`node:fs` into modules that don't already use
 * them; the truthy normalization is intentionally identical.
 */
function isPreVmTypecheckForcedByEnv(): boolean {
  const raw = process.env.SAJTMASKIN_PRE_VM_TYPECHECK?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

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
   * Risk summary for the deterministic autofix pass that already ran before
   * this phase. Safe-only runs may skip the read-only verifier; risky fixers
   * keep verifier coverage when the base policy says it should run.
   */
  autoFixRisk?: AutofixRiskSummary;
  /**
   * Canonical or legacy capability ids from orchestration stream metadata.
   * Used only to prevent the safe-only skip from disabling verifier coverage
   * for 3D/canvas flows.
   */
  requestedCapabilities?: string[];
  /**
   * True when a later quality-gate lane (client and/or async) is expected
   * to run for this generation. Heuristik — ensam INTE tillräcklig för
   * warm-tsc-skip (se `qualityGatePlanned` nedan).
   */
  willRunQualityGate: boolean;
  /**
   * Whether the downstream quality gate includes `typecheck`.
   */
  qualityGateChecksIncludesTypecheck: boolean;
  /**
   * Stark signal från callsiten att quality-gate faktiskt är **planerad**
   * (inte bara heuristiskt förväntad). Wave 7 R2 guard — utan explicit
   * `qualityGatePlanned === true` kör vi ALLTID warm-tsc i finalize.
   *
   * Motiv: `willRunQualityGate` sattes tidigare lite optimistiskt som
   * `true` per default i builder-streamen. Om quality-gate senare
   * hoppades över (t.ex. via `design_preview_skip_verify`-policy på
   * F2-init) hade vi varken warm-tsc- ELLER QG-resultat = tyst lucka.
   * Med denna guard krävs två signaler samtidigt för att skippa:
   *   (1) `qualityGatePlanned === true` (callsite vet att QG kommer köra)
   *   (2) `qualityGateChecksIncludesTypecheck === true` (QG täcker tsc)
   */
  qualityGatePlanned?: boolean;
  /**
   * Dossiers vars verbatim-filer ska skyddas vid merge. Trådas vidare
   * till `runPreflightPhase`. Default tom array (verbatim-policy körs men
   * hittar inga skyddade filer).
   */
  selectedDossiers?: DossierEntry[];
  /** Stable id for repair-ledger dedupe within this finalize run. */
  repairScopeId: string;
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
    autoFixRisk = EMPTY_AUTOFIX_RISK,
    requestedCapabilities,
    willRunQualityGate,
    qualityGateChecksIncludesTypecheck,
    qualityGatePlanned,
    selectedDossiers,
    repairScopeId,
  } = params;
  let contentForVersion = params.contentForVersion;
  const stepTelemetry: FinalizeStepTelemetryMap = {};
  const repairLedger = new RepairLedger();
  // Wave 7 R2 guard: warm-tsc skippas BARA när callsiten explicit flaggar
  // att quality-gate är planerad OCH kommer köra typecheck. Utan båda
  // signalerna: kör warm-tsc ändå (säker fallback).
  //
  // SAJ-61 P0/c3: When `SAJTMASKIN_PRE_VM_TYPECHECK` is truthy the env
  // is the operator's explicit "always typecheck before VM" signal. It
  // must override the QG-planned skip so an F2 build with broken types
  // never reaches the preview as a white page. Mirrors the truthy-value
  // normalization in `src/lib/gen/preview/warm-typecheck.ts`.
  //
  // Detta ersätter tidigare heuristik (`willRunQualityGate` ensam), som
  // kunde lämna oss utan varken warm-tsc eller QG-resultat om quality-gate
  // senare hoppades över (t.ex. via `design_preview_skip_verify`-policy på
  // F2-init med 0 preflight-fel).
  //
  // Telemetri: `warmTscSkipped` i `site.done` exponeras via backoffice
  // `llm_flode_telemetry.py` så vi kan mäta skip-rate över tid.
  const envForcesPreVmTypecheck = isPreVmTypecheckForcedByEnv();
  const skipWarmTsc =
    !envForcesPreVmTypecheck &&
    qualityGatePlanned === true &&
    willRunQualityGate &&
    qualityGateChecksIncludesTypecheck;

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
    repairLedger,
    repairScopeId,
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
    eslint: syntaxResult.eslint ?? null,
  });
  stepTelemetry.validate_syntax = createFinalizeStepTelemetry(validateStartedAt, "done", {
    fixerUsed: syntaxResult.fixerUsed,
    fixerImproved: syntaxResult.fixerImproved,
    errorsBefore: syntaxResult.errorsBefore,
    errorsAfter: syntaxResult.errorsAfter,
    earlyStopReason: syntaxResult.earlyStopReason,
    result: syntaxResult.status,
    tsc: syntaxResult.tsc ?? null,
    eslint: syntaxResult.eslint ?? null,
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
  const has3DSignal = buildSpecOrCapabilitiesIndicate3D({
    buildSpec,
    requestedCapabilities,
  });
  const hasSafeOnlyFixes =
    autoFixRisk.safeFixCount > 0 && autoFixRisk.riskyFixCount === 0;
  const hasRiskyFixes = autoFixRisk.riskyFixCount > 0;
  // Efterputs (coach-lucka 1): `autoFixRisk` only covers the PRE-phase
  // autofix. `validateAndFix` runs AFTER that summary and can rewrite content
  // via LLM fixers (esbuild syntax fix, warm-tsc/warm-eslint RepairGate). An
  // LLM rewrite is risky by definition (see fixer-registry `llm-*` entries),
  // so it must block the safe-only verifier skip. Deliberately NOT blocked:
  // `tsc.repaired` from the deterministic import repair alone — those fixes
  // are mechanical, safe-classed and already carry a warm-tsc receipt.
  const hasLlmFixesInValidate =
    syntaxResult.fixerUsed === true || syntaxResult.llmFixCount > 0;
  const verifierSkippedBySafeFixesOnly =
    verifierPolicy.run && hasSafeOnlyFixes && !has3DSignal && !hasLlmFixesInValidate;
  const verifierReason = verifierSkippedBySafeFixesOnly
    ? "safe_fixes_only"
    : verifierPolicy.run && hasRiskyFixes
      ? "risky_fixes"
      : verifierPolicy.run && hasSafeOnlyFixes && hasLlmFixesInValidate
        ? "llm_fixes_in_validate"
        : verifierPolicy.reason;
  if (verifierSkippedBySafeFixesOnly) {
    devLogAppend("in-progress", {
      type: "verifier.skipped",
      chatId,
      reason: "safe_fixes_only",
      repairPassIndex,
      ...autoFixRisk,
    });
  }
  const verifierOutcome = await runVerifierPhase({
    enabled: verifierPolicy.run && !verifierSkippedBySafeFixesOnly,
    reason: verifierReason,
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
    repairLedger,
    repairScopeId,
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
    repairLedger,
    repairScopeId,
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
    // Fas 3 (RepairGate): hand the run's ledger out so post-finalize repair
    // lanes (server-verify / build-error repair) dedupe against LLM repairs
    // already attempted in finalize.
    repairLedger,
    stepTelemetry: {
      ...stepTelemetry,
      parse_merge_preflight: preflightOutcome.stepTelemetry,
    },
  };
}
