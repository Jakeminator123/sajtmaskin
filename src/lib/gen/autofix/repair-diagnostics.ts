/**
 * Unified diagnostic format for the shared repair helper.
 *
 * Normalizes esbuild syntax errors, preview runtime errors, and quality-gate
 * (tsc / next build) failures into the same string[] shape that
 * `runLlmFixer(content, errors)` already accepts.
 */

export type DiagnosticSource = "syntax" | "preview" | "quality-gate";

export interface RepairDiagnostic {
  source: DiagnosticSource;
  file?: string;
  line?: number;
  column?: number;
  message: string;
}

export function formatDiagnosticsForFixer(diagnostics: RepairDiagnostic[]): string[] {
  return diagnostics.map((d) => {
    const loc = d.file
      ? d.line
        ? `${d.file}:${d.line}${d.column ? `:${d.column}` : ""}`
        : d.file
      : "";
    const prefix = loc ? `${loc} ` : "";
    return `[${d.source}] ${prefix}${d.message}`;
  });
}

export interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
}

export function syntaxErrorsToDiagnostics(errors: ValidationError[]): RepairDiagnostic[] {
  return errors.map((e) => ({
    source: "syntax" as const,
    file: e.file,
    line: e.line,
    column: e.column,
    message: e.message,
  }));
}

export function previewErrorToDiagnostics(
  errorMessage: string,
  stack?: string | null,
): RepairDiagnostic[] {
  const diags: RepairDiagnostic[] = [
    { source: "preview", message: errorMessage },
  ];
  const fileLineMatch = stack?.match(/at\s+\w+\s+\(([^:]+):(\d+):(\d+)\)/);
  if (fileLineMatch) {
    diags[0].file = fileLineMatch[1];
    diags[0].line = parseInt(fileLineMatch[2], 10);
    diags[0].column = parseInt(fileLineMatch[3], 10);
  }
  return diags;
}

export function qualityGateOutputToDiagnostics(
  checkName: string,
  output: string,
): RepairDiagnostic[] {
  const lines = output.split("\n").filter((l) => l.trim());
  const diags: RepairDiagnostic[] = [];

  const TS_ERROR_RE = /^(.+?)\((\d+),(\d+)\):\s*error\s+TS\d+:\s*(.+)$/;
  const NEXT_ERROR_RE = /^(?:Error|Warning):\s*(.+)$/;

  for (const line of lines.slice(0, 30)) {
    const tsMatch = line.match(TS_ERROR_RE);
    if (tsMatch) {
      diags.push({
        source: "quality-gate",
        file: tsMatch[1],
        line: parseInt(tsMatch[2], 10),
        column: parseInt(tsMatch[3], 10),
        message: `[${checkName}] ${tsMatch[4]}`,
      });
      continue;
    }
    const nextMatch = line.match(NEXT_ERROR_RE);
    if (nextMatch) {
      diags.push({
        source: "quality-gate",
        message: `[${checkName}] ${nextMatch[1]}`,
      });
    }
  }

  if (diags.length === 0 && output.trim()) {
    diags.push({
      source: "quality-gate",
      message: `[${checkName}] ${output.trim().slice(0, 500)}`,
    });
  }

  return diags;
}
