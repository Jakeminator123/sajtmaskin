import type { CodeFile, PreparedModule } from "./types";
import { PAGE_CANDIDATES, SCRIPT_FILE_RE, NON_RENDERABLE_FILE_RE, isPreviewBuiltinImportSource } from "./constants";
import { normalizeFilePath, normalizeRoutePath, routeFromPageFile, resolveLocalImportPath } from "./utils";
import { stripNextImports, parseImports } from "./import-parser";

export function registerFileAlias(map: Map<string, CodeFile>, file: CodeFile, alias: string): void {
  const normalizedAlias = normalizeFilePath(alias);
  if (!normalizedAlias) return;
  if (!map.has(normalizedAlias)) {
    map.set(normalizedAlias, file);
  }
}

export function registerModuleAlias(
  map: Map<string, PreparedModule>,
  module: PreparedModule,
  alias: string,
): void {
  const normalizedAlias = normalizeFilePath(alias);
  if (!normalizedAlias) return;
  if (!map.has(normalizedAlias)) {
    map.set(normalizedAlias, module);
  }
}

export function buildCodeFileMap(files: CodeFile[]): Map<string, CodeFile> {
  const fileMap = new Map<string, CodeFile>();
  for (const file of files) {
    const normalized = normalizeFilePath(file.path);
    registerFileAlias(fileMap, file, normalized);
    registerFileAlias(fileMap, file, `src/${normalized}`);
    if (normalized.startsWith("src/")) {
      registerFileAlias(fileMap, file, normalized.slice(4));
    }
  }
  return fileMap;
}

export function buildPreparedModuleMap(modules: PreparedModule[]): Map<string, PreparedModule> {
  const moduleMap = new Map<string, PreparedModule>();
  for (const preparedModule of modules) {
    const normalized = normalizeFilePath(preparedModule.file.path);
    registerModuleAlias(moduleMap, preparedModule, normalized);
    registerModuleAlias(moduleMap, preparedModule, `src/${normalized}`);
    if (normalized.startsWith("src/")) {
      registerModuleAlias(moduleMap, preparedModule, normalized.slice(4));
    }
  }
  return moduleMap;
}

export function findPageFile(files: CodeFile[], routePath?: string | null): CodeFile | null {
  const requestedRoute = normalizeRoutePath(routePath);
  const exactMatch = files.find((file) => routeFromPageFile(file.path) === requestedRoute);
  if (exactMatch) return exactMatch;

  for (const candidate of PAGE_CANDIDATES) {
    const match = files.find((f) => f.path === candidate || f.path.endsWith(`/${candidate}`));
    if (match) return match;
  }
  const tsx = files.find((f) => /\.(tsx|jsx)$/.test(f.path));
  return tsx ?? null;
}

export function findCssFiles(files: CodeFile[]): CodeFile[] {
  return files.filter((f) => f.path.endsWith(".css"));
}

export function findComponentFiles(files: CodeFile[], excluding: string): CodeFile[] {
  const normalizedPagePath = normalizeFilePath(excluding);
  const scriptFiles = files.filter(
    (f) => SCRIPT_FILE_RE.test(f.path) && !NON_RENDERABLE_FILE_RE.test(f.path),
  );
  if (scriptFiles.length === 0) return [];

  const fileMap = buildCodeFileMap(scriptFiles);
  const queue: string[] = [normalizedPagePath];
  const visited = new Set<string>([normalizedPagePath]);
  const reachableModules = new Set<string>();

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) break;

    const currentFile = fileMap.get(currentPath);
    if (!currentFile) continue;

    const withoutNextImports = stripNextImports(currentFile.content);
    const imports = parseImports(withoutNextImports);
    for (const imp of imports) {
      if (isPreviewBuiltinImportSource(imp.source)) continue;
      const targetPath = resolveLocalImportPath(fileMap, currentFile.path, imp.source);
      if (!targetPath) continue;

      const normalizedTargetPath = normalizeFilePath(targetPath);
      if (normalizedTargetPath === normalizedPagePath) continue;

      reachableModules.add(normalizedTargetPath);
      if (!visited.has(normalizedTargetPath)) {
        visited.add(normalizedTargetPath);
        queue.push(normalizedTargetPath);
      }
    }
  }

  return scriptFiles.filter((file) => {
    const normalized = normalizeFilePath(file.path);
    return normalized !== normalizedPagePath && reachableModules.has(normalized);
  });
}

/**
 * Order component files so dependencies execute before dependents.
 * Preview bundles all modules into one script; if `site-config.ts` is emitted
 * after `site-footer.tsx` but the footer references `siteConfig` at module
 * top-level, the runtime throws ReferenceError. Topological order fixes that.
 */
export function sortComponentFilesForPreview(pageFile: CodeFile, componentFiles: CodeFile[]): CodeFile[] {
  if (componentFiles.length <= 1) return componentFiles;

  const allFiles = [pageFile, ...componentFiles];
  const fileMap = buildCodeFileMap(allFiles);
  const pageNorm = normalizeFilePath(pageFile.path);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const postOrder: string[] = [];

  function visit(normalizedPath: string): void {
    if (done.has(normalizedPath)) return;
    if (visiting.has(normalizedPath)) return;
    visiting.add(normalizedPath);

    const currentFile = fileMap.get(normalizedPath);
    if (currentFile) {
      const withoutNextImports = stripNextImports(currentFile.content);
      const imports = parseImports(withoutNextImports);
      for (const imp of imports) {
        if (isPreviewBuiltinImportSource(imp.source)) continue;
        const targetPath = resolveLocalImportPath(fileMap, currentFile.path, imp.source);
        if (!targetPath) continue;
        const targetNorm = normalizeFilePath(targetPath);
        if (targetNorm === pageNorm) continue;
        if (fileMap.has(targetNorm)) {
          visit(targetNorm);
        }
      }
    }

    visiting.delete(normalizedPath);
    done.add(normalizedPath);
    postOrder.push(normalizedPath);
  }

  visit(pageNorm);

  const byPath = new Map(componentFiles.map((f) => [normalizeFilePath(f.path), f]));
  const ordered: CodeFile[] = [];
  for (const p of postOrder) {
    if (p === pageNorm) continue;
    const cf = byPath.get(p);
    if (cf) ordered.push(cf);
  }

  const orderedPaths = new Set(ordered.map((f) => normalizeFilePath(f.path)));
  for (const f of componentFiles) {
    if (!orderedPaths.has(normalizeFilePath(f.path))) {
      ordered.push(f);
    }
  }

  return ordered;
}
