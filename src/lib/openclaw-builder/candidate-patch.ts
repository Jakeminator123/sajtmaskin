/**
 * In-memory `candidate.apply_patch` / `candidate.replace_files` / `project.diff`
 * against a caller-supplied local overlay. Whole-file replace only — no fuzzy
 * diff engine, no deletes, no I/O, no shell. Overlay values stay strings so
 * the result stays JSON-safe (no tombstone nulls).
 */

export type PatchHunk = { path: string; content: string };

export type CandidatePatchError =
  | "invalid_path"
  | "restricted_path"
  | "too_large"
  | "too_many_files"
  | "invalid_input";

export type CandidatePatchOk = {
  ok: true;
  overlay: Record<string, string>;
  changedPaths: string[];
};

export type CandidatePatchResult = CandidatePatchOk | { ok: false; code: CandidatePatchError };

export type CandidateDiffKind = "added" | "modified";

export type CandidateDiffResult =
  | { ok: true; changed: Array<{ path: string; kind: CandidateDiffKind }> }
  | { ok: false; code: "invalid_input" };

export const MAX_CHANGED_FILES = 80;
export const MAX_FILE_CHARS = 200_000;
export const MAX_OVERLAY_BYTES = 2_000_000;
export const MAX_PATH_LENGTH = 200;

const RESTRICTED_EXACT_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".yarnrc.yml",
  ".pypirc",
  "package-lock.json",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
]);
const SECRET_RE = /bearer|sk-|rk[_-]|whsec|BEGIN PRIVATE|api[_-]?key/i;

const INVALID_INPUT = { ok: false, code: "invalid_input" } as const;

function isStringRecord(value: unknown): value is Record<string, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== "string") return false;
  }
  return true;
}

function cloneStringRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(record)) {
    out[path] = content;
  }
  return out;
}

function normalizePath(raw: unknown): { ok: true; path: string } | { ok: false; code: "invalid_path" } {
  if (typeof raw !== "string") return { ok: false, code: "invalid_path" };
  if (raw.length === 0 || raw.length > MAX_PATH_LENGTH) return { ok: false, code: "invalid_path" };
  if (raw.includes("\\") || raw.includes("\0")) return { ok: false, code: "invalid_path" };
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return { ok: false, code: "invalid_path" };

  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      return { ok: false, code: "invalid_path" };
    }
  }
  return { ok: true, path: raw };
}

function basenameOf(path: string): string {
  const parts = path.split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function isRestrictedPath(path: string): boolean {
  const basename = basenameOf(path);
  if (!basename) return true;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (RESTRICTED_EXACT_BASENAMES.has(basename)) return true;
  if (basename.endsWith(".pem") || basename.endsWith(".key")) return true;
  if (path === ".git/config" || path.startsWith(".git/")) return true;
  return false;
}

function validateExistingOverlay(
  overlay: Record<string, string>,
): CandidatePatchResult | null {
  for (const [path, content] of Object.entries(overlay)) {
    const normalized = normalizePath(path);
    if (!normalized.ok) return normalized;
    if (normalized.path !== path) return { ok: false, code: "invalid_path" };
    if (isRestrictedPath(normalized.path)) return { ok: false, code: "restricted_path" };
    if (content.length > MAX_FILE_CHARS) return { ok: false, code: "too_large" };
    if (content.includes("\0") || SECRET_RE.test(content)) return INVALID_INPUT;
  }
  return null;
}

function overlayByteLength(overlay: Record<string, string>): number {
  let bytes = 0;
  for (const content of Object.values(overlay)) {
    bytes += Buffer.byteLength(content, "utf8");
  }
  return bytes;
}

function applyWrites(
  base: unknown,
  overlay: unknown,
  writes: unknown,
): CandidatePatchResult {
  if (!isStringRecord(base) || !isStringRecord(overlay)) return INVALID_INPUT;
  if (!Array.isArray(writes)) return INVALID_INPUT;
  const overlayError = validateExistingOverlay(overlay);
  if (overlayError) return overlayError;

  const next = cloneStringRecord(overlay);
  const changed = new Set<string>();

  for (const hunk of writes) {
    if (hunk == null || typeof hunk !== "object" || Array.isArray(hunk)) {
      return INVALID_INPUT;
    }
    const pathRaw = (hunk as { path?: unknown }).path;
    const content = (hunk as { content?: unknown }).content;
    if (typeof content !== "string") return INVALID_INPUT;

    const normalized = normalizePath(pathRaw);
    if (!normalized.ok) return normalized;
    if (isRestrictedPath(normalized.path)) return { ok: false, code: "restricted_path" };
    if (content.length > MAX_FILE_CHARS) return { ok: false, code: "too_large" };
    if (content.includes("\0") || SECRET_RE.test(content)) return INVALID_INPUT;

    next[normalized.path] = content;
    changed.add(normalized.path);
  }

  if (Object.keys(next).length > MAX_CHANGED_FILES) {
    return { ok: false, code: "too_many_files" };
  }
  if (overlayByteLength(next) > MAX_OVERLAY_BYTES) {
    return { ok: false, code: "too_large" };
  }

  return {
    ok: true,
    overlay: next,
    changedPaths: [...changed].sort(),
  };
}

export function applyCandidatePatch(input: {
  base: Record<string, string>;
  overlay: Record<string, string>;
  hunks: PatchHunk[];
}): CandidatePatchResult {
  return applyWrites(input?.base, input?.overlay, input?.hunks);
}

export function replaceCandidateFiles(input: {
  base: Record<string, string>;
  overlay: Record<string, string>;
  files: PatchHunk[];
}): CandidatePatchResult {
  return applyWrites(input?.base, input?.overlay, input?.files);
}

export function diffCandidate(input: {
  base: Record<string, string>;
  overlay: Record<string, string>;
}): CandidateDiffResult {
  if (!isStringRecord(input?.base) || !isStringRecord(input?.overlay)) {
    return INVALID_INPUT;
  }

  const changed: Array<{ path: string; kind: CandidateDiffKind }> = [];
  for (const [path, content] of Object.entries(input.overlay)) {
    if (!(path in input.base)) {
      changed.push({ path, kind: "added" });
    } else if (input.base[path] !== content) {
      changed.push({ path, kind: "modified" });
    }
  }
  changed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, changed };
}
