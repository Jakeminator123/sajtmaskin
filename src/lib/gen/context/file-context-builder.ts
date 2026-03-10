import type { CodeFile } from "../parser";

export interface FileContextOptions {
  files: CodeFile[];
  maxChars?: number;
}

export interface FileContext {
  summary: string;
  fileList: string[];
  totalFiles: number;
  totalLines: number;
}

const EXPORT_RE =
  /export\s+(?:default\s+)?(?:function|const|class|let|var|enum|interface|type)\s+(\w+)/g;
const IMPORT_FROM_RE = /from\s+["']([^"']+)["']/g;

function extractExports(content: string): string[] {
  const names: string[] = [];
  for (const m of content.matchAll(EXPORT_RE)) {
    names.push(m[1]);
  }
  return [...new Set(names)];
}

function extractImports(content: string): string[] {
  const packages: string[] = [];
  for (const m of content.matchAll(IMPORT_FROM_RE)) {
    const from = m[1];
    if (from.startsWith(".") || from.startsWith("@/")) continue;
    const pkg = from.startsWith("@")
      ? from.split("/").slice(0, 2).join("/")
      : from.split("/")[0];
    packages.push(pkg);
  }
  return [...new Set(packages)];
}

function countLines(content: string): number {
  return content.split("\n").length;
}

export function buildFileContext(options: FileContextOptions): FileContext {
  const { files, maxChars = 6000 } = options;

  const fileList = files.map((f) => f.path);
  let totalLines = 0;

  const rows: Array<{
    path: string;
    lines: number;
    exports: string[];
    imports: string[];
  }> = [];

  for (const file of files) {
    const lines = countLines(file.content);
    totalLines += lines;
    rows.push({
      path: file.path,
      lines,
      exports: extractExports(file.content),
      imports: extractImports(file.content),
    });
  }

  const preamble = [
    "## Current Project Files",
    "",
    "Only return files you need to CREATE or MODIFY. Files not included in your response will be kept as-is.",
    "",
  ];

  const fullHeader = [
    ...preamble,
    "| File | Lines | Exports | Key Imports |",
    "|------|-------|---------|-------------|",
  ];
  const fullRows = rows.map((r) => {
    const exports = r.exports.join(", ") || "-";
    const imports = r.imports.join(", ") || "-";
    return `| ${r.path} | ${r.lines} | ${exports} | ${imports} |`;
  });

  let summary = [...fullHeader, ...fullRows].join("\n");

  if (summary.length > maxChars) {
    const compactHeader = [
      ...preamble,
      "| File | Lines | Exports |",
      "|------|-------|---------|",
    ];
    const compactRows = rows.map((r) => {
      const exports = r.exports.join(", ") || "-";
      return `| ${r.path} | ${r.lines} | ${exports} |`;
    });
    summary = [...compactHeader, ...compactRows].join("\n");
  }

  if (summary.length > maxChars) {
    summary = [
      ...preamble,
      ...rows.map((r) => `- ${r.path} (${r.lines} lines)`),
    ].join("\n");
  }

  return { summary, fileList, totalFiles: files.length, totalLines };
}
