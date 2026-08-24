/**
 * Read-only `preview.status` and `preview.logs` against caller-supplied,
 * already-scrubbed session data. No I/O: no env, no fs, no fetch, no
 * child_process. This slice never talks to Fly, Redis, or the preview host.
 */

export const DEFAULT_LOG_LIMIT = 20;
export const MAX_LOG_LIMIT = 40;
export const PREVIEW_READINESS = "not_available_without_side_effects" as const;

export type PreviewReadIdentity = {
  tenantId: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
};

export type PassivePreviewSession = {
  status: "missing" | "running" | "stopped" | "unknown";
  versionId: string | null;
  filesRevision: string | null;
  expiresAtMs: number | null;
};

export type PreviewLogLine = { ts: string; message: string };

export type PreviewStatusResult =
  | {
      ok: true;
      tool: "preview.status";
      status: PassivePreviewSession["status"] | "version_mismatch" | "revision_mismatch";
      readiness: typeof PREVIEW_READINESS;
      versionMatches: boolean | null;
      revisionMatches: boolean | null;
    }
  | { ok: false; code: "identity_mismatch" | "invalid_input" };

export type PreviewLogsResult =
  | {
      ok: true;
      tool: "preview.logs";
      available: boolean;
      reason: "ok" | "no_session" | "version_mismatch" | "revision_mismatch";
      lines: PreviewLogLine[];
      truncated: boolean;
    }
  | { ok: false; code: "identity_mismatch" | "invalid_input" };

const IDENTITY_KEYS = [
  "tenantId",
  "chatId",
  "versionId",
  "filesRevision",
] as const;

const SESSION_STATUSES = ["missing", "running", "stopped", "unknown"] as const;

const REDACTED = "[redacted]";

type GateOk = {
  ok: true;
  job: PreviewReadIdentity;
  session: PassivePreviewSession;
};

type GateFail = { ok: false; code: "identity_mismatch" | "invalid_input" };

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSessionStatus(
  value: unknown,
): value is PassivePreviewSession["status"] {
  return (
    typeof value === "string" &&
    (SESSION_STATUSES as readonly string[]).includes(value)
  );
}

function parseIdentity(value: unknown): PreviewReadIdentity | "invalid" {
  if (value == null || typeof value !== "object") return "invalid";
  const raw = value as Record<string, unknown>;
  const identity = {} as PreviewReadIdentity;
  for (const key of IDENTITY_KEYS) {
    if (!isNonEmptyId(raw[key])) return "invalid";
    identity[key] = raw[key];
  }
  return identity;
}

function parseSession(value: unknown): PassivePreviewSession | "invalid" {
  if (value == null || typeof value !== "object") return "invalid";
  const raw = value as Record<string, unknown>;
  if (!isSessionStatus(raw.status)) return "invalid";
  if (!(typeof raw.versionId === "string" || raw.versionId === null)) {
    return "invalid";
  }
  if (!(typeof raw.filesRevision === "string" || raw.filesRevision === null)) {
    return "invalid";
  }
  if (
    raw.expiresAtMs !== undefined &&
    !(typeof raw.expiresAtMs === "number" || raw.expiresAtMs === null)
  ) {
    return "invalid";
  }
  if (typeof raw.expiresAtMs === "number" && !Number.isFinite(raw.expiresAtMs)) {
    return "invalid";
  }
  return {
    status: raw.status,
    versionId: raw.versionId,
    filesRevision: raw.filesRevision,
    expiresAtMs: typeof raw.expiresAtMs === "number" ? raw.expiresAtMs : null,
  };
}

function identitiesMatch(
  job: PreviewReadIdentity,
  requester: PreviewReadIdentity,
): boolean {
  return IDENTITY_KEYS.every((key) => job[key] === requester[key]);
}

function gatePreviewRead(input: {
  job?: unknown;
  requester?: unknown;
  session?: unknown;
}): GateOk | GateFail {
  const job = parseIdentity(input?.job);
  const requester = parseIdentity(input?.requester);
  if (job === "invalid" || requester === "invalid") {
    return { ok: false, code: "invalid_input" };
  }
  if (!identitiesMatch(job, requester)) {
    return { ok: false, code: "identity_mismatch" };
  }
  const session = parseSession(input?.session);
  if (session === "invalid") {
    return { ok: false, code: "invalid_input" };
  }
  return { ok: true, job, session };
}

function optionalMatch(
  sessionValue: string | null,
  jobValue: string,
): boolean | null {
  if (sessionValue === null) return null;
  return sessionValue === jobValue;
}

