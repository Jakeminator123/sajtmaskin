/**
 * Public + internal types for `finalize-version/`.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change. Consumers continue to import from
 * `@/lib/gen/stream/finalize-version`.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { CodeFile } from "@/lib/gen/parser";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { PreviewPreflightSummary } from "@/lib/gen/preview/diagnostics";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { ScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import type { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import type * as chatRepo from "@/lib/db/chat-repository-pg";
import type { runFinalizePreflight, FinalizePreflightIssue } from "../finalize-preflight";
import type { OwnEnginePostStreamPhaseId } from "../finalize-pipeline-contract";

export type FinalizeProgressCallback = (
  step: OwnEnginePostStreamPhaseId,
  data: Record<string, unknown>,
) => void;

/**
 * Per-finalize outcome of one pre-VM warm pass (warm-tsc / warm-eslint).
 * Emitted in `site.done` telemetry and rendered in backoffice
 * (`llm_flode_telemetry.py`) so a silently skipped pass (`cache_cold`,
 * `feature_flag_disabled`, …) can never be mistaken for a pass that ran.
 */
export interface WarmPassTelemetry {
  /** True when the pass was requested: feature flag truthy or F3-force. */
  enabled: boolean;
  /** True when the pass actually executed (tsc/eslint spawned). */
  ran: boolean;
  /**
   * Skip reason when `ran` is false: `cache_cold`, `feature_flag_disabled`,
   * `quality_gate_planned`, `esbuild_failed`, `tsc_failed`, `tsc_skipped`,
   * `no_files`, `tsc_unavailable`, `eslint_unavailable`, `exception`, or
   * `not_reached` (validation never got far enough to attempt the pass).
   * Null when `ran` is true.
   */
  skipped: string | null;
  scaffoldId: string | null;
  durationMs: number;
}

export interface WarmEslintPassTelemetry extends WarmPassTelemetry {
  /** Lint errors found (null when the pass did not run). */
  errorCount: number | null;
  /** Lint warnings found (null when the pass did not run). */
  warningCount: number | null;
}

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
  /**
   * F3 only: id of the F2 design version this build is forked from.
   * Stored on the new `engine_versions` row as `parent_version_id`.
   * Set by the `/finalize-design` flow; ignored when `buildSpec.previewPolicy`
   * is not `fidelity3`.
   */
  lifecycleParentVersionId?: string | null;
  /**
   * Concatenated reasoning text from the live stream. Persisted on the
   * assistant message so the builder UI can re-render the "thinking"
   * panel after a refresh. `null` when the model emitted no reasoning
   * deltas (e.g. fast-tier responses).
   */
  accumulatedThinking?: string | null;
  /**
   * True when a downstream quality-gate lane is expected to run later
   * (client post-checks and/or async verify path). Allows finalize fast-path
   * to skip duplicate warm-tsc in safe cases.
   */
  willRunQualityGate?: boolean;
  /**
   * Strong signal from the callsite that a quality-gate lane is **planned**
   * for this generation (not only heuristically expected). When omitted or
   * false, finalize keeps warm-tsc even if `willRunQualityGate` is true —
   * prevents the “skip warm tsc + late QG skip” blind spot.
   *
   * Production builder stream sets this to `true` together with
   * `willRunQualityGate: true`.
   */
  qualityGatePlanned?: boolean;
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
  /** Files whose new content was rejected (< 50% of prior size). Surfaced to user via SSE. */
  rejectedShrinks: Array<{ file: string; previousSize: number; newSize: number }>;
  /**
   * Files reverted by the Element Preservation Guard (structural elements
   * such as `<video>`, `<canvas>`, `<form>`, R3F `<Canvas>`, Rapier
   * `<Physics>`, video/media components, section landmarks). Without
   * surfacing this, follow-ups like "byt hero till intro" silently fail
   * because the guard keeps the previous file. Surfaced to user via SSE
   * so the builder can render an explicit warning.
   */
  rejectedStructural: Array<{
    file: string;
    droppedElements: Array<{ kind: string; label: string }>;
  }>;
  /**
   * Cross-file imports the LLM made to local files that did not exist.
   * Most are auto-stubbed; obvious sibling-name mistakes may instead be
   * rewired and carry `rewireTarget`. Surfaced as `warning`-level rows in
   * the version diagnostics modal.
   * `dossierId` and `capability` are present when the missing import
   * matched a dossier `exposes` entry (dossier integration gap).
   */
  crossFileStubs: Array<{
    sourceFile: string;
    missingImport: string;
    stubFile: string;
    rewireTarget?: string;
    rewireImportSpec?: string;
    dossierId?: string;
    capability?: string;
  }>;
  /** True when warm-tsc was intentionally skipped because a later quality gate will typecheck. */
  warmTscSkipped?: boolean;
  /**
   * Structured observability for the pre-VM warm-tsc pass (P0: stop silent
   * skip). `enabled` = the operator/config requested the pass (env flag or
   * F3-force); `ran`/`skipped` mirror the actual outcome so "flag on but
   * cache cold" is visible instead of reading as "typecheck ran".
   */
  warmTsc?: WarmPassTelemetry;
  /** Same as `warmTsc` but for the pre-VM warm-eslint pass. */
  warmEslint?: WarmEslintPassTelemetry;
  /**
   * Verifier LLM blocking findings carried out of `runFinalizeFastPath`.
   * Used by the post-finalize lane to gate the preview/VM lane on
   * build-breaking import/typecheck issues — a vit preview is worse than
   * "preview blockerad, repair krävs". See SAJ-61. Empty array when the
   * verifier ran clean or was skipped.
   */
  verifierBlockingFindings?: Array<{ id: string; detail: string }>;
  /**
   * Fas 3 (RepairGate): the run's `RepairLedger`, carried out of finalize so
   * post-finalize lanes (server-verify / build-error repair — same process)
   * dedupe against LLM repairs already attempted during finalize. In-memory
   * only; never serialize.
   */
  repairLedger?: RepairLedger;
  /** Fas 3: the finalize run's repair scope id — must accompany `repairLedger`. */
  repairScopeId?: string;
  /**
   * Env keys declared by the dossiers selected for this generation (Våg 2).
   * Threaded into the F2 preview `.env.local` seed so each selected dossier's
   * declared key gets a stub value and the dossier renders its demo/mock mode
   * — see `startPreviewSession` → `resolvePreviewEnvLayers`. Preview/F2 only;
   * never persisted or shipped to F3/deploy. Empty/omitted when no dossiers
   * declared env keys.
   */
  selectedDossierEnvKeys?: string[];
}

