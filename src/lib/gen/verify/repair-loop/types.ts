import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { RecurringFailurePattern } from "@/lib/gen/autofix/fixer-prompt";
import type { ReasoningEffort, ReasoningMode } from "@/lib/gen/engine";
import type { RepairFailedOutput } from "./diagnostics-parser";

export type RepairMethod = "deterministic" | "llm";

export type RepairEarlyStopReason =
  | "fixer_noop"
  | "no_improvement"
  | "time_budget_exceeded"
  | "superseded"
  | "blocker_regression"
  | "blocker_unresolved"
  | null;

export type RepairErrorManifestDiagnostic = {
  source: string;
  line: number | null;
  column: number | null;
  message: string;
};

export type RepairErrorManifestEntry = {
  file: string;
  importedByCount: number;
  dependsOn: string[];
  diagnostics: RepairErrorManifestDiagnostic[];
};

export type RepairErrorManifest = RepairErrorManifestEntry[];

export type RepairAttemptResult<TPayload = unknown> = {
  promoted: boolean;
  payload?: TPayload;
};

export type RunRepairLoopResult<TPayload = unknown> = {
  promoted: boolean;
  method: RepairMethod | null;
  payload?: TPayload;
  llmPasses: number;
  earlyStopReason: RepairEarlyStopReason;
  remainingErrors: number;
  improvedSyntax: boolean;
  noContext: boolean;
  errorManifest: RepairErrorManifest;
  /**
   * Blocking preflight findings a repair pass created that did not exist
   * before it. Set only when the pass was rolled back
   * (`earlyStopReason: "blocker_regression"`).
   */
  introducedBlockers?: string[];
  /** Blocking findings still present after two repair rounds. */
  unresolvedBlockers?: string[];
};

export type RunRepairLoopParams<TPayload = unknown> = {
  initialContent: string;
  /**
   * Owning chat id — used only for dev-log telemetry of the deterministic
   * import-repair pre-pass. Optional so non-chat callers (eval) can omit it.
   */
  chatId?: string;
  /**
   * Version preview policy (F2 `"fidelity2"` / F3 `"fidelity3"`). Gates the
   * deterministic import-repair: tier-3 backend SDK imports are only
   * (re)introduced in F3. Omitted → treated as F2-safe (never adds tier-3).
   */
  previewPolicy?: BuildSpecPreviewPolicy;
  failedOutputs: RepairFailedOutput[];
  contextLines: string[];
  maxLlmPasses: number;
  llmTimeoutMs: number;
  llmRetryTimeoutMs?: number;
  fixerModel?: string;
  fixerThinking?: boolean;
  fixerReasoningEffort?: ReasoningEffort;
  fixerReasoningMode?: ReasoningMode;
  fixerMaxTokens?: number;
  // Återkommande felmönster från tidigare runs i samma chat-session.
  // Anroparen läser via `readRecurringPatternsForChat(chatId)` (i
  // `@/lib/logging/generation-log-writer`) och skickar in dem så LLM-fixern
  // får signal att INTE upprepa fixar som redan misslyckats.
  recurringPatterns?: RecurringFailurePattern[];
  onAttemptPromotion: (
    projectContent: string,
    method: RepairMethod,
    /**
     * Per-attempt options. The final LLM gate passes an absolute
     * `verifyDeadlineEpochMs` so the preview-host verify aborts before the
     * route's `maxDuration` (Codex P1 #286). Omitted for the early deterministic
     * promotion and for callers that don't bound the loop (back-compat).
     */
    options?: { verifyDeadlineEpochMs?: number },
  ) => Promise<RepairAttemptResult<TPayload>>;
  onNoContext?: () => Promise<void> | void;
  /**
   * Called at the start of every LLM pass (before the slow fixer call). Lets a
   * caller renew its distributed lease (Plan C / Codex P2) so a multi-pass
   * repair that runs past the lease TTL never loses ownership mid-loop — which
   * would otherwise make the lease-conditioned save silently no-op.
   */
  onBeforePass?: (passIndex: number) => Promise<void> | void;
  hasActionableErrorContext?: boolean;
  enableTargetedRepair?: boolean;
  targetedRepairMaxFiles?: number;
  /**
   * Absolute `Date.now()`-based deadline after which the loop must not START a
   * new LLM fixer pass or the final preview-host verify. Lets a caller bound the
   * loop to its route's static `maxDuration` so a multi-pass repair winds down
   * gracefully (`earlyStopReason = "time_budget_exceeded"`) and releases its
   * lease, instead of being hard-killed by the platform mid-pass / mid-DB-write
   * (#284 follow-up). Undefined = no wall-clock bound (back-compat).
   */
  repairDeadlineEpochMs?: number;
  /**
   * Fas 3 (RepairGate): shared `RepairLedger` so the loop's fixer calls dedupe
   * against LLM repairs already attempted in other lanes of the same run
   * (finalize warm-tsc/syntax/verifier). Omitted → no dedupe (a fresh ledger
   * per call would be a no-op since every pass mutates content).
   */
  repairLedger?: RepairLedger;
  /**
   * Fas 3 (RepairGate): stable scope for ledger keys. Must MATCH the finalize
   * run's `repairScopeId` when the ledger is handed over from finalize, so
   * identical content+diagnostics collide across lanes. Falls back to chatId
   * inside the gate when omitted.
   */
  repairScopeId?: string;
  /**
   * Fas 3 (base-aware tidig abort): checked at the start of every LLM pass and
   * again before the final verify gate. Return `true` when the version being
   * repaired is superseded (a newer version exists, or its `files_json`
   * advanced past the snapshot this repair is based on) — the loop then stops
   * with `earlyStopReason: "superseded"` instead of finishing work whose
   * result would be discarded by the base-bound save anyway.
   */
  shouldAbortSuperseded?: () => Promise<boolean> | boolean;
};
