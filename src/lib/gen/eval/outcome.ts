import type { EvalSummary } from "./runner";

/**
 * The codegen run's verdict, and the exit code it maps to.
 *
 * This lives apart from `runner.ts` on purpose. `runner.ts` pulls the whole
 * generation stack (engine, orchestrate, finalize, db) into any module that
 * imports it, which is why an earlier attempt copied this precedence into
 * `canonical.ts` "so tests do not load runner.ts". That copy gave one decision
 * two homes — exactly the drift this eval exists to catch. A separate module
 * keeps a single owner *and* a cheap import; the `EvalSummary` import above is
 * type-only, so nothing is loaded at runtime.
 */
export type EvalRunOutcome = "pass" | "quality_fail" | "provider_error" | "infra_error";

/**
 * Provider and infra failures outrank the quality verdict. A run that never
 * reached the model says nothing about generation quality, and scoring it as a
 * regression is what made every red weekly run unreadable.
 *
 * Quality is derived from the measurement: any evaluated prompt that did not
 * pass is a `quality_fail`. `gateFailed` is an extra OR while `--gate` still
 * exists; it is not the only path to a quality miss.
 */
export function resolveEvalRunOutcome(params: {
  summary: EvalSummary;
  gateFailed?: boolean;
}): EvalRunOutcome {
  if (params.summary.providerErrors > 0 || params.summary.suiteAborted) return "provider_error";
  if (params.summary.infraErrors > 0) return "infra_error";
  const measuredQualityFail =
    params.summary.evaluated > 0 && params.summary.passed < params.summary.evaluated;
  if (params.gateFailed === true || measuredQualityFail) return "quality_fail";
  return "pass";
}

export function evalExitCode(outcome: EvalRunOutcome): 0 | 1 | 2 {
  if (outcome === "provider_error" || outcome === "infra_error") return 2;
  return outcome === "quality_fail" ? 1 : 0;
}
