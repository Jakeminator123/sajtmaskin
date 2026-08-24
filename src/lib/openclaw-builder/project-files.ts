import { createHash } from "node:crypto";

export type ProjectFile = { path: string; content: string; language?: string };

export type ProjectFileError =
  | "invalid_path"
  | "restricted_path"
  | "file_not_found"
  | "unsupported_file"
  | "invalid_query"
  | "ambiguous_path";

const MAX_PATH_LENGTH = 200;
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const READ_MAX_LINES = 250;
const READ_MAX_CHARS = 20_000;
const SEARCH_MIN_QUERY = 2;
const SEARCH_MAX_QUERY = 160;
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 30;
const SEARCH_SCAN_CAP = 80;
const SEARCH_MATCH_TEXT_MAX = 200;
const CURSOR_RE = /^v1:(\d+)$/;

const RESTRICTED_EXACT_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".yarnrc.yml",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

type NormalizedPath = { ok: true; path: string } | { ok: false; code: "invalid_path" };

function normalizeProjectPath(raw: string): NormalizedPath {
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
  if (basename.includes("secret") || basename.includes("credential")) return true;
  if (path === ".git/config" || path.startsWith(".git/")) return true;
  return false;
}

function isBinaryContent(content: string): boolean {
  return typeof content !== "string" || content.includes("\0");
}

function utf8Bytes(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resolveLanguage(file: ProjectFile): string {
  return file.language && file.language.length > 0 ? file.language : "text";
}

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit == null || !Number.isFinite(limit)) return fallback;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, max);
}

function parseListCursor(cursor: string | undefined): number | null {
  if (cursor == null || cursor === "") return 0;
  const match = CURSOR_RE.exec(cursor);
  if (!match) return null;
  return Number(match[1]);
}

function prefixFilter(prefix: string | undefined): { ok: true; prefix: string | null } | { ok: false } {
  if (prefix == null || prefix === "") return { ok: true, prefix: null };
  if (typeof prefix !== "string") return { ok: false };
  if (prefix.includes("\\") || prefix.includes("\0")) return { ok: false };
  if (prefix.startsWith("/") || /^[a-zA-Z]:/.test(prefix)) return { ok: false };
  if (prefix.length > MAX_PATH_LENGTH) return { ok: false };

  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (trimmed.length === 0) return { ok: true, prefix: null };
  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return { ok: false };
  }
  return { ok: true, prefix: trimmed };
}

