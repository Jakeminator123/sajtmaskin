export type ParsedLintIssue = {
  file: string;
  line: number | null;
  column: number | null;
  severity: "error" | "warning";
  ruleId: string | null;
  message: string;
};

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;
const ESLINT_ISSUE_LINE_RE =
  /^(?<line>\d+):(?<column>\d+)\s+(?<severity>error|warning)\s+(?<message>.+?)(?:\s{2,}(?<ruleId>[@/\w.-]+))?$/;

function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_RE, "");
}

export function parseLintOutput(output: string): ParsedLintIssue[] {
  const normalized = stripAnsi(String(output || ""));
  const issues: ParsedLintIssue[] = [];
  let currentFile: string | null = null;

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.trim()) continue;

    if (!line.includes(":") && !/\s(error|warning)\s/.test(line)) {
      currentFile = line;
      continue;
    }

    const match = line.match(ESLINT_ISSUE_LINE_RE);
    if (!match?.groups) continue;

    const file = currentFile?.trim() || "";
    const message = match.groups.message?.trim();
    const severity = match.groups.severity === "warning" ? "warning" : "error";
    const ruleId = match.groups.ruleId?.trim() || null;
    const parsedLine = Number.parseInt(match.groups.line, 10);
    const parsedColumn = Number.parseInt(match.groups.column, 10);

    if (!file || !message) continue;

    issues.push({
      file,
      line: Number.isFinite(parsedLine) ? parsedLine : null,
      column: Number.isFinite(parsedColumn) ? parsedColumn : null,
      severity,
      ruleId,
      message,
    });
  }

  return issues;
}

export function buildLintRepairContextLines(output: string): string[] {
  const issues = parseLintOutput(output);
  return issues.slice(0, 40).map((issue) => {
    const location =
      issue.line && issue.column ? `${issue.file}:${issue.line}:${issue.column}` : issue.file;
    const ruleSuffix = issue.ruleId ? ` [${issue.ruleId}]` : "";
    return `[lint] ${location} ${issue.severity}: ${issue.message}${ruleSuffix}`;
  });
}
