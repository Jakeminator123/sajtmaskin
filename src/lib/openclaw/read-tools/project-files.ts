import type { CodeFile } from "@/lib/gen/parser";
import { isNonTextContentFile } from "@/lib/gen/context/file-context-builder";
import type { OpenClawReadToolArgs } from "./contracts";
import {
  OPENCLAW_READ_MAX_FILE_CHARS,
  OPENCLAW_READ_MAX_FILE_LINES,
  OPENCLAW_READ_MAX_SEARCH_LINE_CHARS,
  OPENCLAW_READ_MAX_SEARCH_SCAN_CHARS,
  isSensitiveOpenClawReadPath,
  normalizeOpenClawReadPath,
  normalizeOpenClawReadPrefix,
} from "./policy";
import { scrubOpenClawReadText } from "./scrub";

export type ProjectFileToolErrorCode =
  | "invalid_path"
  | "restricted_path"
  | "file_not_found"
  | "unsupported_file"
  | "ambiguous_path"
  | "invalid_query";

export type ProjectFileToolResult<T> =
  { ok: true; data: T } | { ok: false; code: ProjectFileToolErrorCode; message: string };

type IndexedFile = {
  path: string;
  file: CodeFile;
  sensitive: boolean;
  text: boolean;
};

function indexFiles(files: readonly CodeFile[]): IndexedFile[] {
  return files
    .map((file) => {
      const path = normalizeOpenClawReadPath(file.path);
      if (!path) return null;
      return {
        path,
        file,
        sensitive: isSensitiveOpenClawReadPath(path),
        text: !isNonTextContentFile(file),
      };
    })
    .filter((file): file is IndexedFile => file !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function matchesPrefix(path: string, prefix: string): boolean {
  return !prefix || path === prefix || path.startsWith(`${prefix}/`);
}

function countLines(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number(cursor.slice("v1:".length));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export type OpenClawFileListResult = {
  files: Array<{
    path: string;
    language: string;
    lines: number;
    sizeChars: number;
    contentAvailable: boolean;
  }>;
  nextCursor: string | null;
  totalMatching: number;
  omittedUnsafePaths: number;
};

export function listOpenClawProjectFiles(
  files: readonly CodeFile[],
  args: OpenClawReadToolArgs["project_list_files"],
): ProjectFileToolResult<OpenClawFileListResult> {
  const prefix = normalizeOpenClawReadPrefix(args.prefix);
  if (prefix === null) {
    return {
      ok: false,
      code: "invalid_path",
      message: "The requested prefix is not a safe project path.",
    };
  }
  const indexed = indexFiles(files);
  const omittedUnsafePaths = Math.max(0, files.length - indexed.length);
  const matching = indexed.filter((entry) => matchesPrefix(entry.path, prefix));
  const offset = decodeCursor(args.cursor);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const page = matching.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    ok: true,
    data: {
      files: page.map((entry) => ({
        path: entry.path,
        language: entry.file.language || "text",
        lines: entry.text ? countLines(entry.file.content) : 0,
        sizeChars: entry.file.content.length,
        contentAvailable: entry.text && !entry.sensitive,
      })),
      nextCursor: nextOffset < matching.length ? `v1:${nextOffset}` : null,
      totalMatching: matching.length,
      omittedUnsafePaths,
    },
  };
}

export type OpenClawFileReadResult = {
  path: string;
  language: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  redacted: boolean;
  truncated: boolean;
};

export function readOpenClawProjectFile(
  files: readonly CodeFile[],
  args: OpenClawReadToolArgs["project_read_file"],
): ProjectFileToolResult<OpenClawFileReadResult> {
  const path = normalizeOpenClawReadPath(args.path);
  if (!path) {
    return {
      ok: false,
      code: "invalid_path",
      message: "The requested path is not a safe project path.",
    };
  }
  if (isSensitiveOpenClawReadPath(path)) {
    return {
      ok: false,
      code: "restricted_path",
      message: "That project path is not available to read tools.",
    };
  }

  const matches = indexFiles(files).filter((entry) => entry.path === path);
  if (matches.length === 0) {
    return {
      ok: false,
      code: "file_not_found",
      message: "The requested file does not exist in the bound version.",
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      code: "ambiguous_path",
      message: "The bound version contains an ambiguous duplicate path.",
    };
  }
  const entry = matches[0];
  if (!entry.text) {
    return {
      ok: false,
      code: "unsupported_file",
      message: "Binary or encoded files cannot be read through this tool.",
    };
  }

  const lines = entry.file.content.split(/\r?\n/);
  const totalLines = lines.length;
  const requestedStart = Math.max(1, args.startLine ?? 1);
  const startLine = Math.min(requestedStart, Math.max(1, totalLines));
  const requestedEnd =
    args.endLine === undefined ? Number.POSITIVE_INFINITY : Math.max(requestedStart, args.endLine);
  const lineBudgetEnd = startLine + OPENCLAW_READ_MAX_FILE_LINES - 1;
  const endLine = Math.min(totalLines, requestedEnd, lineBudgetEnd);
  const lineBudgetTruncated = Math.min(totalLines, requestedEnd) > lineBudgetEnd;
  const selected = lines.slice(startLine - 1, endLine).join("\n");
  const scrubbed = scrubOpenClawReadText(selected, { maxChars: OPENCLAW_READ_MAX_FILE_CHARS });
  return {
    ok: true,
    data: {
      path,
      language: entry.file.language || "text",
      content: scrubbed.text,
      startLine,
      endLine,
      totalLines,
      redacted: scrubbed.redacted,
      truncated: scrubbed.truncated || lineBudgetTruncated,
    },
  };
}

export type OpenClawCodeSearchResult = {
  matches: Array<{
    path: string;
    line: number;
    column: number;
    text: string;
    redacted: boolean;
  }>;
  scannedFiles: number;
  scannedChars: number;
  scanTruncated: boolean;
  resultTruncated: boolean;
};

export function searchOpenClawProjectCode(
  files: readonly CodeFile[],
  args: OpenClawReadToolArgs["project_search_code"],
): ProjectFileToolResult<OpenClawCodeSearchResult> {
  if (/\p{Cc}/u.test(args.query)) {
    return {
      ok: false,
      code: "invalid_query",
      message: "Search text cannot contain control characters.",
    };
  }
  const prefix = normalizeOpenClawReadPrefix(args.pathPrefix);
  if (prefix === null) {
    return {
      ok: false,
      code: "invalid_path",
      message: "The requested prefix is not a safe project path.",
    };
  }
  const query = args.caseSensitive ? args.query : args.query.toLocaleLowerCase("en-US");
  const limit = Math.min(30, Math.max(1, args.limit ?? 20));
  const matches: OpenClawCodeSearchResult["matches"] = [];
  let scannedFiles = 0;
  let scannedChars = 0;
  let scanTruncated = false;
  let resultTruncated = false;

  for (const entry of indexFiles(files)) {
    if (!entry.text || entry.sensitive || !matchesPrefix(entry.path, prefix)) continue;
    if (scannedChars + entry.file.content.length > OPENCLAW_READ_MAX_SEARCH_SCAN_CHARS) {
      scanTruncated = true;
      break;
    }
    scannedFiles += 1;
    scannedChars += entry.file.content.length;
    const lines = entry.file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const haystack = args.caseSensitive ? line : line.toLocaleLowerCase("en-US");
      const column = haystack.indexOf(query);
      if (column < 0) continue;
      if (matches.length >= limit) {
        resultTruncated = true;
        break;
      }
      const scrubbed = scrubOpenClawReadText(line, {
        maxChars: OPENCLAW_READ_MAX_SEARCH_LINE_CHARS,
      });
      matches.push({
        path: entry.path,
        line: index + 1,
        column: column + 1,
        text: scrubbed.text,
        redacted: scrubbed.redacted,
      });
    }
    if (resultTruncated) break;
  }

  return {
    ok: true,
    data: {
      matches,
      scannedFiles,
      scannedChars,
      scanTruncated,
      resultTruncated,
    },
  };
}
