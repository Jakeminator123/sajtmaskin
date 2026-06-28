/**
 * Decide whether the server-repair loop should keep running or stop early.
 *
 * The loop's primary signal is `validateGeneratedCode` (esbuild syntax)
 * before/after each LLM-fixer pass. That signal is INSUFFICIENT when the
 * loop was entered because of a quality-gate failure (typecheck/build),
 * not a syntax failure: in that case `errorsBefore === 0` and `errorsAfter
 * === 0` even when the LLM made meaningful edits, and naive comparison
 * yields a spurious "no_improvement" verdict — promotion is then
 * incorrectly blocked.
 *
 * Empirical hit (chat `cdc23879...`, version `e6590fc4...`):
 *   - autofix produced 0 syntax errors
 *   - quality-gate failed on `tsc --noEmit` (TS2322 in R3F component)
 *   - LLM-fixer ran, edited the file, but errorsBefore/errorsAfter both 0
 *   - policy returned `no_improvement` and refused promotion despite real edits
 *
 * Two new inputs avoid the regression:
 *   - `contentChanged`: did the LLM-fixer actually mutate the codebase?
 *     If false, no further passes can help; bail with `no_improvement`.
 *   - `gateFailureSignals`: how many quality-gate context lines the loop
 *     was given. If syntax was already clean (`errorsBefore === 0`) and
 *     gate-failure context exists, defer to the gate (re-run by the caller
 *     after the loop) and let the loop continue while it still has passes
 *     and the LLM keeps mutating files.
 *
 * Defaults preserve historical behavior so callers that have not been
 * updated (e.g. eval scripts) keep their semantics.
 */
export function resolveServerRepairEarlyStopReason(params: {
  fixerProducedOutput: boolean;
  errorsBefore: number;
  errorsAfter: number;
  timedOut?: boolean;
  /**
   * `true` when the post-fixer content differs from the input handed to the
   * fixer (or differs from the previous loop iteration). When `false`, the
   * model produced byte-identical output and another pass is wasted budget.
   * Defaults to `true` for backwards compatibility.
   */
  contentChanged?: boolean;
  /**
   * Number of quality-gate failure context lines (typecheck stderr, build
   * stderr, etc.) provided to the fixer. Used to detect "gate-only" failure
   * mode where esbuild syntax is already clean but the gate still blocks
   * promotion. Defaults to `0` for backwards compatibility.
   */
  gateFailureSignals?: number;
}): "continue" | "fixer_noop" | "no_improvement" | "time_budget_exceeded" {
  const {
    fixerProducedOutput,
    errorsBefore,
    errorsAfter,
    timedOut,
    contentChanged,
    gateFailureSignals = 0,
  } = params;
  if (timedOut) return "time_budget_exceeded";
  if (!fixerProducedOutput) return "fixer_noop";
  // The fixer ran but did not change anything. No further pass will help.
  if (contentChanged === false) return "no_improvement";
  // Gate-only failure mode: syntax was already clean before AND after, but
  // the LLM mutated files in response to gate failures. Don't bail on
  // esbuild count alone — let the loop run another pass (bounded by
  // `maxLlmPasses`); the caller will re-run the gate on the best content
  // afterwards via `tryPromoteAfterGate`.
  if (errorsBefore === 0 && errorsAfter === 0 && gateFailureSignals > 0) {
    return "continue";
  }
  if (errorsAfter >= errorsBefore) return "no_improvement";
  return "continue";
}

/**
 * What a server-repair loop should do after it could NOT promote a repair.
 *
 * `skip_stale_base` means `saveRepairedFiles` no-op'd because a concurrent user
 * edit advanced `files_json` past the snapshot the repair was based on (#260
 * Codex P2). In that case the caller MUST NOT finalize the version as failed:
 * the repair stopped at overwriting the user's newer edit B, but failing the
 * version would still mark B `failed` based on repair(A). The newer edit is
 * owned by the edit→verify flow, not by this stale repair outcome.
 */
export type PostRepairFinalizeAction =
  | "skip_stale_base"
  | "fail_syntax_clean"
  | "fail_incomplete";

export function resolvePostRepairFinalize(input: {
  /** `saveRepairedFiles` returned `stale_base` for this run. */
  staleBaseNoOp: boolean;
  /** Remaining esbuild syntax errors after the loop (0 = syntax clean). */
  remainingErrors: number;
}): PostRepairFinalizeAction {
  if (input.staleBaseNoOp) return "skip_stale_base";
  if (input.remainingErrors === 0) return "fail_syntax_clean";
  return "fail_incomplete";
}
