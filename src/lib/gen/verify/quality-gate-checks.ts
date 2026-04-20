/**
 * Verify-lane check lists, ordered by strictness.
 *
 * Two canonical lanes (manifest `qualityGateTiers`):
 *
 *  1. **Design preview lane** (`DESIGN_PREVIEW_QUALITY_GATE_CHECKS`):
 *     Runs on preview-host right after F2 generation via the client's
 *     `runTier2VerifyLane` in `post-checks.ts`. Also used by background
 *     `triggerServerVerification` after finalize. Currently: typecheck only.
 *
 *  2. **Integrations build lane** (`INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS`):
 *     Used for F3 ("bygg integrationer") and deploy-promotion paths.
 *     Currently: typecheck + build.
 *
 * Older 4-lane shape (`tier2`/`serverVerify`/`promotion`/`interactive`)
 * was collapsed 2026-04: serverVerify and interactive were duplicates of
 * the two canonical lanes with only stylistic differences.
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

const DEFAULT_DESIGN_PREVIEW = ["typecheck"] as const;
const DEFAULT_INTEGRATIONS_BUILD = ["typecheck", "build"] as const;

export const DESIGN_PREVIEW_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.designPreview,
  DEFAULT_DESIGN_PREVIEW,
);

export const INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.integrationsBuild,
  DEFAULT_INTEGRATIONS_BUILD,
);
