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
import { getQualityGateTiersFromManifest } from "@/lib/ai-models/load-manifest";

export const QUALITY_GATE_CHECK_VALUES = ["typecheck", "build", "lint"] as const;

export type QualityGateCheck = (typeof QUALITY_GATE_CHECK_VALUES)[number];

const QUALITY_GATE_CHECK_SET = new Set<QualityGateCheck>(QUALITY_GATE_CHECK_VALUES);

function sanitizeTierChecks(
  checks: readonly string[],
  fallback: readonly QualityGateCheck[],
): readonly QualityGateCheck[] {
  const normalized = [...new Set(checks)]
    .filter((check): check is QualityGateCheck => QUALITY_GATE_CHECK_SET.has(check as QualityGateCheck));
  return normalized.length > 0 ? normalized : fallback;
}

const qualityGateTiers = getQualityGateTiersFromManifest();

const DEFAULT_TIER2 = ["typecheck"] as const;
const DEFAULT_SERVER_VERIFY = ["typecheck", "lint"] as const;
const DEFAULT_PROMOTION = ["typecheck", "build"] as const;
const DEFAULT_INTERACTIVE = ["typecheck", "build", "lint"] as const;

export const TIER2_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.tier2,
  DEFAULT_TIER2,
);

export const SERVER_VERIFY_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.serverVerify,
  DEFAULT_SERVER_VERIFY,
);

export const PROMOTION_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.promotion,
  DEFAULT_PROMOTION,
);

export const INTERACTIVE_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.interactive,
  DEFAULT_INTERACTIVE,
);
