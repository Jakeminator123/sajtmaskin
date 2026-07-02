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

export function normalizeDiagnosticFile(raw: string): string | null {
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

export function parseNullableInt(value: string | undefined): number | null {
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

const TSC_PRIMARY_LINE_RE =
  /^(?<file>(?:[A-Za-z]:)?[^:\n\r()]+\.(?:[tj]sx?|jsx?|mjs|cjs))\((?<line>\d+),(?<column>\d+)\):\s*(?<rest>(?:error|warning)\s+TS\d+:\s*.+)$/i;

/**
 * Format the ORIGINATING gate failures (tsc/build/lint output) as structured
 * `file:line:col message` lines — the shape `buildFixerUserPrompt` promotes to
 * "Primary blocking diagnostics". Fas 3 same-signal targeting: when the repair
 * was entered for a tsc failure, the fixer must optimize against the tsc
 * diagnostics (INCLUDING the `TSxxxx` code, which the generic parser strips),
 * not only against esbuild syntax output. Raw tsc lines
 * (`file(l,c): error TS2322: msg`) are rewritten to `file:l:c error TS2322: msg`;
 * other checks fall back to the parsed diagnostics tagged with their source.
 */
export function buildStructuredOriginDiagnostics(
  failedOutputs: RepairFailedOutput[],
): string[] {
  const lines: string[] = [];
  for (const failure of failedOutputs) {
    let structuredTscLines = 0;
    for (const rawLine of failure.output.split("\n")) {
      const line = rawLine.replace(BRACKET_PREFIX_RE, "").trim();
      const match = line.match(TSC_PRIMARY_LINE_RE);
      if (!match?.groups) continue;
      const file = normalizeDiagnosticFile(match.groups.file);
      if (!file) continue;
      lines.push(`${file}:${match.groups.line}:${match.groups.column} ${match.groups.rest}`);
      structuredTscLines++;
    }
    if (structuredTscLines > 0) continue;
    for (const diagnostic of parseDiagnosticsFromFailure(failure)) {
      if (diagnostic.line === null) continue;
      const location =
        diagnostic.column !== null
          ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
          : `${diagnostic.file}:${diagnostic.line}`;
      lines.push(`${location} [${diagnostic.source}] ${diagnostic.message}`);
    }
  }
  return lines;
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
