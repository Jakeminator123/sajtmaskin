/**
 * Eval checks for the integrations and orchestration categories.
 */

import type { CheckResult } from "./checks";
import { detectIntegrations } from "../detect-integrations";

export function checkIntegrationDetection(
  code: string,
  expectedProviders: string[],
): CheckResult {
  if (expectedProviders.length === 0) {
    return {
      name: "integration-detection",
      passed: true,
      message: "No integrations expected",
      score: 1,
    };
  }

  const detected = detectIntegrations(code);
  const detectedKeys = new Set(detected.map((d) => d.key));
  const found = expectedProviders.filter((p) => detectedKeys.has(p));
  const missing = expectedProviders.filter((p) => !detectedKeys.has(p));

  const score = found.length / expectedProviders.length;
  return {
    name: "integration-detection",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? `All ${expectedProviders.length} integrations detected`
        : `Missing: ${missing.join(", ")}`,
    score,
  };
}

export function checkEnvVarCoverage(
  code: string,
  expectedVars: string[],
): CheckResult {
  if (expectedVars.length === 0) {
    return {
      name: "env-var-coverage",
      passed: true,
      message: "No env vars expected",
      score: 1,
    };
  }

  const detected = detectIntegrations(code);
  const allDetectedVars = new Set(detected.flatMap((d) => d.envVars));
  const found = expectedVars.filter((v) => allDetectedVars.has(v));
  const missing = expectedVars.filter((v) => !allDetectedVars.has(v));

  const score = found.length / expectedVars.length;
  return {
    name: "env-var-coverage",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? `All ${expectedVars.length} env vars covered`
        : `Missing: ${missing.join(", ")}`,
    score,
  };
}

export function checkProviderGuide(
  code: string,
): CheckResult {
  const detected = detectIntegrations(code);
  const withGuide = detected.filter((d) => d.setupGuide);
  const total = detected.length;

  if (total === 0) {
    return {
      name: "provider-guide",
      passed: true,
      message: "No integrations detected",
      score: 1,
    };
  }

  const score = withGuide.length / total;
  return {
    name: "provider-guide",
    passed: score >= 0.8,
    message: `${withGuide.length}/${total} integrations have setup guides`,
    score,
  };
}

export function checkPlanStructure(
  plan: Record<string, unknown> | null,
): CheckResult {
  if (!plan) {
    return {
      name: "plan-structure",
      passed: false,
      message: "No plan artifact produced",
      score: 0,
    };
  }

  let score = 0;
  const issues: string[] = [];

  if (typeof plan.goal === "string" && plan.goal.length > 5) score += 0.2;
  else issues.push("missing/short goal");

  if (Array.isArray(plan.scope) && plan.scope.length > 0) score += 0.2;
  else issues.push("missing scope");

  if (Array.isArray(plan.steps) && plan.steps.length >= 2) score += 0.3;
  else issues.push("missing/few steps");

  if (Array.isArray(plan.assumptions)) score += 0.15;
  else issues.push("missing assumptions");

  if (Array.isArray(plan.blockers)) score += 0.15;
  else issues.push("missing blockers");

  return {
    name: "plan-structure",
    passed: score >= 0.7,
    message: issues.length === 0 ? "Plan structure complete" : `Issues: ${issues.join(", ")}`,
    score,
  };
}

export function checkAutoFixImprovement(
  errorsBefore: number,
  errorsAfter: number,
): CheckResult {
  if (errorsBefore === 0) {
    return {
      name: "autofix-improvement",
      passed: true,
      message: "No errors to fix",
      score: 1,
    };
  }

  const reduction = (errorsBefore - errorsAfter) / errorsBefore;
  return {
    name: "autofix-improvement",
    passed: errorsAfter === 0 || reduction >= 0.5,
    message: `Errors: ${errorsBefore} -> ${errorsAfter} (${(reduction * 100).toFixed(0)}% reduction)`,
    score: errorsAfter === 0 ? 1 : Math.max(0, reduction),
  };
}

export function checkMultiPass(passes: number, errorsAfter: number): CheckResult {
  const usedMultiPass = passes > 1;
  const resolved = errorsAfter === 0;

  return {
    name: "multi-pass",
    passed: resolved || !usedMultiPass,
    message: `${passes} pass(es), ${errorsAfter} remaining errors`,
    score: resolved ? 1 : usedMultiPass ? 0.5 : 0.3,
  };
}
