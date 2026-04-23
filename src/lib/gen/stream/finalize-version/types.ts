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
import type { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import type * as chatRepo from "@/lib/db/chat-repository-pg";
import type { runFinalizePreflight, FinalizePreflightIssue } from "../finalize-preflight";
import type { OwnEnginePostStreamPhaseId } from "../finalize-pipeline-contract";

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
   * Optional shrink-retry payload surfaced when the LLM emitted significantly
   * smaller versions of essential files and a one-shot retry was triggered.
   * Local-only addition (frontend/christopher) — kept across the master merge
   * because the builder UI relies on it to display the retry banner.
   */
  shrinkRetry?: {
    files: string[];
    reason: string;
    retryPrompt: string;
    ctaLabel: string;
  } | null;
  /**
   * Verifier blocking findings that should be surfaced to the user as
   * actionable items. Local-only addition (frontend/christopher) used by the
   * Apple-minimal builder to render the "blocked by verifier" callout.
   */
  verifierBlockingFindings?: Array<{ id: string; detail: string }>;
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
  stepTelemetry: FinalizeStepTelemetryMap;
}

export const VERIFIER_REPAIR_TIMEOUT_MS = 60_000;
