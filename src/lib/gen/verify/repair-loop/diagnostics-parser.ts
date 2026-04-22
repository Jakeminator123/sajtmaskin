/**
 * Parse file-scoped diagnostics out of failed check outputs (tsc/build/lint).
 *
 * Extracted from `src/lib/gen/verify/repair-loop.ts` 2026-04-21.
 */

export type RepairFailedOutput = {
  check: string;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

export type ParsedRepairDiagnostic = {
  file: string;
  line: number | null;
  column: number | null;
  message: string;
  source: string;
};

const STACK_LINE_PREFIX_RE = /^\s*(at|in)\s+/i;
const NOISE_LINE_RE = /^(>|\|{2,}|npm (ERR|WARN)!|error Command failed)/i;
const FILE_LINE_RE =
  /^(?<file>(?:[A-Za-z]:)?[^:\n\r]+\.(?:[tj]sx?|jsx?|mjs|cjs|json|css|scss|mdx?))(?::(?<line>\d+))?(?::(?<column>\d+))?\s*-?\s*(?<message>.+)$/;
const TS_DIAG_RE =
  /^(?<file>(?:[A-Za-z]:)?[^:\n\r]+\.(?:[tj]sx?|jsx?|mjs|cjs|json|css|scss|mdx?))\((?<line>\d+),(?<column>\d+)\):\s*(?:error|warning)\s+TS\d+:\s*(?<message>.+)$/i;
const BRACKET_PREFIX_RE = /^\[[^\]]+\]\s*/;

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function normalizeDiagnosticFile(raw: string): string | null {
  const normalized = toPosixPath(raw.replace(/^file\s+/i, "").trim());
  if (!normalized || normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return null;
  }
  if (normalized.includes("node_modules/")) return null;
  const cwdMarker = "/sajtmaskin/";
  const cwdIndex = normalized.toLowerCase().lastIndexOf(cwdMarker);
  if (cwdIndex >= 0) {
    return normalized.slice(cwdIndex + cwdMarker.length);
  }
  return normalized.replace(/^\/+/, "");
}

function parseNullableInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDiagnosticsFromFailure(
  failure: RepairFailedOutput,
): ParsedRepairDiagnostic[] {
  const diagnostics: ParsedRepairDiagnostic[] = [];
  const lines = failure.output.split("\n");
  for (const rawLine of lines) {
    const line = BRACKET_PREFIX_RE.test(rawLine)
      ? rawLine.replace(BRACKET_PREFIX_RE, "").trim()
      : rawLine.trim();
    if (!line || line.length < 3) continue;
    if (STACK_LINE_PREFIX_RE.test(line) || NOISE_LINE_RE.test(line)) continue;

    const tsMatch = line.match(TS_DIAG_RE);
    if (tsMatch?.groups) {
      const file = normalizeDiagnosticFile(tsMatch.groups.file);
      const message = tsMatch.groups.message?.trim();
      if (!file || !message) continue;
      diagnostics.push({
        file,
        line: parseNullableInt(tsMatch.groups.line),
        column: parseNullableInt(tsMatch.groups.column),
        message,
        source: failure.check,
      });
      continue;
    }

    const fileLineMatch = line.match(FILE_LINE_RE);
    if (fileLineMatch?.groups) {
      const file = normalizeDiagnosticFile(fileLineMatch.groups.file);
      const message = fileLineMatch.groups.message?.trim();
      if (!file || !message || /^(error|warning)$/i.test(message)) continue;
      diagnostics.push({
        file,
        line: parseNullableInt(fileLineMatch.groups.line),
        column: parseNullableInt(fileLineMatch.groups.column),
        message,
        source: failure.check,
      });
      continue;
    }
  }
  return diagnostics;
}

export function parseFilesFromErrorLines(lines: string[]): string[] {
  const files = new Set<string>();
  for (const line of lines) {
    const fileMatch = line.match(/]\s*([^\s:]+\.\w{2,4}):/);
    const groupedMatch = line.match(/^File:\s+([^\s]+)\s+\(/);
    if (fileMatch?.[1]) files.add(fileMatch[1]);
    if (groupedMatch?.[1]) files.add(groupedMatch[1]);
  }
  return [...files];
}

export function uniqueContextLines(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}
