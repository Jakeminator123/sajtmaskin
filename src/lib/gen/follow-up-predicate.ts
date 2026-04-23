/**
 * Unified follow-up predicate (OMTAG Fas 2·A / E2).
 *
 * Before this module, three separate call-sites answered the question
 * "is this a follow-up run?" with subtly different expressions:
 *
 *   1. `orchestrate.ts`:
 *        generationMode ?? (persistedScaffoldId ? "followUp" : "init")
 *   2. `chat-message-stream-post.ts`:
 *        previousFiles.length > 0 ? "followUp" : undefined
 *   3. `finalize-merge.ts`:
 *        Boolean(previousFiles && previousFiles.length > 0)
 *
 * The edge case that bit us was `persistedScaffoldId !== null && previousFilesCount === 0`
 * (the first successful init run right after a persisted scaffold was pinned,
 * before any files landed in the store). `orchestrate` treated it as a follow-up
 * run and skipped init-only wiring; `finalize-merge` treated it as an init run
 * and skipped follow-up merge — leaving a half-resolved state.
 *
 * The fix is to expose **two typed predicates** so the semantics become
 * explicit at every call-site rather than hidden inside a truthy-check:
 *
 *   - `isOrchestrationFollowUp`: drives orchestrate + stream (route plan,
 *     build spec, dossier selection, capability carry-over). True iff we have
 *     actual previous files to edit — a scaffold alone is not enough.
 *   - `hasMergeablePrevious`: drives finalize-merge (the decision to run the
 *     version merge path). Mirrors `isOrchestrationFollowUp` so a single
 *     answer flows through both lanes.
 *
 * Both predicates currently share the same definition but are kept separate so
 * future divergence (e.g. letting orchestrate enter "preserve scaffold" mode
 * without files) can be encoded without leaking through truthy-checks again.
 *
 * See `gpt_review/filer/E-easy-medium-layer.md` (E2) and the OMTAG Fas 2·A
 * plan (`OMTAG/fas2/A-follow-up-integrity.md`) for the full rationale.
 */

export interface FollowUpPredicateInput {
  /**
   * Scaffold id that has been pinned to the chat from the very first
   * generation. Truthy when the chat already decided which scaffold to use.
   * Not enough on its own to classify as follow-up: the scaffold can exist
   * before any version has been persisted.
   */
  persistedScaffoldId: string | null | undefined;
  /**
   * Number of persisted files resolved for the follow-up base version.
   * `0` means either (a) this is the first code generation, or (b) the
   * base version failed to persist any files and we should fall back to an
   * init-style build.
   */
  previousFilesCount: number;
}

export interface FollowUpPredicateResult {
  /**
   * True iff there are previous files to merge against. Drives the
   * merge-path selection in `finalize-merge.ts`.
   */
  hasMergeablePrevious: boolean;
  /**
   * True iff the orchestration + stream should run in follow-up mode
   * (carry over build spec, skip init-only context wiring, etc.).
   * Mirrors `hasMergeablePrevious` today; decoupled to keep the semantics
   * explicit per callsite.
   */
  isOrchestrationFollowUp: boolean;
}

/**
 * Single source of truth for the follow-up classification. Pure,
 * dependency-free, cheap to call — wire it into every spot that used to
 * answer "is this a follow-up?" inline.
 */
export function deriveFollowUpStateFromInputs(
  input: FollowUpPredicateInput,
): FollowUpPredicateResult {
  const count = normalizeCount(input.previousFilesCount);
  const hasMergeablePrevious = count > 0;
  // Orchestration follow-up requires actual previous files. A persisted
  // scaffold id without any files is the P26 edge case that previously made
  // orchestrate and merge disagree; clamp both to the same rule here.
  const isOrchestrationFollowUp = hasMergeablePrevious;
  return { hasMergeablePrevious, isOrchestrationFollowUp };
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
