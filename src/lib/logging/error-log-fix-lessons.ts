/**
 * Canonical, tenant-agnostic "fix lesson" texts for the error-log RAG.
 *
 * WHY THIS MODULE EXISTS (cross-tenant safety):
 * `error_log_events` is a GLOBAL, cross-tenant index (see
 * `loadRecentErrorLogDocsFromDb` — no tenant filter), and the retriever renders
 * hits straight into the system-prompt of whichever tenant is generating. The
 * renderer already omits raw `faultText` for cross-tenant hits because it can
 * carry another user's site-specific labels/paths — but `fixText` is a
 * free-form `string | null` on `ErrorLogEvent`, so nothing structurally
 * prevented a producer (now or later) from writing tenant-specific detail into
 * it and leaking that into a foreign prompt.
 *
 * The contract is therefore inverted to DEFAULT-DENY: only fix lessons authored
 * here — constant, platform-owned, free of user data — may cross a tenant
 * boundary. Producers import these constants instead of inlining literals, so
 * the allowlist and the producers cannot silently drift apart. Anything else
 * (a new free-form producer, a legacy row, a hand-written DB row) is dropped
 * from cross-tenant renders rather than trusted.
 *
 * Adding a new lesson: add the constant here AND to `CROSS_TENANT_SAFE_LESSONS`
 * (or the pattern list). Forgetting the second step fails SAFE — the lesson is
 * simply not shown cross-tenant.
 */

/** `deterministic-import-repair` resolved a verifier finding. */
export const FIX_LESSON_DETERMINISTIC_IMPORT_REPAIR =
  "deterministic import repair added the missing known import";

/** The LLM verifier-fixer rewrote the offending file(s) and cleared every blocker. */
export const FIX_LESSON_VERIFIER_FIXER_REWRITE = "verifier-fixer rewrote the offending file(s)";

/**
 * The LLM verifier-fixer reduced but did NOT clear the blocking findings. The
 * counts are machine-generated (never user text), so the cross-tenant allowlist
 * matches this via an anchored, digit-only pattern (see
 * `CROSS_TENANT_SAFE_LESSON_PATTERNS`). Paired with a `still-failing` result so
 * the RAG row never claims a clean fix that did not happen.
 */
export function verifierFixerPartialFixLesson(before: number, after: number): string {
  return `verifier-fixer reduced blocking findings from ${before} to ${after} but did not clear them`;
}

/** The repair loop's deterministic pass resolved the quality-gate failure. */
export const FIX_LESSON_REPAIR_LOOP_DETERMINISTIC =
  "repair-loop deterministic pass (autofix + import-repair) resolved the quality-gate failure";

/** The repair loop's LLM fixer resolved the quality-gate failure after `llmPasses` passes. */
export function repairLoopLlmFixLesson(llmPasses: number): string {
  return `repair-loop LLM fixer resolved the quality-gate failure after ${llmPasses} pass(es)`;
}

const CROSS_TENANT_SAFE_LESSONS: ReadonlySet<string> = new Set([
  FIX_LESSON_DETERMINISTIC_IMPORT_REPAIR,
  FIX_LESSON_VERIFIER_FIXER_REWRITE,
  FIX_LESSON_REPAIR_LOOP_DETERMINISTIC,
]);

/**
 * `repairLoopLlmFixLesson` interpolates a pass COUNT (machine-generated, never
 * user text), so it needs a pattern rather than a set entry. Anchored and
 * digit-only in the variable slot — no user-controlled substring can match.
 */
const CROSS_TENANT_SAFE_LESSON_PATTERNS: readonly RegExp[] = [
  /^repair-loop LLM fixer resolved the quality-gate failure after [0-9]+ pass\(es\)$/u,
  /^verifier-fixer reduced blocking findings from [0-9]+ to [0-9]+ but did not clear them$/u,
];

/**
 * True only for platform-authored lessons that are safe to render into ANOTHER
 * tenant's prompt. Default-deny: unknown/free-form text returns false.
 */
export function isCrossTenantSafeFixText(fixText: string | null | undefined): fixText is string {
  if (typeof fixText !== "string") return false;
  const value = fixText.trim();
  if (value.length === 0) return false;
  if (CROSS_TENANT_SAFE_LESSONS.has(value)) return true;
  return CROSS_TENANT_SAFE_LESSON_PATTERNS.some((pattern) => pattern.test(value));
}
