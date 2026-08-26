/**
 * Ephemeral in-memory candidate sandbox. Hydrates from a caller-supplied
 * base snapshot and keeps a private overlay. No containers, shell, env,
 * fs, fetch, or child_process. This slice is read-only — no apply_patch.
 */

export const MAX_SANDBOX_FILES = 500;
export const MAX_SANDBOX_PATH_LENGTH = 200;
export const MAX_SANDBOX_FILE_CHARS = 200_000;

export type SandboxFile = { path: string; content: string };

export type Sandbox = {
  jobId: string;
  baseFilesRevision: string;
  overlay: Map<string, string>;
};

export type SandboxHandle = {
  jobId: string;
  baseFilesRevision: string;
  fileCount: number;
};

export type CreateSandboxResult =
  | { ok: true; sandbox: SandboxHandle }
  | { ok: false; code: "invalid_base" };

export type ReadSandboxFileResult =
  | { ok: true; content: string; source: "base" | "overlay" }
  | { ok: false; code: "invalid_path" | "not_found" | "invalid_sandbox" };

export type ListSandboxPathsResult =
  | { ok: true; paths: string[] }
  | { ok: false; code: "invalid_sandbox" };

type InternalSandbox = {
  jobId: string;
  baseFilesRevision: string;
  base: Map<string, string>;
  overlay: Map<string, string>;
};

const SANDBOXES = new WeakMap<object, InternalSandbox>();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeSandboxPath(raw: unknown): { ok: true; path: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  if (raw.length === 0 || raw.length > MAX_SANDBOX_PATH_LENGTH) return { ok: false };
  if (raw.includes("\\") || raw.includes("\0")) return { ok: false };
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return { ok: false };

  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      return { ok: false };
    }
  }
  return { ok: true, path: raw };
}

function resolveSandbox(handle: unknown): InternalSandbox | null {
  if (handle == null || typeof handle !== "object") return null;
  return SANDBOXES.get(handle) ?? null;
}

function hydrateBase(
  files: unknown,
): { ok: true; base: Map<string, string> } | { ok: false } {
  if (!Array.isArray(files) || files.length > MAX_SANDBOX_FILES) return { ok: false };

  const base = new Map<string, string>();
  for (const file of files) {
    if (file == null || typeof file !== "object") return { ok: false };
    const record = file as { path?: unknown; content?: unknown };
    const normalized = normalizeSandboxPath(record.path);
    if (!normalized.ok) return { ok: false };
    if (typeof record.content !== "string") return { ok: false };
    if (record.content.length > MAX_SANDBOX_FILE_CHARS) return { ok: false };
    if (base.has(normalized.path)) return { ok: false };
    base.set(normalized.path, record.content);
  }
  return { ok: true, base };
}

export function createSandbox(input: {
  jobId: string;
  baseFilesRevision: string;
  baseFiles: SandboxFile[];
}): CreateSandboxResult {
  if (input == null || typeof input !== "object") {
    return { ok: false, code: "invalid_base" };
  }
  if (!isNonEmptyString(input.jobId) || !isNonEmptyString(input.baseFilesRevision)) {
    return { ok: false, code: "invalid_base" };
  }

  const hydrated = hydrateBase(input.baseFiles);
  if (!hydrated.ok) return { ok: false, code: "invalid_base" };

  const handle: SandboxHandle = Object.freeze({
    jobId: input.jobId,
    baseFilesRevision: input.baseFilesRevision,
    fileCount: hydrated.base.size,
  });

  SANDBOXES.set(handle, {
    jobId: input.jobId,
    baseFilesRevision: input.baseFilesRevision,
    base: hydrated.base,
    overlay: new Map(),
  });

  return { ok: true, sandbox: handle };
}

export function readSandboxFile(sandboxHandle: unknown, path: string): ReadSandboxFileResult {
  const sandbox = resolveSandbox(sandboxHandle);
  if (!sandbox) return { ok: false, code: "invalid_sandbox" };

  const normalized = normalizeSandboxPath(path);
  if (!normalized.ok) return { ok: false, code: "invalid_path" };

  const overlayContent = sandbox.overlay.get(normalized.path);
  if (overlayContent !== undefined) {
    return { ok: true, content: overlayContent, source: "overlay" };
  }

  const baseContent = sandbox.base.get(normalized.path);
  if (baseContent !== undefined) {
    return { ok: true, content: baseContent, source: "base" };
  }

  return { ok: false, code: "not_found" };
}

export function listSandboxPaths(sandboxHandle: unknown): ListSandboxPathsResult {
  const sandbox = resolveSandbox(sandboxHandle);
  if (!sandbox) return { ok: false, code: "invalid_sandbox" };

  const paths = new Set<string>(sandbox.base.keys());
  for (const path of sandbox.overlay.keys()) paths.add(path);
  return { ok: true, paths: [...paths].sort() };
}