function alignment(
  job: PreviewReadIdentity,
  session: PassivePreviewSession,
): {
  versionMatches: boolean | null;
  revisionMatches: boolean | null;
  status: PassivePreviewSession["status"] | "version_mismatch" | "revision_mismatch";
} {
  const versionMatches = optionalMatch(session.versionId, job.versionId);
  const revisionMatches = optionalMatch(session.filesRevision, job.filesRevision);
  let status: PassivePreviewSession["status"] | "version_mismatch" | "revision_mismatch" =
    session.status;
  if (versionMatches === false) status = "version_mismatch";
  else if (revisionMatches === false) status = "revision_mismatch";
  return { versionMatches, revisionMatches, status };
}

/**
 * Redact bearer tokens, sk-/rk-/whsec- secrets, PEM private keys, and https URLs.
 * Never emit a preview URL, host credential, or raw token.
 */
function scrubMessage(message: string): string {
  let out = message;
  out = out.replace(
    /-----BEGIN[\s\S]*?(?:-----END[^\n]*-----|$)/g,
    REDACTED,
  );
  out = out.replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`);
  out = out.replace(/\b(?:sk|rk|whsec)[-_][A-Za-z0-9+/=_\-]+/g, REDACTED);
  out = out.replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9]+/g, REDACTED);
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]+/gi, REDACTED);
  out = out.replace(/https?:\/\/[^\s]+/gi, REDACTED);
  return out.trim();
}

function isSafeLogTimestamp(ts: string): boolean {
  if (ts.length === 0 || ts.length > 64) return false;
  if (ts.includes("://") || /https?/i.test(ts)) return false;
  if (/\b(?:sk|rk|whsec)[-_]/i.test(ts) || /bearer|ghp_|gho_|github_pat_|xox[baprs]-/i.test(ts)) {
    return false;
  }
  return /^[A-Za-z0-9._:+-]+$/.test(ts);
}

function parseLogLines(value: unknown): PreviewLogLine[] | "invalid" {
  if (!Array.isArray(value)) return "invalid";
  const lines: PreviewLogLine[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.ts !== "string" || typeof raw.message !== "string") continue;
    if (!isSafeLogTimestamp(raw.ts)) continue;
    const message = scrubMessage(raw.message);
    if (message.length === 0) continue;
    lines.push({ ts: raw.ts, message });
  }
  return lines;
}

function resolveLimit(limit: unknown): number | "invalid" {
  if (limit === undefined) return DEFAULT_LOG_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit)) return "invalid";
  if (limit < 1) return "invalid";
  return Math.min(limit, MAX_LOG_LIMIT);
}

export function getPreviewStatus(input: {
  job: PreviewReadIdentity;
  requester: PreviewReadIdentity;
  session: PassivePreviewSession;
}): PreviewStatusResult {
  const gated = gatePreviewRead(input);
  if (!gated.ok) return gated;
  const { versionMatches, revisionMatches, status } = alignment(
    gated.job,
    gated.session,
  );
  return {
    ok: true,
    tool: "preview.status",
    status,
    readiness: PREVIEW_READINESS,
    versionMatches,
    revisionMatches,
  };
}

export function getPreviewLogs(input: {
  job: PreviewReadIdentity;
  requester: PreviewReadIdentity;
  session: PassivePreviewSession;
  lines: PreviewLogLine[];
  limit?: number;
}): PreviewLogsResult {
  const gated = gatePreviewRead(input);
  if (!gated.ok) return gated;

  const limit = resolveLimit(input?.limit);
  if (limit === "invalid") return { ok: false, code: "invalid_input" };

  const parsed = parseLogLines(input?.lines);
  if (parsed === "invalid") return { ok: false, code: "invalid_input" };

  const { versionMatches, revisionMatches } = alignment(gated.job, gated.session);

  if (gated.session.status === "missing") {
    return {
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: "no_session",
      lines: [],
      truncated: false,
    };
  }
  if (versionMatches !== true) {
    return {
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: versionMatches === false ? "version_mismatch" : "no_session",
      lines: [],
      truncated: false,
    };
  }
  if (revisionMatches !== true) {
    return {
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: revisionMatches === false ? "revision_mismatch" : "no_session",
      lines: [],
      truncated: false,
    };
  }

  const truncated = parsed.length > limit;
  const lines = truncated ? parsed.slice(-limit) : parsed;
  return {
    ok: true,
    tool: "preview.logs",
    available: true,
    reason: "ok",
    lines,
    truncated,
  };
}