export interface FinalizePathPolicy {
  runDeepPath: boolean;
  reason:
    | "default"
    | "fast_path_disabled_by_flag"
    | "repair_pass"
    | "light_followup_fast_policy";
}

export type FinalizeStepStatus = "done" | "skipped" | "error";

export type FinalizeStepTelemetry = {
  status: FinalizeStepStatus;
  durationMs: number;
  reason?: string;
} & Record<string, unknown>;

export type FinalizeStepTelemetryMap = Partial<
  Record<OwnEnginePostStreamPhaseId, FinalizeStepTelemetry>
>;

export type FinalizeSyntaxResult = Awaited<ReturnType<typeof validateAndFix>>;
export type FinalizePreflightResult = Awaited<ReturnType<typeof runFinalizePreflight>>;

export interface FinalizeFastPathResult {
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
  rejectedShrinks: Array<{ file: string; previousSize: number; newSize: number }>;
  rejectedStructural: Array<{
    file: string;
    droppedElements: Array<{ kind: string; label: string }>;
  }>;
  /** See `FinalizeResult.crossFileStubs`. */
  crossFileStubs: Array<{
    sourceFile: string;
    missingImport: string;
    stubFile: string;
    rewireTarget?: string;
    rewireImportSpec?: string;
    dossierId?: string;
    capability?: string;
  }>;
  /** See `FinalizeResult.repairLedger` (Fas 3 cross-lane dedupe handover). */
  repairLedger: RepairLedger;
  stepTelemetry: FinalizeStepTelemetryMap;
}

/**
 * Budget for the LLM repair gate (rewriting offending files) triggered
 * by verifier blocking findings.
 *
 * SAJ-61 c5: bumped from 60_000 ms to 120_000 ms because the verifier-fix
 * step routinely needs to rewrite multiple component files when the
 * blocker is `build-breaking-missing-imports`. The previous budget
 * tripped abort early enough that the repair returned `success: false`
 * even when a slower model would have completed cleanly. Doubling the
 * window costs at most one extra minute on the (rare) genuine timeouts
 * but eliminates the false aborts that were leaving blockers in place.
 */
export const VERIFIER_REPAIR_TIMEOUT_MS = 120_000;

/**
 * Budget for the read-only verifier rerun that confirms the LLM-repair
 * actually fixed the blockers. Distinct from `VERIFIER_REPAIR_TIMEOUT_MS`:
 * the rerun does not rewrite files, it only re-evaluates findings, so it
 * should not inherit the (longer) repair budget when that one bumps.
 *
 * 30s mirrors the original "capped at one re-run + a 30 s timeout" design
 * note in `verifier-phase.ts`. Using a separate constant prevents future
 * adjustments to the repair budget from accidentally doubling the rerun
 * latency.
 */
export const VERIFIER_RERUN_TIMEOUT_MS = 30_000;
