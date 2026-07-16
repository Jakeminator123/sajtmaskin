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
 *     Runs the authoritative VM sequence `typecheck + lint + build`.
 *
 * Older 4-lane shape (`tier2`/`serverVerify`/`promotion`/`interactive`)
 * was collapsed 2026-04: serverVerify and interactive were duplicates of
 * the two canonical lanes with only stylistic differences.
 */
import { getQualityGateTiersFromManifest } from "@/lib/ai-models/load-manifest";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";

export const QUALITY_GATE_CHECK_VALUES = ["typecheck", "lint", "build"] as const;

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
// F2 remains typecheck-only and keeps its render-first Advisory semantics.
// F3 (`integrationsBuild`) is the single authoritative VM ReleaseGate:
// typecheck first, project-local lint second, and the full Next build last.
//
// Override in `config/ai_models/manifest.json` `qualityGateTiers.designPreview`
// if you want `build`/`lint` back on the VM (e.g. while debugging a
// particular Next-runtime failure). The schema in
// `config/ai_models/manifest.schema.json` requires both lane keys.
const DEFAULT_DESIGN_PREVIEW = ["typecheck"] as const;
const DEFAULT_INTEGRATIONS_BUILD = ["typecheck", "lint", "build"] as const;

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
 * (`typecheck + lint + build`), regardless of which check first failed. A
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
 * Same-signal-kontraktet (Fas 3, RepairGate): en repair får bara kallas lyckad
 * när SAMMA signal som failade passerar igen. Den här funktionen är den
 * explicita mappningen ursprungsfel → verifieringskrav för post-repair-gaten:
 *
 * | Ursprungssignal          | Verifieringskrav innan "lyckad"                    |
 * |--------------------------|----------------------------------------------------|
 * | parse-/esbuild-fel       | esbuild-pass i repair-loopen (körs före gaten)     |
 * | tsc-fel (`typecheck`)    | `typecheck` i post-repair-gaten (bas-lanen)        |
 * | build-fel (`build`)      | `build` i post-repair-gaten                        |
 * | lint-fel (`lint`)        | `lint` i post-repair-gaten                         |
 * | verifier-blocking        | verifier-rerun (finalize) + promote-guard — ägs av |
 * |                          | `verifier-phase.ts` / `assertPromoteAllowed`       |
 *
 * Implementationen är en UNION: bas-lanen från `resolvePostRepairGateChecks`
 * (F2 design / F3 integrations / build-origin-eskalering) + varje check som
 * faktiskt failade i den ursprungliga gaten. Strikt additiv — den kan aldrig
 * droppa en check ur bas-lanen, bara lägga till (t.ex. ett lint-ursprung i F2
 * re-verifierar lint i stället för att false-greena på typecheck-only).
 */
export function resolveSameSignalGateChecks(params: {
  /** Check-id:n som failade i den gate-körning som startade repairen. */
  originFailedChecks: readonly string[];
  /** Build-origin-signal (preview-VM build-error, forceBuildCheck, …). */
  buildOriginated: boolean;
  previewPolicy?: BuildSpecPreviewPolicy;
}): readonly QualityGateCheck[] {
  const buildOriginated =
    params.buildOriginated || params.originFailedChecks.includes("build");
  const base = resolvePostRepairGateChecks(buildOriginated, params.previewPolicy);
  const origin = params.originFailedChecks.filter(
    (check): check is QualityGateCheck =>
      QUALITY_GATE_CHECK_SET.has(check as QualityGateCheck),
  );
  return [...new Set<QualityGateCheck>([...base, ...origin])];
}

/**
 * tsc diagnostic codes that mean MODULE/EXPORT RESOLUTION is broken — the class
 * of "type errors" that also breaks `next dev` at runtime (missing named export
 * → ESM eval throw or `undefined` component → "Element type is invalid" → dead
 * preview). These must NEVER be advisory-promoted: "renders despite type
 * errors" only holds for semantic type mismatches (TS2322, TS2339, TS7006, …),
 * not for unresolved symbols/modules. (Codex #345 P1 / Vercel Agent finding.)
 */
const RENDER_RISK_TS_CODES = new Set([
  "TS1361", // 'X' cannot be used as a value because it was imported using 'import type'
  "TS2300", // duplicate identifier
  "TS2304", // cannot find name
  "TS2305", // module has no exported member
  "TS2307", // cannot find module
  "TS2440", // import declaration conflicts with local declaration
  "TS2552", // cannot find name, did you mean
  "TS2613", // module has no default export
  "TS2614", // module has no exported member (did you mean to use 'import X from' instead?)
]);

const TS_CODE_RE = /\bTS(\d{4,5})\b/g;

/**
 * True when a failing typecheck output contains ONLY advisory-safe diagnostics
 * (no module/export-resolution codes, and at least one parseable TS code).
 * Fail-closed: unparseable output (no TS codes found) is NOT advisory-safe —
 * we cannot prove the failure class, so the gate stays hard as before.
 */
export function isAdvisorySafeTypecheckOutput(output: string): boolean {
  const codes = [...output.matchAll(TS_CODE_RE)].map((match) => `TS${match[1]}`);
  if (codes.length === 0) return false;
  return codes.every((code) => !RENDER_RISK_TS_CODES.has(code));
}

/**
 * F2 render-first (#330): should a FAILED quality gate be treated as an
 * ADVISORY (promote, no auto-repair) instead of a hard failure?
 *
 * True only for a design-preview (F2) version whose ONLY failing check is
 * `typecheck` AND whose diagnostics are advisory-safe — `next dev` renders JS
 * despite semantic type errors (TS2322 prop mismatch, TS2339, implicit any, …),
 * so the live preview is usable and the type error is advisory, not a blocker.
 *
 * SINGLE SOURCE OF TRUTH shared by the client-triggered `quality-gate` route AND
 * the background `server-verify`, so the two gate paths never disagree (one
 * advisory-promoting while the other repairs/fails the same result). The
 * false-green protection lives here:
 *  - the gate passed → false (not applicable),
 *  - not a design-preview (F2) version → false (F3 stays hard),
 *  - build-originated re-verify → false (a build failure must stay hard),
 *  - any non-`typecheck` failing check (build/lint) → false,
 *  - any render-risk diagnostic ({@link RENDER_RISK_TS_CODES}: unresolved
 *    module/name/export — breaks `next dev` too) → false,
 *  - unparseable tsc output (no TS codes) → false (fail-closed).
 * Verifier / promote-guard blocks are enforced separately by the callers.
 */
export function isTypecheckOnlyAdvisory(params: {
  isDesignPreview: boolean;
  gatePassed: boolean;
  buildOriginated: boolean;
  results: ReadonlyArray<{ check: string; passed: boolean; output?: string }>;
}): boolean {
  if (params.gatePassed) return false;
  if (!params.isDesignPreview) return false;
  if (params.buildOriginated) return false;
  const failing = params.results.filter((result) => !result.passed);
  if (failing.length === 0) return false;
  if (!failing.every((result) => result.check === "typecheck")) return false;
  return failing.every((result) => isAdvisorySafeTypecheckOutput(result.output ?? ""));
}
