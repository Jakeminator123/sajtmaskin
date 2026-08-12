import type { CodeFile } from "../parser";
import {
  buildFileStructuralInventory,
  renderStructuralInventoryForPrompt,
} from "./structural-elements";

export interface FileContextOptions {
  files: CodeFile[];
  maxChars?: number;
  includeContents?: boolean;
  maxFilesWithContent?: number;
  /**
   * Files that MUST be included with full content when `includeContents` is true,
   * regardless of `maxFilesWithContent` cap or default priority ranking. Paths
   * that don't exist in `files` are ignored silently. Used by follow-up flows
   * to guarantee design-critical files (e.g. `app/globals.css`, `app/layout.tsx`)
   * survive light-context filtering when the prompt has design intent.
   */
  pinnedFiles?: string[];
  /**
   * When true, appends a structural inventory of notable UI elements
   * (video, canvas, 3D, forms, media components, section landmarks)
   * so the LLM knows what exists even in files it cannot see in full.
   */
  includeStructuralInventory?: boolean;
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

const BINARY_PATH_RE =
  /(?:^|\/)(?:favicon\.ico|.+\.(?:ico|png|jpe?g|gif|webp|bmp|woff2?|ttf|eot|mp4|webm|pdf|zip|gz))$/i;

/**
 * Files that must never consume a Current File Contents slot (binary /
 * base64 blobs / favicon). They may still appear in the file table summary.
 */
export function isNonTextContentFile(file: Pick<CodeFile, "path" | "content" | "language">): boolean {
  if (file.language === "binary") return true;
  const content = file.content ?? "";
  if (content.startsWith("base64:")) return true;
  if (BINARY_PATH_RE.test(file.path.replace(/\\/g, "/"))) return true;
  return false;
}

function scoreFilePriority(path: string): number {
  // Imported repos (v0-templates / ZIP imports) often keep the app under
  // `src/` — score those files as if the prefix weren't there so the home
  // page / layout / globals of a `src/app/` repo still lead the context.
  const normalized = path.startsWith("src/") ? path.slice("src/".length) : path;
  if (normalized === "app/page.tsx" || normalized === "pages/index.tsx") return 0;
  if (normalized === "app/layout.tsx") return 1;
  if (normalized === "app/globals.css") return 2;
  if (normalized.startsWith("app/") || normalized.startsWith("pages/")) return 3;
  if (normalized.startsWith("components/")) return 4;
  return 5;
}

function compareByPriority(a: CodeFile, b: CodeFile): number {
  const priorityDelta = scoreFilePriority(a.path) - scoreFilePriority(b.path);
  if (priorityDelta !== 0) return priorityDelta;
  return a.path.localeCompare(b.path);
}

function buildContentSections(files: CodeFile[], maxChars: number): string {
  const sections: string[] = ["## Current File Contents", ""];
  let current = sections.join("\n");

  for (const file of files) {
    if (isNonTextContentFile(file)) continue;

    const block = [
      `### ${file.path}`,
      "",
      "```",
      file.content,
      "```",
      "",
    ].join("\n");

    if ((current + block).length > maxChars) {
      break;
    }

    sections.push(`### ${file.path}`, "", "```", file.content, "```", "");
    current = sections.join("\n");
  }

  return current.trim();
}

export function buildFileContext(options: FileContextOptions): FileContext {
  const {
    files,
    maxChars = 60_000,
    includeContents = false,
    maxFilesWithContent = 6,
    pinnedFiles = [],
    includeStructuralInventory = false,
  } = options;

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

  if (includeContents && summary.length < maxChars) {
    const filesByPath = new Map(files.map((f) => [f.path, f]));
    const pinnedSelection: CodeFile[] = [];
    const seenPaths = new Set<string>();
    for (const path of pinnedFiles) {
      if (seenPaths.has(path)) continue;
      const match = filesByPath.get(path);
      if (!match || isNonTextContentFile(match)) continue;
      pinnedSelection.push(match);
      seenPaths.add(path);
    }
    const remaining = [...files]
      .filter((f) => !seenPaths.has(f.path) && !isNonTextContentFile(f))
      .sort(compareByPriority);
    // Fill up to maxFilesWithContent text slots; pinned text files always fit.
    const textSlotBudget = Math.max(0, maxFilesWithContent);
    const prioritizedFiles = [
      ...pinnedSelection,
      ...remaining.slice(0, Math.max(0, textSlotBudget - pinnedSelection.length)),
    ];
    const contentBudget = maxChars - summary.length - 2;
    if (contentBudget > 300 && prioritizedFiles.length > 0) {
      const contentSections = buildContentSections(prioritizedFiles, contentBudget);
      if (contentSections) {
        summary = `${summary}\n\n${contentSections}`;
      }
    }
  }

  if (includeStructuralInventory && summary.length < maxChars) {
    const inventories = buildFileStructuralInventory(files);
    if (inventories.length > 0) {
      const inventoryText = renderStructuralInventoryForPrompt(inventories);
      if (inventoryText && summary.length + inventoryText.length + 4 < maxChars) {
        summary = `${summary}\n\n${inventoryText}`;
      }
    }
  }

  return { summary, fileList, totalFiles: files.length, totalLines };
}
