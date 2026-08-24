import { createHmac } from "node:crypto";

import { BUILDER_JOB_ALLOWED_TOOLS } from "./builder-job-spec";
import { BUILDER_JOB_STATUSES, type BuilderJobStatus } from "./state-machine";

export const BUILDER_AUDIT_EVENTS = [
  "job.created",
  "job.transitioned",
  "lease.heartbeat",
  "job.cancelled",
  "job.retry_decided",
  "result.acceptance_decided",
  "tool.policy_decided",
  "telemetry.checkpoint",
] as const;
export type BuilderAuditEventType = (typeof BUILDER_AUDIT_EVENTS)[number];

const ALLOWED_METADATA_KEYS = new Set([
  "attempt",
  "bytes",
  "checkpoint",
  "durationMs",
  "from",
  "lane",
  "lineageHash",
  "modelTurns",
  "packageHash",
  "policyDecision",
  "previewLoops",
  "reason",
  "requestHash",
  "resultClass",
  "to",
  "tool",
  "toolCalls",
  "workspaceRevision",
]);
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]+|(?:sk|rk|whsec)-[a-z0-9_-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|password\s*=|authorization\s*:)/i;
const SHA256_VALUE = /^[a-f0-9]{64}$/;
const REVISION_VALUE = /^[a-f0-9]{32,64}$/;
const CHECKPOINT_VALUES = new Set(["package_frozen", "classic_codegen", "finalize"]);
const LANE_VALUES = new Set(["classic", "openclaw_shadow", "openclaw_candidate"]);
const STATUS_VALUES = new Set<string>(BUILDER_JOB_STATUSES);
const TOOL_VALUES = new Set<string>(BUILDER_JOB_ALLOWED_TOOLS);
const POLICY_DECISION_VALUES = new Set(["allow", "deny", "fallback_classic"]);
const REASON_VALUES = new Set([
  "default_classic",
  "lane_unavailable",
  "enabled",
  "invalid_transition",
  "terminal",
  "attempt_budget_exhausted",
  "completed",
  "cancelled",
  "not_running",
  "absolute_limit",
  "stale_version",
  "stale_revision",
]);
const RESULT_CLASS_VALUES = new Set([
  "accepted",
  "replayed",
  "idempotency_conflict",
  "duplicate_result",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
]);

function redactAuditString(key: string, value: string): string {
  if (SECRET_VALUE.test(value)) return "[REDACTED]";
  const valid =
    ((key === "lineageHash" || key === "packageHash" || key === "requestHash") &&
      SHA256_VALUE.test(value)) ||
    (key === "workspaceRevision" && REVISION_VALUE.test(value)) ||
    (key === "checkpoint" && CHECKPOINT_VALUES.has(value)) ||
    (key === "lane" && LANE_VALUES.has(value)) ||
    ((key === "from" || key === "to") && STATUS_VALUES.has(value)) ||
    (key === "tool" && TOOL_VALUES.has(value)) ||
    (key === "policyDecision" && POLICY_DECISION_VALUES.has(value)) ||
    (key === "reason" && REASON_VALUES.has(value)) ||
    (key === "resultClass" && RESULT_CLASS_VALUES.has(value));
  return valid ? value : "[REDACTED]";
}

export type BuilderAuditMetadata = Record<string, string | number | boolean | null | string[]>;

export function redactBuilderAuditMetadata(input: unknown): BuilderAuditMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: BuilderAuditMetadata = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string") {
      output[key] = redactAuditString(key, value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, 20)
        .map((entry) => redactAuditString(key, entry));
    }
  }
  return output;
}

export function hashBuilderAuditTenant(tenantId: string, auditSalt: string): string {
  if (!tenantId || !auditSalt) throw new TypeError("tenantId and auditSalt are required");
  return createHmac("sha256", auditSalt).update(tenantId, "utf8").digest("hex");
}

export interface BuilderAuditEvent {
  schemaVersion: 1;
  eventId: string;
  event: BuilderAuditEventType;
  occurredAt: string;
  jobId: string;
  tenantHash: string;
  chatId: string;
  status: BuilderJobStatus;
  metadata: BuilderAuditMetadata;
}

export function createBuilderAuditEvent(
  event: Omit<BuilderAuditEvent, "schemaVersion" | "metadata"> & { metadata?: unknown },
): BuilderAuditEvent {
  return {
    schemaVersion: 1,
    ...event,
    metadata: redactBuilderAuditMetadata(event.metadata),
  };
}
