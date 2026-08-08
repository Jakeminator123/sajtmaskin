/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+preview verify handoff in the generation stream as a
 * fire-and-forget background task. Updates version verification state
 * on the DB; the UI reads server state via version polls.
 *
 * Note: this module uses preview-host's isolated verify lane. It does not
 * control the primary tier-2 preview provider for end users.
 *
 * Deduplicated: the same versionId will not run twice concurrently.
 */
export { isServerVerifyEligible } from "./server-verify/lease";
export {
  logQualityGateFailuresBestEffort,
  partitionServerVerifyFailures,
} from "./server-verify/failures";
export { triggerServerVerification } from "./server-verify/verify-run";
export {
  triggerBuildErrorRepair,
  type BuildErrorRepairOutcome,
} from "./server-verify/build-error-trigger";
