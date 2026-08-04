import { buildLintRepairContextLines } from "../lint-output";
import {
  parseDiagnosticsFromFailure,
  toPosixPath,
  uniqueContextLines,
  type RepairFailedOutput,
} from "./diagnostics-parser";
import { buildImportGraph } from "./import-graph";
import type { RepairErrorManifest, RepairErrorManifestDiagnostic } from "./types";

function sortManifestByDependencyPriority(manifest: RepairErrorManifest): RepairErrorManifest {
  return [...manifest].sort((a, b) => {
    if (b.importedByCount !== a.importedByCount) {
      return b.importedByCount - a.importedByCount;
    }
    if (b.dependsOn.length !== a.dependsOn.length) {
      return b.dependsOn.length - a.dependsOn.length;
    }
    return a.file.localeCompare(b.file);
  });
}

export function buildRepairErrorManifest(params: {
  failedOutputs: RepairFailedOutput[];
  syntaxErrors: Array<{ file: string; line: number; column: number; message: string }>;
  projectContent?: string;
}): RepairErrorManifest {
  const diagnosticsByFile = new Map<string, RepairErrorManifestDiagnostic[]>();
  const graph = params.projectContent
    ? buildImportGraph(params.projectContent)
    : { dependsOn: new Map<string, Set<string>>(), importedBy: new Map<string, Set<string>>() };
  const { dependsOn, importedBy } = graph;

  const pushDiagnostic = (file: string, diagnostic: RepairErrorManifestDiagnostic) => {
    const normalizedFile = toPosixPath(file);
    if (!normalizedFile) return;
    if (!diagnosticsByFile.has(normalizedFile)) {
      diagnosticsByFile.set(normalizedFile, []);
    }
    diagnosticsByFile.get(normalizedFile)!.push(diagnostic);
  };

  for (const failure of params.failedOutputs) {
    const diagnostics = parseDiagnosticsFromFailure(failure);
    for (const diagnostic of diagnostics) {
      pushDiagnostic(diagnostic.file, {
        source: diagnostic.source,
        line: diagnostic.line,
        column: diagnostic.column,
        message: diagnostic.message,
      });
    }
  }

  for (const syntaxError of params.syntaxErrors) {
    if (!syntaxError.file || syntaxError.file === "__pipeline__") continue;
    pushDiagnostic(syntaxError.file, {
      source: "syntax",
      line: Number.isFinite(syntaxError.line) ? syntaxError.line : null,
      column: Number.isFinite(syntaxError.column) ? syntaxError.column : null,
      message: syntaxError.message,
    });
  }

  const entries: RepairErrorManifest = [];
  for (const [file, diagnostics] of diagnosticsByFile.entries()) {
    const uniqueDiagnostics = uniqueContextLines(
      diagnostics.map((diag) => {
        const location =
          diag.line !== null && diag.column !== null
            ? `${diag.line}:${diag.column}`
            : diag.line !== null
              ? `${diag.line}`
              : "n/a";
        return `${diag.source}|${location}|${diag.message}`;
      }),
      32,
    ).map((serialized) => {
      const [source = "unknown", location = "n/a", ...rest] = serialized.split("|");
      const [lineRaw, columnRaw] = location.split(":");
      const line = lineRaw && lineRaw !== "n/a" ? Number.parseInt(lineRaw, 10) : null;
      const column = columnRaw ? Number.parseInt(columnRaw, 10) : null;
      return {
        source,
        line: Number.isFinite(line as number) ? (line as number) : null,
        column: Number.isFinite(column as number) ? (column as number) : null,
        message: rest.join("|"),
      } satisfies RepairErrorManifestDiagnostic;
    });

    entries.push({
      file,
      importedByCount: importedBy.get(file)?.size ?? 0,
      dependsOn: [...(dependsOn.get(file) ?? new Set<string>())].sort(),
      diagnostics: uniqueDiagnostics,
    });
  }

  return sortManifestByDependencyPriority(entries);
}

function buildErrorManifestContextLines(manifest: RepairErrorManifest): string[] {
  const lines: string[] = [];
  for (const entry of manifest) {
    const dependencyLabel =
      entry.dependsOn.length > 0
        ? `${entry.dependsOn.length} dependencies`
        : "no local dependencies";
    lines.push(
      `File: ${entry.file} (imported by ${entry.importedByCount} files, ${dependencyLabel})`,
    );
    const diagnostics = entry.diagnostics.slice(0, 8);
    for (const diagnostic of diagnostics) {
      const location =
        diagnostic.line !== null && diagnostic.column !== null
          ? `line ${diagnostic.line}, col ${diagnostic.column}`
          : diagnostic.line !== null
            ? `line ${diagnostic.line}`
            : "line ?";
      lines.push(`  - [${diagnostic.source}] ${location}: ${diagnostic.message}`);
    }
    if (entry.diagnostics.length > diagnostics.length) {
      lines.push(
        `  - ... ${entry.diagnostics.length - diagnostics.length} additional diagnostics omitted.`,
      );
    }
  }
  return lines;
}

export function buildRepairErrorContextLines(failedOutputs: RepairFailedOutput[]): string[] {
  const lintContext = failedOutputs.flatMap((failure) =>
    failure.check === "lint" ? buildLintRepairContextLines(failure.output) : [],
  );
  const grouped = buildGroupedRepairErrorContext(failedOutputs);
  return uniqueContextLines([...grouped.contextLines, ...lintContext], 80);
}

export function buildGroupedRepairErrorContext(
  failedOutputs: RepairFailedOutput[],
  options?: {
    syntaxErrors?: Array<{ file: string; line: number; column: number; message: string }>;
    projectContent?: string;
  },
): {
  errorManifest: RepairErrorManifest;
  contextLines: string[];
} {
  const syntaxErrors = options?.syntaxErrors ?? [];
  const errorManifest = buildRepairErrorManifest({
    failedOutputs,
    syntaxErrors,
    projectContent: options?.projectContent,
  });
  const contextLines = buildErrorManifestContextLines(errorManifest);
  return { errorManifest, contextLines };
}