function pathMatchesPrefix(path: string, prefix: string | null): boolean {
  if (prefix == null) return true;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type ListableFile = {
  path: string;
  bytes: number;
  language: string;
  sha256: string;
};

function collectListableFiles(files: ProjectFile[], prefix: string | null): ListableFile[] {
  const listed: ListableFile[] = [];
  for (const file of files) {
    const normalized = normalizeProjectPath(file.path);
    if (!normalized.ok) continue;
    if (isRestrictedPath(normalized.path)) continue;
    if (!pathMatchesPrefix(normalized.path, prefix)) continue;
    listed.push({
      path: normalized.path,
      bytes: utf8Bytes(typeof file.content === "string" ? file.content : ""),
      language: resolveLanguage(file),
      sha256: sha256Hex(typeof file.content === "string" ? file.content : ""),
    });
  }
  listed.sort((a, b) => comparePath(a.path, b.path));
  return listed;
}

export function listProjectFiles(input: {
  files: ProjectFile[];
  prefix?: string;
  cursor?: string;
  limit?: number;
}): { files: Array<{ path: string; bytes: number; language: string; sha256: string }>; nextCursor: string | null } {
  const files = Array.isArray(input.files) ? input.files : [];
  const prefix = prefixFilter(input.prefix);
  if (!prefix.ok) return { files: [], nextCursor: null };

  const listed = collectListableFiles(files, prefix.prefix);
  const start = parseListCursor(input.cursor);
  if (start == null || start >= listed.length) return { files: [], nextCursor: null };

  const limit = clampLimit(input.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
  const page = listed.slice(start, start + limit);
  const nextIndex = start + page.length;
  return {
    files: page,
    nextCursor: nextIndex < listed.length ? `v1:${nextIndex}` : null,
  };
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function takeReadWindow(
  lines: string[],
  startLine: number,
  endLine: number,
): { content: string; startLine: number; endLine: number; truncated: boolean } {
  const start = Math.max(1, startLine);
  if (start > lines.length) {
    return { content: "", startLine: start, endLine: start - 1, truncated: false };
  }

  const requestedEnd = Math.max(start, endLine);
  const fileEnd = Math.min(requestedEnd, lines.length);
  const cappedEnd = Math.min(fileEnd, start + READ_MAX_LINES - 1);
  const slice = lines.slice(start - 1, cappedEnd);
  const truncatedByLines = fileEnd > cappedEnd;
  const joined = slice.join("\n");
  if (joined.length <= READ_MAX_CHARS) {
    return {
      content: joined,
      startLine: start,
      endLine: start + slice.length - 1,
      truncated: truncatedByLines,
    };
  }
  return {
    content: joined.slice(0, READ_MAX_CHARS),
    startLine: start,
    endLine: start + slice.length - 1,
    truncated: true,
  };
}

export function readProjectFile(input: {
  files: ProjectFile[];
  path: string;
  startLine?: number;
  endLine?: number;
}):
  | { ok: true; path: string; content: string; startLine: number; endLine: number; truncated: boolean }
  | { ok: false; code: ProjectFileError } {
  const normalized = normalizeProjectPath(input.path);
  if (!normalized.ok) return { ok: false, code: "invalid_path" };
  if (isRestrictedPath(normalized.path)) return { ok: false, code: "restricted_path" };

  const files = Array.isArray(input.files) ? input.files : [];
  const matches: ProjectFile[] = [];
  for (const file of files) {
    const filePath = normalizeProjectPath(file.path);
    if (!filePath.ok) continue;
    if (filePath.path === normalized.path) matches.push(file);
  }

  if (matches.length === 0) return { ok: false, code: "file_not_found" };
  if (matches.length > 1) return { ok: false, code: "ambiguous_path" };

  const file = matches[0]!;
  if (isBinaryContent(file.content)) return { ok: false, code: "unsupported_file" };

  const lines = splitLines(file.content);
  const startLine =
    input.startLine == null || !Number.isFinite(input.startLine) ? 1 : Math.floor(input.startLine);
  // An omitted end means "the rest of the file", then the 250-line / 20k-char
  // caps apply and truncated=true when those caps cut the selected range.
  const endLine =
    input.endLine == null || !Number.isFinite(input.endLine)
      ? lines.length
      : Math.floor(input.endLine);

  const window = takeReadWindow(lines, startLine < 1 ? 1 : startLine, endLine);
  return {
    ok: true,
    path: normalized.path,
    content: window.content,
    startLine: window.startLine,
    endLine: window.endLine,
    truncated: window.truncated,
  };
}

function clipMatchText(text: string): string {
  return text.length > SEARCH_MATCH_TEXT_MAX ? text.slice(0, SEARCH_MATCH_TEXT_MAX) : text;
}

export function searchProjectFiles(input: {
  files: ProjectFile[];
  query: string;
  pathPrefix?: string;
  caseSensitive?: boolean;
  limit?: number;
}):
  | { ok: true; matches: Array<{ path: string; line: number; text: string }>; truncated: boolean }
  | { ok: false; code: ProjectFileError } {
  if (typeof input.query !== "string") return { ok: false, code: "invalid_query" };
  if (input.query.includes("\0")) return { ok: false, code: "invalid_query" };
  if (input.query.length < SEARCH_MIN_QUERY || input.query.length > SEARCH_MAX_QUERY) {
    return { ok: false, code: "invalid_query" };
  }

  const prefix = prefixFilter(input.pathPrefix);
  if (!prefix.ok) {
    return { ok: true, matches: [], truncated: false };
  }

  const files = Array.isArray(input.files) ? input.files : [];
  const indexed: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const normalized = normalizeProjectPath(file.path);
    if (!normalized.ok) continue;
    if (isRestrictedPath(normalized.path)) continue;
    if (!pathMatchesPrefix(normalized.path, prefix.prefix)) continue;
    if (isBinaryContent(file.content)) continue;
    indexed.push({ path: normalized.path, content: file.content });
  }
  indexed.sort((a, b) => comparePath(a.path, b.path));

  const limit = clampLimit(input.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT);
  const caseSensitive = input.caseSensitive === true;
  const needle = caseSensitive ? input.query : input.query.toLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];
  let seen = 0;
  let truncated = false;

  outer: for (const file of indexed) {
    const lines = splitLines(file.content);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const haystack = caseSensitive ? line : line.toLowerCase();
      if (!haystack.includes(needle)) continue;
      seen += 1;
      if (matches.length < limit) {
        matches.push({ path: file.path, line: i + 1, text: clipMatchText(line) });
      } else {
        truncated = true;
      }
      if (seen >= SEARCH_SCAN_CAP) {
        truncated = true;
        break outer;
      }
    }
  }

  return { ok: true, matches, truncated };
}
