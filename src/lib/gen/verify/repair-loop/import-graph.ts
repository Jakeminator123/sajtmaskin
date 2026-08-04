import path from "node:path";
import { parseCodeProject } from "@/lib/gen/parser";
import { toPosixPath } from "./diagnostics-parser";

export function buildImportGraph(content: string): {
  dependsOn: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>;
} {
  const project = parseCodeProject(content);
  const byPath = new Map(project.files.map((file) => [toPosixPath(file.path), file.content]));
  const knownFiles = new Set(byPath.keys());
  const dependsOn = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  const importRe = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

  for (const [filePath, fileContent] of byPath.entries()) {
    const dependencies = new Set<string>();
    for (const match of fileContent.matchAll(importRe)) {
      const importPath = (match[1] || match[2] || "").trim();
      if (!importPath) continue;
      const resolved = resolveImportPath(filePath, importPath, knownFiles);
      if (!resolved) continue;
      const normalizedResolved = toPosixPath(resolved);
      dependencies.add(normalizedResolved);
      if (!importedBy.has(normalizedResolved)) {
        importedBy.set(normalizedResolved, new Set());
      }
      importedBy.get(normalizedResolved)!.add(filePath);
    }
    dependsOn.set(filePath, dependencies);
  }

  return { dependsOn, importedBy };
}

function resolveImportPath(
  importerPath: string,
  importPath: string,
  knownFiles: Set<string>,
): string | null {
  if (importPath.startsWith("@/")) {
    const aliasResolved = `src/${importPath.slice(2)}`;
    if (knownFiles.has(aliasResolved)) return aliasResolved;
    const aliasExtCandidates = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".json",
      ".css",
      "/index.ts",
      "/index.tsx",
      "/index.js",
      "/index.jsx",
    ];
    for (const ext of aliasExtCandidates) {
      const candidate = `${aliasResolved}${ext}`;
      if (knownFiles.has(candidate)) return candidate;
    }
  }
  if (!importPath.startsWith(".")) return null;

  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), importPath));
  if (knownFiles.has(base)) return base;

  const extCandidates = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".css",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
  ];
  for (const ext of extCandidates) {
    const candidate = `${base}${ext}`;
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}

export function collectImportDependencies(
  selectedFiles: string[],
  fileContents: Map<string, string>,
  knownFiles: Set<string>,
): string[] {
  const queue = [...selectedFiles];
  const seen = new Set(selectedFiles);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const content = fileContents.get(current);
    if (!content) continue;
    const importMatches = content.matchAll(
      /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    );
    for (const match of importMatches) {
      const importPath = (match[1] || match[2] || "").trim();
      if (!importPath) continue;
      const resolved = resolveImportPath(current, importPath, knownFiles);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return [...seen];
}
