import { getLatestEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import type { Version } from "@/lib/db/chat-repository-pg";
import { PLACEHOLDER_API_ROUTE } from "@/lib/gen/export/project-scaffold";
import type { CodeFile } from "@/lib/gen/parser";
import { applyPreviewOnlyRulesToFiles } from "@/lib/gen/preview/preview-only-files";
import {
  fetchPreviewHostFilesManifest,
  previewHostAuthHeaders,
} from "@/lib/gen/preview/preview-host-client";
import { hashPreviewFileContent } from "@/lib/gen/preview/preview-patch-plan";
import {
  peekActivePreviewSessionAsync,
  PREVIEW_SESSION_HARD_CAP_MS,
  PREVIEW_SESSION_IDLE_MS,
} from "@/lib/gen/preview/session-store";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import {
  getEngineVersionForChatByIdForRequest,
  getLatestEngineVersionForChatForRequest,
} from "@/lib/tenant";
import {
  OPENCLAW_READ_MAX_PROJECT_CHARS,
  OPENCLAW_READ_MAX_PROJECT_FILES,
  OPENCLAW_READ_MAX_LANGUAGE_CHARS,
  OPENCLAW_READ_MAX_RAW_SNAPSHOT_CHARS,
  normalizeOpenClawReadPath,
} from "./policy";

const PREVIEW_LOG_FETCH_TIMEOUT_MS = 4_000;
const PREVIEW_LOG_MAX_RESPONSE_CHARS = 256_000;

export type OpenClawReadAuthority = {
  request: Request;
  chatId: string;
  versionId?: string | null;
  sessionId?: string | null;
};

export type OpenClawReadTargetMetadata = {
  versionId: string;
  versionNumber: number;
  filesRevision: string;
  lifecycleStage: "design" | "integrations";
  releaseState: string;
  verificationState: string;
  verificationSummary: string | null;
  editKind: string | null;
  createdAt: string;
  hasPreviewUrl: boolean;
};

export type OpenClawReadTarget = {
  chatId: string;
  files: CodeFile[];
  metadata: OpenClawReadTargetMetadata;
};

export type OpenClawReadTargetLoadResult =
  | { ok: true; target: OpenClawReadTarget }
  | {
      ok: false;
      code:
        "target_unavailable" | "revision_unavailable" | "snapshot_invalid" | "project_too_large";
    };

export type OpenClawRawDiagnostic = {
  level: "info" | "warning" | "error";
  category: string | null;
  message: string;
  createdAt: string;
  defect: {
    kind: string;
    signature: string;
    file: string | null;
    line: number | null;
  } | null;
};

export type OpenClawPassivePreviewStatus = {
  status: "missing" | "running" | "stopped" | "unknown" | "version_mismatch" | "revision_mismatch";
  source: "session_store" | "files_manifest";
  sessionVersionMatches: boolean | null;
  sessionRevisionMatches: boolean | null;
  hostVersionMatches: boolean | null;
  hostRevisionMatches: boolean | null;
  expiresAt: number | null;
  readiness: "not_available_without_side_effects";
};

export type OpenClawRawPreviewLogs = {
  available: boolean;
  reason:
    | "ok"
    | "no_session"
    | "version_mismatch"
    | "revision_mismatch"
    | "host_unavailable"
    | "invalid_payload";
  lines: Array<{ ts: string; message: string }>;
  truncated: boolean;
  /** Exact server-owned identifiers the broker must remove from message text. */
  redactValues?: string[];
};

export interface OpenClawReadToolDataSource {
  loadTarget(authority: OpenClawReadAuthority): Promise<OpenClawReadTargetLoadResult>;
  loadDiagnostics(target: OpenClawReadTarget, limit: number): Promise<OpenClawRawDiagnostic[]>;
  loadPreviewStatus(target: OpenClawReadTarget): Promise<OpenClawPassivePreviewStatus>;
  loadPreviewLogs(target: OpenClawReadTarget, limit: number): Promise<OpenClawRawPreviewLogs>;
}

function parseOwnedFiles(version: Version): OpenClawReadTargetLoadResult {
  if (version.files_json.length > OPENCLAW_READ_MAX_RAW_SNAPSHOT_CHARS) {
    return { ok: false, code: "project_too_large" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(version.files_json) as unknown;
  } catch {
    return { ok: false, code: "snapshot_invalid" };
  }
  if (!Array.isArray(parsed)) return { ok: false, code: "snapshot_invalid" };
  const files = parsed as unknown[];
  if (files.length > OPENCLAW_READ_MAX_PROJECT_FILES) {
    return { ok: false, code: "project_too_large" };
  }

  const validated: CodeFile[] = [];
  const normalizedPaths = new Set<string>();
  let totalChars = 0;
  for (const rawFile of files) {
    if (!rawFile || typeof rawFile !== "object") {
      return { ok: false, code: "snapshot_invalid" };
    }
    const file = rawFile as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      typeof file.language !== "string"
    ) {
      return { ok: false, code: "snapshot_invalid" };
    }
    if (file.language.length > OPENCLAW_READ_MAX_LANGUAGE_CHARS) {
      return { ok: false, code: "project_too_large" };
    }
    const path = normalizeOpenClawReadPath(file.path);
    if (!path || normalizedPaths.has(path)) {
      return { ok: false, code: "snapshot_invalid" };
    }
    normalizedPaths.add(path);
    totalChars += file.content.length;
    if (totalChars > OPENCLAW_READ_MAX_PROJECT_CHARS) {
      return { ok: false, code: "project_too_large" };
    }
    validated.push({ path, content: file.content, language: file.language });
  }

  const filesRevision = version.files_revision?.trim() || "";
  if (!filesRevision) return { ok: false, code: "revision_unavailable" };
  return {
    ok: true,
    target: {
      chatId: version.chat_id,
      files: validated,
      metadata: {
        versionId: version.id,
        versionNumber: version.version_number,
        filesRevision,
        lifecycleStage: version.lifecycle_stage,
        releaseState: version.release_state,
        verificationState: version.verification_state,
        verificationSummary: version.verification_summary,
        editKind: version.edit_kind,
        createdAt: version.created_at,
        hasPreviewUrl: Boolean(version.preview_url?.trim()),
      },
    },
  };
}

async function loadOwnedTarget(
  authority: OpenClawReadAuthority,
): Promise<OpenClawReadTargetLoadResult> {
  const chatId = authority.chatId.trim();
  if (!chatId) return { ok: false, code: "target_unavailable" };
  const options = authority.sessionId?.trim()
    ? { sessionId: authority.sessionId.trim() }
    : undefined;
  const requestedVersionId = authority.versionId?.trim() || null;
  const scoped = requestedVersionId
    ? await getEngineVersionForChatByIdForRequest(
        authority.request,
        chatId,
        requestedVersionId,
        options,
      )
    : await getLatestEngineVersionForChatForRequest(authority.request, chatId, options);
  if (!scoped) return { ok: false, code: "target_unavailable" };
  return parseOwnedFiles(scoped.version);
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function readDefect(meta: unknown): OpenClawRawDiagnostic["defect"] {
  if (!meta || typeof meta !== "object") return null;
  const defect = (meta as { defect?: unknown }).defect;
  if (!defect || typeof defect !== "object") return null;
  const row = defect as Record<string, unknown>;
  if (typeof row.kind !== "string" || typeof row.signature !== "string") return null;
  const file = typeof row.file === "string" ? normalizeOpenClawReadPath(row.file) : null;
  const line =
    typeof row.line === "number" && Number.isSafeInteger(row.line) && row.line > 0
      ? row.line
      : null;
  return {
    kind: row.kind,
    signature: row.signature,
    file,
    line,
  };
}

async function loadDiagnostics(
  target: OpenClawReadTarget,
  limit: number,
): Promise<OpenClawRawDiagnostic[]> {
  const rows = await getLatestEngineVersionErrorLogs(
    target.metadata.versionId,
    Math.min(30, Math.max(1, limit)),
  );
  return rows.map((row) => ({
    level:
      row.level === "error" || row.level === "warning" || row.level === "info" ? row.level : "info",
    category: typeof row.category === "string" ? row.category : null,
    message: typeof row.message === "string" ? row.message : "",
    createdAt: toIsoString(row.created_at),
    defect: readDefect(row.meta),
  }));
}

function sessionExpiresAt(session: { createdAt: number; lastUsedAt: number }): number {
  return Math.min(
    session.createdAt + PREVIEW_SESSION_HARD_CAP_MS,
    session.lastUsedAt + PREVIEW_SESSION_IDLE_MS,
  );
}

function normalizePreviewFileHashes(
  entries: Iterable<readonly [path: string, hash: string]>,
): Map<string, string> | null {
  const normalized = new Map<string, string>();
  for (const [rawPath, hash] of entries) {
    const path = normalizeOpenClawReadPath(rawPath);
    if (!path || normalized.has(path)) return null;
    normalized.set(path, hash);
  }
  return normalized;
}

async function loadPreviewStatus(
  target: OpenClawReadTarget,
): Promise<OpenClawPassivePreviewStatus> {
  const session = await peekActivePreviewSessionAsync(target.chatId);
  if (!session) {
    return {
      status: "missing",
      source: "session_store",
      sessionVersionMatches: null,
      sessionRevisionMatches: null,
      hostVersionMatches: null,
      hostRevisionMatches: null,
      expiresAt: null,
      readiness: "not_available_without_side_effects",
    };
  }
  const expiresAt = sessionExpiresAt(session);
  if (session.versionId !== target.metadata.versionId) {
    return {
      status: "version_mismatch",
      source: "session_store",
      sessionVersionMatches: false,
      sessionRevisionMatches: null,
      hostVersionMatches: null,
      hostRevisionMatches: null,
      expiresAt,
      readiness: "not_available_without_side_effects",
    };
  }
  if (!session.filesRevision || session.filesRevision !== target.metadata.filesRevision) {
    return {
      status: "revision_mismatch",
      source: "session_store",
      sessionVersionMatches: true,
      sessionRevisionMatches: false,
      hostVersionMatches: null,
      hostRevisionMatches: null,
      expiresAt,
      readiness: "not_available_without_side_effects",
    };
  }

  const manifest = await fetchPreviewHostFilesManifest(session.previewSessionId);
  if (!manifest || manifest.previewSessionId !== session.previewSessionId) {
    return {
      status: "unknown",
      source: "files_manifest",
      sessionVersionMatches: true,
      sessionRevisionMatches: true,
      hostVersionMatches: null,
      hostRevisionMatches: null,
      expiresAt,
      readiness: "not_available_without_side_effects",
    };
  }
  const hostVersionMatches = manifest.versionId === target.metadata.versionId;
  if (!hostVersionMatches) {
    return {
      status: "version_mismatch",
      source: "files_manifest",
      sessionVersionMatches: true,
      sessionRevisionMatches: true,
      hostVersionMatches: false,
      hostRevisionMatches: null,
      expiresAt,
      readiness: "not_available_without_side_effects",
    };
  }
  const expectedFiles = normalizePreviewFileHashes(
    applyPreviewOnlyRulesToFiles(target.files)
      .filter((file) => file.path !== ".env.local")
      .map((file) => [file.path, hashPreviewFileContent(file.content)] as const),
  );
  const manifestFiles = normalizePreviewFileHashes(Object.entries(manifest.files));
  if (expectedFiles) {
    if (
      !expectedFiles.has("app/api/placeholder/route.ts") &&
      !expectedFiles.has("app/api/placeholder/route.js")
    ) {
      expectedFiles.set(
        "app/api/placeholder/route.ts",
        hashPreviewFileContent(PLACEHOLDER_API_ROUTE),
      );
    }
  }
  const hostRevisionMatches =
    expectedFiles !== null &&
    manifestFiles !== null &&
    manifestFiles.has(".env.local") &&
    [...manifestFiles.keys()].every((path) => path === ".env.local" || expectedFiles.has(path)) &&
    [...expectedFiles].every(([path, hash]) => manifestFiles.get(path) === hash);
  return {
    status: hostRevisionMatches ? (manifest.running ? "running" : "stopped") : "revision_mismatch",
    source: "files_manifest",
    sessionVersionMatches: true,
    sessionRevisionMatches: true,
    hostVersionMatches: true,
    hostRevisionMatches,
    expiresAt,
    readiness: "not_available_without_side_effects",
  };
}

function parsePreviewLogPayload(payload: unknown): Array<{ ts: string; message: string }> | null {
  if (!payload || typeof payload !== "object") return null;
  const lines = (payload as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;
  const parsed: Array<{ ts: string; message: string }> = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const row = line as Record<string, unknown>;
    if (typeof row.message !== "string" || !row.message.trim()) continue;
    parsed.push({
      ts: typeof row.ts === "string" ? row.ts.slice(0, 64) : "",
      message: row.message,
    });
  }
  return parsed;
}

async function loadPreviewLogs(
  target: OpenClawReadTarget,
  limit: number,
): Promise<OpenClawRawPreviewLogs> {
  const session = await peekActivePreviewSessionAsync(target.chatId);
  if (!session) {
    return { available: false, reason: "no_session", lines: [], truncated: false };
  }
  if (session.versionId !== target.metadata.versionId) {
    return { available: false, reason: "version_mismatch", lines: [], truncated: false };
  }
  if (!session.filesRevision || session.filesRevision !== target.metadata.filesRevision) {
    return { available: false, reason: "revision_mismatch", lines: [], truncated: false };
  }
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return { available: false, reason: "host_unavailable", lines: [], truncated: false };
  }

  try {
    const response = await fetch(
      `${base}/preview/logs/${encodeURIComponent(session.previewSessionId)}`,
      {
        method: "GET",
        headers: { ...previewHostAuthHeaders() },
        cache: "no-store",
        signal: AbortSignal.timeout(PREVIEW_LOG_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return { available: false, reason: "host_unavailable", lines: [], truncated: false };
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > PREVIEW_LOG_MAX_RESPONSE_CHARS) {
      return { available: false, reason: "invalid_payload", lines: [], truncated: true };
    }
    const text = await response.text();
    if (text.length > PREVIEW_LOG_MAX_RESPONSE_CHARS) {
      return { available: false, reason: "invalid_payload", lines: [], truncated: true };
    }
    const parsed = parsePreviewLogPayload(JSON.parse(text) as unknown);
    if (!parsed) {
      return { available: false, reason: "invalid_payload", lines: [], truncated: false };
    }
    const boundedLimit = Math.min(40, Math.max(1, limit));
    return {
      available: true,
      reason: "ok",
      lines: parsed.slice(-boundedLimit),
      truncated: parsed.length > boundedLimit,
      redactValues: [session.previewSessionId, session.previewUrl, base],
    };
  } catch {
    return { available: false, reason: "host_unavailable", lines: [], truncated: false };
  }
}

export const defaultOpenClawReadToolDataSource: OpenClawReadToolDataSource = {
  loadTarget: loadOwnedTarget,
  loadDiagnostics,
  loadPreviewStatus,
  loadPreviewLogs,
};
