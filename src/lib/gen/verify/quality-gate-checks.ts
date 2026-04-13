/**
 * Verify-lane check lists, ordered by strictness.
 *
 * Three distinct lanes use these lists — they are NOT the same gate:
 *
 *  1. **Tier-2 verify lane** (`TIER2_QUALITY_GATE_CHECKS`):
 *     Runs on preview-host right after generation via the client's
 *     `runTier2VerifyLane` in `post-checks.ts`. Blocking for live preview.
 *     Currently: typecheck only.
 *
 *  2. **Background server verify** (`SERVER_VERIFY_QUALITY_GATE_CHECKS`):
 *     Fire-and-forget after finalize via `triggerServerVerification` in
 *     `server-verify.ts`. Promotes or fails the version in DB; does NOT
 *     block the SSE response. Currently: typecheck + lint.
 *
 *  3. **Promotion / interactive** (`PROMOTION_QUALITY_GATE_CHECKS`,
 *     `INTERACTIVE_QUALITY_GATE_CHECKS`): Used for deploy-level or
 *     manual verification. Strictest: typecheck + build (+ lint for
 *     interactive). Not part of the normal preview flow.
 */

export const QUALITY_GATE_CHECK_VALUES = ["typecheck", "build", "lint"] as const;

export type QualityGateCheck = (typeof QUALITY_GATE_CHECK_VALUES)[number];

export const INTERACTIVE_QUALITY_GATE_CHECKS = [
  ...QUALITY_GATE_CHECK_VALUES,
] satisfies readonly QualityGateCheck[];

export const PROMOTION_QUALITY_GATE_CHECKS = [
  "typecheck",
  "build",
] satisfies readonly QualityGateCheck[];

export const TIER2_QUALITY_GATE_CHECKS = [
  "typecheck",
] satisfies readonly QualityGateCheck[];

export const SERVER_VERIFY_QUALITY_GATE_CHECKS = [
  "typecheck",
  "lint",
] satisfies readonly QualityGateCheck[];
