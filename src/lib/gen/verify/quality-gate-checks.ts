/**
 * Verify-lane check lists, ordered by strictness.
 *
 * Two canonical lanes (manifest `qualityGateTiers`):
 *
 *  1. **Design preview lane** (`DESIGN_PREVIEW_QUALITY_GATE_CHECKS`):
 *     Runs on preview-host right after F2 generation via the client's
 *     `runTier2VerifyLane` in `post-checks.ts`. Also used by background
 *     `triggerServerVerification` after finalize. Since 2026-04-23:
 *     `typecheck` only in F2 (`designPreview`). `build` is reserved for
 *     F3 (`integrationsBuild`) where integrations must pass full build/lint.
 *
 *  2. **Integrations build lane** (`INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS`):
 *     Used for F3 ("bygg integrationer") and deploy-promotion paths.
 *     `typecheck + build` (always — F3 always pays for the build).
 *
 * Older 4-lane shape (`tier2`/`serverVerify`/`promotion`/`interactive`)
 * was collapsed 2026-04: serverVerify and interactive were duplicates of
 * the two canonical lanes with only stylistic differences.
 */
import { getQualityGateTiersFromManifest } from "@/lib/ai-models/load-manifest";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";

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

// Defaults match the manifest baseline.
//
// 2026-04-23 change — F2 `designPreview` reduced to `typecheck` only.
// Rationale: `build` and `lint` in F2 cost ~5–20 s of Fly-CPU per finalize
// and are almost fully redundant with the pre-VM passes that now run in
// the Sajtmaskin backend process (`src/lib/gen/preview/warm-typecheck.ts`
// and `src/lib/gen/preview/warm-eslint.ts`) BEFORE files are shipped to
// preview-host. Those warm passes feed the LLM-fixer loop with the same
// tsc/eslint diagnostics and can repair them inline. The on-VM typecheck
// remains as a cheap safety net in case warm-cache is cold (fail-open).
// F3 (`integrationsBuild`) keeps the full `typecheck + build + lint` set
// because integrations builds must actually produce a valid Next build.
//
// Override in `config/ai_models/manifest.json` `qualityGateTiers.designPreview`
// if you want `build`/`lint` back on the VM (e.g. while debugging a
// particular Next-runtime failure). The schema in
// `config/ai_models/manifest.schema.json` requires both lane keys.
const DEFAULT_DESIGN_PREVIEW = ["typecheck"] as const;
const DEFAULT_INTEGRATIONS_BUILD = ["typecheck", "build", "lint"] as const;

export const DESIGN_PREVIEW_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.designPreview,
  DEFAULT_DESIGN_PREVIEW,
);

export const INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS = sanitizeTierChecks(
  qualityGateTiers.integrationsBuild,
  DEFAULT_INTEGRATIONS_BUILD,
);

/**
 * Post-repair gate checks (#260 / Codex P2 — build-origin false-green).
 *
 * A repair entered from a build/preview-start failure (`firstFailureCheck ===
 * "build"`) must NOT re-gate with the typecheck-only design-preview lane: `tsc`
 * can pass while `next build` is still broken, which would false-green a
 * non-building version into `repair_available`/`passed`. For build-origin
 * repairs we keep `build` in the post-repair gate; every other repair keeps the
 * cheap design-preview lane unchanged.
 *
 * F3 / integrations (#291 Codex P1 — keep F3 repairs on the integrations gate):
 * an `"fidelity3"` version must ALWAYS re-gate on the full integrations lane
 * (`typecheck + build + lint`), regardless of which check first failed. A
 * deterministic/LLM repair that preserves or re-adds tier-3 backend SDK imports
 * (stripe / Clerk-server / supabase) could otherwise be promoted to
 * `repair_available` after `tsc` only, skipping the build/lint validation the
 * F3 contract requires — a real false-green for integrations. This only ever
 * ADDS checks for F3; it never drops one.
 */
export function resolvePostRepairGateChecks(
  buildOriginated: boolean,
  previewPolicy?: BuildSpecPreviewPolicy,
): readonly QualityGateCheck[] {
  if (previewPolicy === "fidelity3") return INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS;
  if (!buildOriginated) return DESIGN_PREVIEW_QUALITY_GATE_CHECKS;
  return [...new Set<QualityGateCheck>([...DESIGN_PREVIEW_QUALITY_GATE_CHECKS, "build"])];
}

/**
 * F2 render-first (#330): should a FAILED quality gate be treated as an
 * ADVISORY (promote, no auto-repair) instead of a hard failure?
 *
 * True only for a design-preview (F2) version whose ONLY failing check is
 * `typecheck` — `next dev` renders JS despite TS type errors, so the live
 * preview is usable and a type error is advisory, not a blocker.
 *
 * SINGLE SOURCE OF TRUTH shared by the client-triggered `quality-gate` route AND
 * the background `server-verify`, so the two gate paths never disagree (one
 * advisory-promoting while the other repairs/fails the same result). The
 * false-green protection lives here:
 *  - the gate passed → false (not applicable),
 *  - not a design-preview (F2) version → false (F3 stays hard),
 *  - build-originated re-verify → false (a build failure must stay hard),
 *  - any non-`typecheck` failing check (build/lint) → false.
 * Verifier / promote-guard blocks are enforced separately by the callers.
 */
export function isTypecheckOnlyAdvisory(params: {
  isDesignPreview: boolean;
  gatePassed: boolean;
  buildOriginated: boolean;
  results: ReadonlyArray<{ check: string; passed: boolean }>;
}): boolean {
  if (params.gatePassed) return false;
  if (!params.isDesignPreview) return false;
  if (params.buildOriginated) return false;
  const failing = params.results.filter((result) => !result.passed);
  return failing.length > 0 && failing.every((result) => result.check === "typecheck");
}
