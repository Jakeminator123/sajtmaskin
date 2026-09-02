/**
 * Compatibility facade for F3 readiness / build-spec helpers.
 *
 * Canonical owner: `src/lib/gen/verify/tier3-readiness.ts`.
 * This file keeps a local `checkTier3ReadinessForVersion` binding so existing
 * `vi.mock("@/lib/integrations/tier3-readiness-gate")` suites still intercept
 * the stream / finalize-design callsites.
 */

import {
  checkTier3ReadinessForVersion as checkTier3ReadinessOwned,
  type CheckTier3ReadinessForVersionParams,
  type Tier3ReadinessResult,
} from "@/lib/gen/verify/tier3-readiness";

export {
  buildContractsFromDetectedIntegrations,
  deriveTier3BuildSpecForVersion,
  readProductPostcheckVerdictForVersion,
  isProductPostcheckBlocked,
  serverOwnedF3ReadinessParams,
  type Tier3GateResult,
  type Tier3ReadinessResult,
  type Tier3ProductPostcheckHold,
  type ProductPostcheckVerdictRead,
  type CheckTier3ReadinessForVersionParams,
} from "@/lib/gen/verify/tier3-readiness";

export async function checkTier3ReadinessForVersion(
  params: CheckTier3ReadinessForVersionParams,
): Promise<Tier3ReadinessResult> {
  return checkTier3ReadinessOwned(params);
}
