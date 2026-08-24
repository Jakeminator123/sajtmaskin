/**
 * Diagnostic receipt for caller-supplied candidate checks. Records what the
 * caller already ran — it never shells out, never typechecks, and is never
 * a ReleaseGate.
 */

export type CheckKind = "syntax" | "typecheck" | "policy";

export type CheckResult = {
  kind: CheckKind;
  passed: boolean;
  errorCount: number;
  truncated: boolean;
};

export type CheckReceipt = {
  tool: "candidate.run_checks";
  officialGate: false;
  overlayHash: string;
  checks: CheckResult[];
};

export const HEX64_RE = /^[0-9a-f]{64}$/;
export const MAX_CHECK_RESULTS = 3;
export const MAX_ERROR_COUNT = 10_000;

const CHECK_KINDS = new Set<CheckKind>(["syntax", "typecheck", "policy"]);
const INVALID = { ok: false, code: "invalid_input" } as const;

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function isCheckKind(value: unknown): value is CheckKind {
  return typeof value === "string" && CHECK_KINDS.has(value as CheckKind);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeCheck(value: unknown): CheckResult | null {
  if (!isPlainObject(value)) return null;
  if (!isCheckKind(value.kind)) return null;
  if (typeof value.passed !== "boolean") return null;
  if (typeof value.truncated !== "boolean") return null;
  if (!Number.isInteger(value.errorCount)) return null;
  if (value.errorCount < 0 || value.errorCount > MAX_ERROR_COUNT) return null;

  return {
    kind: value.kind,
    passed: value.passed,
    errorCount: value.errorCount,
    truncated: value.truncated,
  };
}

export function createCheckReceipt(input: {
  overlayHash: string;
  checks: CheckResult[];
}): { ok: true; receipt: CheckReceipt } | { ok: false; code: "invalid_input" } {
  if (input == null || typeof input !== "object") return INVALID;
  if (!isHex64(input.overlayHash)) return INVALID;
  if (!Array.isArray(input.checks)) return INVALID;
  if (input.checks.length < 1 || input.checks.length > MAX_CHECK_RESULTS) {
    return INVALID;
  }

  const checks: CheckResult[] = [];
  const seen = new Set<CheckKind>();
  for (const item of input.checks) {
    const check = normalizeCheck(item);
    if (check == null) return INVALID;
    if (seen.has(check.kind)) return INVALID;
    seen.add(check.kind);
    checks.push(check);
  }

  return {
    ok: true,
    receipt: {
      tool: "candidate.run_checks",
      officialGate: false,
      overlayHash: input.overlayHash,
      checks,
    },
  };
}
