import { createHash, createHmac } from "node:crypto";

/**
 * Redacting audit constructor for builder tool allow/deny. Pure: no env, no
 * fs, no fetch, no DB. The event is allowlisted metadata only — never a
 * request body, prompt, file contents, or raw tenant id.
 */

export type ToolAuditDecision = "allow" | "deny";

export const TOOL_AUDIT_TOOLS = [
  "job.get",
  "job.heartbeat",
  "job.cancel",
  "project.snapshot",
  "project.list_files",
  "project.read_file",
  "project.search",
  "project.diff",
  "orchestration.explain",
  "preview.status",
  "preview.logs",
  "preview.screenshot",
] as const;

export type ToolAuditTool = (typeof TOOL_AUDIT_TOOLS)[number];

export type ToolAuditEvent = {
  schemaVersion: 1;
  type: "tool.policy_decided";
  tool: string;
  decision: ToolAuditDecision;
  code: string | null;
  jobId: string;
  tenantHash: string;
  versionId: string;
  filesRevision: string;
  durationMs: number;
  requestHash: string;
};

const TOOL_AUDIT_TOOL_SET: ReadonlySet<string> = new Set(TOOL_AUDIT_TOOLS);
const DENY_CODE_RE = /^[a-z0-9_]+$/;
const MAX_DENY_CODE_LENGTH = 64;
const MAX_DURATION_MS = 3_600_000;
const HEX64_RE = /^[0-9a-f]{64}$/;
const SECRET_LEAK_RE = /bearer|sk-|private[\s_-]*key/i;

const INVALID = { ok: false, code: "invalid_input" } as const;

export function createToolAuditEvent(input: {
  secret: string;
  tool: string;
  decision: ToolAuditDecision;
  code?: string | null;
  jobId: string;
  tenantId: string;
  versionId: string;
  filesRevision: string;
  durationMs: number;
  request: unknown;
}): { ok: true; event: ToolAuditEvent } | { ok: false; code: "invalid_input" } {
  if (!isNonEmptyString(input.secret)) return INVALID;
  if (!isAuditTool(input.tool)) return INVALID;
  if (input.decision !== "allow" && input.decision !== "deny") return INVALID;
  if (!isNonEmptyString(input.jobId)) return INVALID;
  if (!isNonEmptyString(input.tenantId)) return INVALID;
  if (!isNonEmptyString(input.versionId)) return INVALID;
  if (!isNonEmptyString(input.filesRevision)) return INVALID;
  if (!isDurationMs(input.durationMs)) return INVALID;

  const code = normalizeDecisionCode(input.decision, input.code);
  if (code === undefined) return INVALID;

  const canonical = canonicalize(input.request);
  if (canonical === null) return INVALID;
  if (SECRET_LEAK_RE.test(canonical)) return INVALID;

  const requestHash = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (!HEX64_RE.test(requestHash)) return INVALID;

  const tenantHash = createHmac("sha256", input.secret)
    .update(input.tenantId, "utf8")
    .digest("hex");

  return {
    ok: true,
    event: {
      schemaVersion: 1,
      type: "tool.policy_decided",
      tool: input.tool,
      decision: input.decision,
      code,
      jobId: input.jobId,
      tenantHash,
      versionId: input.versionId,
      filesRevision: input.filesRevision,
      durationMs: input.durationMs,
      requestHash,
    },
  };
}

function isAuditTool(tool: string): tool is ToolAuditTool {
  return typeof tool === "string" && TOOL_AUDIT_TOOL_SET.has(tool);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() !== "";
}

function isDurationMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_DURATION_MS
  );
}

function normalizeDecisionCode(
  decision: ToolAuditDecision,
  code: string | null | undefined,
): string | null | undefined {
  if (decision === "allow") {
    if (code === undefined || code === null) return null;
    return undefined;
  }
  if (typeof code !== "string") return undefined;
  if (code.length === 0 || code.length > MAX_DENY_CODE_LENGTH) return undefined;
  if (!DENY_CODE_RE.test(code)) return undefined;
  return code;
}

function canonicalize(value: unknown): string | null {
  try {
    const sorted = sortKeys(value);
    return JSON.stringify(sorted);
  } catch {
    return null;
  }
}

function sortKeys(value: unknown): unknown {
  if (typeof value === "function" || typeof value === "bigint" || typeof value === "symbol") {
    throw new Error("non_json");
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sortKeys(item)));
  }
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error("non_json");
      }
      const child = value[key];
      if (child === undefined) continue;
      sorted[key] = sortKeys(child);
    }
    return sorted;
  }
  if (value !== null && typeof value === "object") {
    throw new Error("non_json");
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
