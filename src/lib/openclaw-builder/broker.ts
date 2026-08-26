import {
  isBuilderToolName,
  verifyBuilderJobToken,
  type BuilderJobTokenClaims,
} from "./job-token";

/**
 * P1 tool broker: the only authorization path between a future builder agent
 * and Sajtmaskin tools. Pure, fail-closed, no I/O.
 */

export const BUILDER_TOOL_PAYLOAD_MAX_BYTES = 256_000;

export type BrokerDenyCode =
  | "invalid_token"
  | "expired_token"
  | "wrong_audience"
  | "tool_not_allowed"
  | "identity_mismatch"
  | "stale_revision"
  | "job_not_running"
  | "budget_exhausted"
  | "payload_too_large"
  | "cancelled"
  | "superseded";

export type BuilderJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stale"
  | "cancelled"
  | "superseded"
  | "expired";

const IDENTITY_KEYS = [
  "tenantId",
  "projectId",
  "chatId",
  "jobId",
  "baseVersionId",
  "baseFilesRevision",
] as const;

export function authorizeBuilderToolCall(input: {
  secret: string;
  token: string;
  tool: string;
  nowMs?: number;
  expected: {
    tenantId: string;
    projectId: string;
    chatId: string;
    jobId: string;
    baseVersionId: string;
    baseFilesRevision: string;
    jobStatus: BuilderJobStatus;
  };
  payloadBytes?: number;
  budgetRemaining?: { toolCalls: number; readBytes: number };
}): { ok: true } | { ok: false; code: BrokerDenyCode } {
  const verified = verifyBuilderJobToken({
    secret: input.secret,
    token: input.token,
    nowMs: input.nowMs,
  });
  if (!verified.ok) {
    if (verified.code === "expired") return { ok: false, code: "expired_token" };
    if (verified.code === "wrong_audience") return { ok: false, code: "wrong_audience" };
    return { ok: false, code: "invalid_token" };
  }

  if (!isBuilderToolName(input.tool) || !verified.claims.allowedTools.includes(input.tool)) {
    return { ok: false, code: "tool_not_allowed" };
  }

  if (!identitiesMatch(input.expected, verified.claims)) {
    return { ok: false, code: "identity_mismatch" };
  }

  const statusDenied = denyForJobStatus(input.expected.jobStatus);
  if (statusDenied) return statusDenied;

  if (!isFiniteNonNegative(input.payloadBytes)) {
    return { ok: false, code: "payload_too_large" };
  }
  if (input.payloadBytes > BUILDER_TOOL_PAYLOAD_MAX_BYTES) {
    return { ok: false, code: "payload_too_large" };
  }

  if (!isBudgetRemaining(input.budgetRemaining) || input.budgetRemaining.toolCalls < 1) {
    return { ok: false, code: "budget_exhausted" };
  }

  return { ok: true };
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBudgetRemaining(
  value: unknown,
): value is { toolCalls: number; readBytes: number } {
  if (value == null || typeof value !== "object") return false;
  const budget = value as { toolCalls?: unknown; readBytes?: unknown };
  return isFiniteNonNegative(budget.toolCalls) && isFiniteNonNegative(budget.readBytes);
}

function identitiesMatch(
  expected: {
    tenantId: string;
    projectId: string;
    chatId: string;
    jobId: string;
    baseVersionId: string;
    baseFilesRevision: string;
  },
  claims: BuilderJobTokenClaims,
): boolean {
  return IDENTITY_KEYS.every((key) => expected[key] === claims[key]);
}

function denyForJobStatus(
  jobStatus: BuilderJobStatus,
): { ok: false; code: BrokerDenyCode } | null {
  switch (jobStatus) {
    case "running":
      return null;
    case "cancelled":
      return { ok: false, code: "cancelled" };
    case "superseded":
      return { ok: false, code: "superseded" };
    case "stale":
      return { ok: false, code: "stale_revision" };
    default:
      return { ok: false, code: "job_not_running" };
  }
}
