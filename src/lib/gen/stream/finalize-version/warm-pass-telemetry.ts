/**
 * Warm-pass observability (P0: stop silent skip).
 *
 * Builds structured warm-pass blocks for `site.done`. Warm ESLint is retained
 * only as non-authoritative local diagnostics and is no longer called by
 * finalize; its legacy-compatible absent outcome remains `not_reached`.
 * Consumed by backoffice
 * `llm_flode_telemetry.py`; schema:
 * `docs/schemas/strict/site-done-telemetry.schema.json`.
 */

import type { WarmEslintPassTelemetry, WarmPassTelemetry } from "./types";

/** Truthy-normalization shared with `warm-typecheck.ts` / `warm-eslint.ts`. */
export function isEnvFlagTruthy(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export interface WarmTscOutcomeLike {
  ran: boolean;
  skipped?: string;
  durationMs: number;
  diagnosticCount?: number;
}

export interface WarmEslintOutcomeLike {
  ran: boolean;
  skipped?: string;
  durationMs: number;
  errorCount?: number;
  warningCount?: number;
}

/**
 * An absent outcome (esbuild never passed / eslint never attempted) is
 * reported as `skipped: "not_reached"` so it is distinguishable from a
 * clean run.
 */
export function buildWarmPassTelemetry(params: {
  tsc: WarmTscOutcomeLike | undefined;
  eslint?: WarmEslintOutcomeLike;
  scaffoldId: string | null;
  isFidelity3: boolean;
}): { warmTsc: WarmPassTelemetry; warmEslint: WarmEslintPassTelemetry } {
  const { tsc, eslint, scaffoldId, isFidelity3 } = params;
  const warmTsc: WarmPassTelemetry = {
    enabled: isEnvFlagTruthy("SAJTMASKIN_PRE_VM_TYPECHECK") || isFidelity3,
    ran: tsc?.ran === true,
    skipped: tsc ? (tsc.ran ? null : (tsc.skipped ?? "exception")) : "not_reached",
    scaffoldId,
    durationMs: tsc?.durationMs ?? 0,
  };
  const eslintRan = eslint?.ran === true;
  const warmEslint: WarmEslintPassTelemetry = {
    enabled: Boolean(eslint) && isEnvFlagTruthy("SAJTMASKIN_BLOCKING_ESLINT"),
    ran: eslintRan,
    skipped: eslint ? (eslint.ran ? null : (eslint.skipped ?? "exception")) : "not_reached",
    scaffoldId,
    durationMs: eslint?.durationMs ?? 0,
    errorCount: eslintRan ? (eslint?.errorCount ?? 0) : null,
    warningCount: eslintRan ? (eslint?.warningCount ?? 0) : null,
  };
  return { warmTsc, warmEslint };
}
