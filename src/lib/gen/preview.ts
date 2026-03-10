import path from "node:path";
import ts from "typescript";
import type { CodeFile } from "./parser";
import { isRuntimeProvidedImport } from "./runtime-imports";

const PAGE_CANDATES = [
  "app/page.tsx",
  "src/app/page.tsx",
  "pages/index.tsx",
  "page.tsx",
  "Page.tsx",
  "app/page.jsx",
  "pages/index.jsx",
];

const SCRIPT_FILE_RE = /\.(tsx|jsx|ts|js)$/;
const NON_RENDERABLE_FILE_RE = /(^|\/)(route|layout|loading|error|not-found|template|middleware|proxy)\.(tsx|jsx|ts|js)$/;
const LOCAL_IMPORT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const PREVIEW_TRANSPILE_ERROR_LIMIT = 8;

type ImportBinding = {
  imported: string;
  local: string;
};

type ParsedImport = {
  source: string;
  defaultImport: string | null;
  namespaceImport: string | null;
  namedImports: ImportBinding[];
};

type PreparedModule = {
  file: CodeFile;
  transformedCode: string;
  imports: ParsedImport[];
  defaultExportName: string | null;
  transpileErrors: string[];
};

type PreviewValidationIssue = {
  file: string;
  message: string;
  severity: "error" | "warning";
};

function isPreviewBuiltinImportSource(source: string): boolean {
  return (
    source === "react" ||
    source === "next/image" ||
    source === "next/link" ||
    source === "next/navigation" ||
    source === "lucide-react" ||
    isRuntimeProvidedImport(source)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function normalizeRoutePath(routePath?: string | null): string {
  const raw = (routePath ?? "").trim();
  if (!raw) return "/";

  let pathname = raw;
  try {
    pathname = new URL(raw, "https://preview.local").pathname;
  } catch {
    pathname = raw.split(/[?#]/, 1)[0] || raw;
  }

  pathname = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return pathname || "/";
}

function routeFromPageFile(filePath: string): string | null {
  let normalized = normalizeFilePath(filePath);
  if (normalized.startsWith("src/")) normalized = normalized.slice(4);

  const appMatch = normalized.match(/^app\/(.+)\/page\.(tsx|jsx|ts|js)$/);
  if (appMatch) {
    const parts = appMatch[1]
      .split("/")
      .filter((segment) => segment !== "page")
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
    return parts.length > 0 ? `/${parts.join("/")}` : "/";
  }

  if (/^app\/page\.(tsx|jsx|ts|js)$/.test(normalized)) {
    return "/";
  }

  if (/^pages\/index\.(tsx|jsx|ts|js)$/.test(normalized)) {
    return "/";
  }

  const pagesMatch = normalized.match(/^pages\/(.+)\.(tsx|jsx|ts|js)$/);
  if (pagesMatch) {
    const parts = pagesMatch[1].split("/").filter((segment) => segment !== "index");
    return parts.length > 0 ? `/${parts.join("/")}` : "/";
  }

  return null;
}

function registerFileAlias(map: Map<string, CodeFile>, file: CodeFile, alias: string): void {
  const normalizedAlias = normalizeFilePath(alias);
  if (!normalizedAlias) return;
  if (!map.has(normalizedAlias)) {
    map.set(normalizedAlias, file);
  }
}

function registerModuleAlias(
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

function buildCodeFileMap(files: CodeFile[]): Map<string, CodeFile> {
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

function buildPreparedModuleMap(modules: PreparedModule[]): Map<string, PreparedModule> {
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

function findPageFile(files: CodeFile[], routePath?: string | null): CodeFile | null {
  const requestedRoute = normalizeRoutePath(routePath);
  const exactMatch = files.find((file) => routeFromPageFile(file.path) === requestedRoute);
  if (exactMatch) return exactMatch;

  for (const candidate of PAGE_CANDATES) {
    const match = files.find((f) => f.path === candidate || f.path.endsWith(`/${candidate}`));
    if (match) return match;
  }
  const tsx = files.find((f) => /\.(tsx|jsx)$/.test(f.path));
  return tsx ?? null;
}

function findCssFiles(files: CodeFile[]): CodeFile[] {
  return files.filter((f) => f.path.endsWith(".css"));
}

function findComponentFiles(files: CodeFile[], excluding: string): CodeFile[] {
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

function stripNextImports(code: string): string {
  let result = code;

  result = result.replace(
    /import\s+[A-Za-z_$][\w$]*\s+from\s+['"]next\/image['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+[A-Za-z_$][\w$]*\s+from\s+['"]next\/link['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+\{[^}]*\}\s+from\s+['"]next\/navigation['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+\{[^}]*\}\s+from\s+['"]next\/font[^'"]*['"]\s*;?/g,
    "",
  );

  result = result.replace(/^['"]use client['"]\s*;?\s*$/gm, "");
  result = result.replace(/^['"]use server['"]\s*;?\s*$/gm, "");

  result = result.replace(
    /import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?/g,
    "",
  );

  return result;
}

function resolveDefaultExportName(code: string): string | null {
  const fnMatch = code.match(/export\s+default\s+(?:async\s+)?function\s+(\w+)/);
  if (fnMatch) return fnMatch[1];

  const classMatch = code.match(/export\s+default\s+class\s+(\w+)/);
  if (classMatch) return classMatch[1];

  const varMatch = code.match(/export\s+default\s+(\w+)\s*;?/);
  if (varMatch) return varMatch[1];

  if (code.includes("export default")) return null;
  return null;
}

function parseNamedImports(input: string): ImportBinding[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const withoutType = part.replace(/^type\s+/, "").trim();
      if (!withoutType) return [];
      const aliasMatch = withoutType.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliasMatch) {
        return [{ imported: aliasMatch[1], local: aliasMatch[2] }];
      }
      return [{ imported: withoutType, local: withoutType }];
    });
}

function parseImports(code: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const importRe = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
  for (const match of code.matchAll(importRe)) {
    const clause = match[1]?.trim() ?? "";
    const source = match[2]?.trim() ?? "";
    if (!clause || !source || clause.startsWith("type ")) continue;

    let defaultImport: string | null = null;
    let namespaceImport: string | null = null;
    let namedImports: ImportBinding[] = [];

    const normalizedClause = clause.replace(/\s+/g, " ").trim();
    const braceIndex = normalizedClause.indexOf("{");
    const namespaceIndex = normalizedClause.indexOf("* as ");

    if (braceIndex >= 0) {
      const before = normalizedClause.slice(0, braceIndex).replace(/,$/, "").trim();
      if (before) defaultImport = before;
      const namedPart = normalizedClause.slice(braceIndex + 1, normalizedClause.lastIndexOf("}"));
      namedImports = parseNamedImports(namedPart);
    } else if (namespaceIndex >= 0) {
      const before = normalizedClause.slice(0, namespaceIndex).replace(/,$/, "").trim();
      if (before) defaultImport = before;
      namespaceImport = normalizedClause.slice(namespaceIndex + 5).trim();
    } else {
      defaultImport = normalizedClause;
    }

    imports.push({
      source,
      defaultImport: defaultImport && !defaultImport.startsWith("type ") ? defaultImport : null,
      namespaceImport,
      namedImports,
    });
  }
  return imports;
}

function stripImportStatements(code: string): string {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];
  let insideImport = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!insideImport && trimmed.startsWith("import ")) {
      insideImport = true;
      const completesOnSameLine =
        /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed) ||
        /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed);
      if (completesOnSameLine) {
        insideImport = false;
      }
      continue;
    }

    if (insideImport) {
      if (/from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
        insideImport = false;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

function rewriteModuleExports(code: string, fallbackName: string): {
  code: string;
  defaultExportName: string | null;
} {
  let result = code;
  let defaultExportName = resolveDefaultExportName(result);

  if (!defaultExportName && /export\s+default\s+(?:async\s+)?function\s*\(/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(
      /export\s+default\s+(async\s+)?function\s*\(/,
      (_match, asyncKw: string | undefined) => `${asyncKw ?? ""}function ${fallbackName}(`,
    );
  }

  if (!defaultExportName && /export\s+default\s+class\s*\{/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(/export\s+default\s+class\s*\{/, `class ${fallbackName} {`);
  }

  if (defaultExportName) {
    result = result.replace(/export\s+default\s+async\s+function\s+([A-Za-z_$][\w$]*)/g, "async function $1");
    result = result.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, "function $1");
    result = result.replace(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/g, "class $1");
    result = result.replace(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g, "$1;");
  } else if (/export\s+default\s+/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(/export\s+default\s+/, `const ${fallbackName} = `);
  }

  result = result.replace(/export\s+async\s+function\s+/g, "async function ");
  result = result.replace(/export\s+function\s+/g, "function ");
  result = result.replace(/export\s+(const|let|var|class)\s+/g, "$1 ");
  result = result.replace(/export\s+(type|interface|enum)\s+/g, "$1 ");
  result = result.replace(/export\s*\{[^}]+\}\s*;?/g, "");

  return { code: result, defaultExportName };
}

function formatTranspileDiagnostic(diag: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diag.messageText, " ");
  if (diag.file && typeof diag.start === "number") {
    const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
    return `L${line + 1}:${character + 1} ${message}`;
  }
  return message;
}

function transpilePreviewModule(code: string, filePath: string): {
  outputText: string;
  errors: string[];
} {
  const result = ts.transpileModule(code, {
    fileName: filePath,
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: "React.createElement",
      jsxFragmentFactory: "React.Fragment",
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      useDefineForClassFields: false,
    },
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics ?? [])
    .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
    .slice(0, PREVIEW_TRANSPILE_ERROR_LIMIT)
    .map(formatTranspileDiagnostic);

  return {
    outputText: result.outputText,
    errors,
  };
}

function normalizeTranspiledModule(
  code: string,
  module: PreparedModule,
  fileMap: Map<string, CodeFile>,
  moduleMap: Map<string, PreparedModule>,
): string {
  let result = code
    .replace(/"use strict";\s*/g, "")
    .replace(/Object\.defineProperty\(exports,\s*"__esModule",\s*\{ value: true \}\);\s*/g, "")
    .replace(/exports\.[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$][\w$]*;\s*/g, "");

  const requireRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\((['"])([^'"]+)\2\);\s*/g;
  for (const match of result.matchAll(requireRe)) {
    const fullMatch = match[0];
    const varName = match[1];
    const source = match[3];
    const memberRe = new RegExp(`${escapeRegExp(varName)}\\.([A-Za-z_$][\\w$]*)`, "g");
    const defaultRe = new RegExp(`${escapeRegExp(varName)}\\.default`, "g");

    if (source === "react") {
      result = result.replace(fullMatch, "");
      result = result.replace(defaultRe, "React");
      result = result.replace(memberRe, "React.$1");
      continue;
    }

    if (
      source === "lucide-react" ||
      source.startsWith("@/components/ui/") ||
      source === "@/lib/utils"
    ) {
      result = result.replace(fullMatch, "");
      result = result.replace(memberRe, "$1");
      const defaultFallback = source === "lucide-react"
        ? "function(){return null}"
        : "undefined";
      result = result.replace(defaultRe, defaultFallback);
      continue;
    }

    const localImportPath = resolveLocalImportPath(fileMap, module.file.path, source);
    if (localImportPath) {
      const targetModule = moduleMap.get(localImportPath);
      result = result.replace(fullMatch, "");
      if (targetModule?.defaultExportName) {
        result = result.replace(defaultRe, targetModule.defaultExportName);
      }
      result = result.replace(memberRe, "$1");
    } else if (source.startsWith("@/") || source.startsWith("./") || source.startsWith("../")) {
      result = result.replace(fullMatch, "");
      result = result.replace(defaultRe, varName);
      result = result.replace(memberRe, "$1");
    }
  }

  result = result.replace(/\bconst\s+(?=[A-Z][A-Za-z_$]*\s*=)/g, "var ");

  return result;
}

function escapeInlineScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function buildPreviewBaseCss(): string {
  return [
    ":root {",
    "  --background: hsl(222 47% 11%);",
    "  --foreground: hsl(210 40% 98%);",
    "  --card: hsl(222 47% 14%);",
    "  --card-foreground: hsl(210 40% 98%);",
    "  --popover: hsl(222 47% 14%);",
    "  --popover-foreground: hsl(210 40% 98%);",
    "  --primary: hsl(217 91% 60%);",
    "  --primary-foreground: hsl(0 0% 100%);",
    "  --secondary: hsl(215 28% 17%);",
    "  --secondary-foreground: hsl(210 40% 98%);",
    "  --muted: hsl(217 33% 17%);",
    "  --muted-foreground: hsl(215 20% 70%);",
    "  --accent: hsl(159 64% 46%);",
    "  --accent-foreground: hsl(222 47% 11%);",
    "  --destructive: hsl(0 72% 51%);",
    "  --destructive-foreground: hsl(0 0% 100%);",
    "  --border: hsl(217 22% 26%);",
    "  --ring: hsl(217 91% 60%);",
    "}",
    "html, body, #root {",
    "  min-height: 100%;",
    "}",
    "html {",
    "  background-color: var(--background);",
    "  color: var(--foreground);",
    "}",
    "body {",
    "  margin: 0;",
    "  background-color: var(--background);",
    "  color: var(--foreground);",
    "}",
    ".bg-background { background-color: var(--background) !important; }",
    ".text-foreground { color: var(--foreground) !important; }",
    ".text-primary { color: var(--primary) !important; }",
    ".bg-card { background-color: var(--card) !important; }",
    ".text-card-foreground { color: var(--card-foreground) !important; }",
    ".bg-popover { background-color: var(--popover) !important; }",
    ".text-popover-foreground { color: var(--popover-foreground) !important; }",
    ".bg-primary { background-color: var(--primary) !important; }",
    ".text-primary-foreground { color: var(--primary-foreground) !important; }",
    ".bg-secondary { background-color: var(--secondary) !important; }",
    ".text-secondary-foreground { color: var(--secondary-foreground) !important; }",
    ".bg-muted { background-color: var(--muted) !important; }",
    ".text-muted-foreground { color: var(--muted-foreground) !important; }",
    ".bg-accent { background-color: var(--accent) !important; }",
    ".text-accent-foreground { color: var(--accent-foreground) !important; }",
    ".bg-destructive { background-color: var(--destructive) !important; }",
    ".text-destructive-foreground { color: var(--destructive-foreground) !important; }",
    ".border, .border-border { border-color: var(--border) !important; }",
    ".border-primary { border-color: var(--primary) !important; }",
    ".ring-ring { --tw-ring-color: var(--ring) !important; }",
    ".bg-muted\\/30 { background-color: color-mix(in oklab, var(--muted) 30%, transparent) !important; }",
    ".bg-muted\\/50 { background-color: color-mix(in oklab, var(--muted) 50%, transparent) !important; }",
    ".bg-primary\\/10 { background-color: color-mix(in oklab, var(--primary) 10%, transparent) !important; }",
    ".bg-primary\\/20 { background-color: color-mix(in oklab, var(--primary) 20%, transparent) !important; }",
    ".bg-primary\\/25 { background-color: color-mix(in oklab, var(--primary) 25%, transparent) !important; }",
    ".bg-accent\\/20 { background-color: color-mix(in oklab, var(--accent) 20%, transparent) !important; }",
    ".border-primary\\/40 { border-color: color-mix(in oklab, var(--primary) 40%, transparent) !important; }",
    ".border-primary\\/50 { border-color: color-mix(in oklab, var(--primary) 50%, transparent) !important; }",
  ].join("\n");
}

function buildThemeAliasLines(): string[] {
  return [
    "--background: var(--color-background);",
    "--foreground: var(--color-foreground);",
    "--card: var(--color-card);",
    "--card-foreground: var(--color-card-foreground);",
    "--popover: var(--color-card);",
    "--popover-foreground: var(--color-card-foreground);",
    "--primary: var(--color-primary);",
    "--primary-foreground: var(--color-primary-foreground);",
    "--secondary: var(--color-secondary);",
    "--secondary-foreground: var(--color-secondary-foreground);",
    "--muted: var(--color-muted);",
    "--muted-foreground: var(--color-muted-foreground);",
    "--accent: var(--color-accent);",
    "--accent-foreground: var(--color-accent-foreground);",
    "--border: var(--color-border);",
    "--ring: var(--color-ring);",
  ];
}

function normalizePreviewCss(input: string): string {
  return input
    .replace(/@import\s+["']tailwindcss["'];?\s*/g, "")
    .replace(/@theme\s+inline\s*\{([\s\S]*?)\}/g, (_match, themeBody: string) => {
      const body = themeBody.trim();
      const aliasLines = buildThemeAliasLines();
      return [":root {", body, ...aliasLines.map((line) => `  ${line}`), "}"].join("\n");
    });
}

function resolveLocalImportPath(fileMap: Map<string, CodeFile>, importerPath: string, source: string): string | null {
  const normalizedSource = source.trim();
  if (!normalizedSource.startsWith("@/") && !normalizedSource.startsWith("./") && !normalizedSource.startsWith("../")) {
    return null;
  }

  const normalizedImporterPath = normalizeFilePath(importerPath);
  const rawPath = normalizedSource.startsWith("@/")
    ? normalizeFilePath(normalizedSource.slice(2))
    : normalizeFilePath(
        path.posix.normalize(path.posix.join(path.posix.dirname(normalizedImporterPath), normalizedSource)),
      );

  const basePaths = normalizedSource.startsWith("@/")
    ? Array.from(new Set([rawPath, normalizeFilePath(`src/${rawPath}`)]))
    : [rawPath];
  const candidates = basePaths.flatMap((basePath) => [
    basePath,
    ...LOCAL_IMPORT_EXTENSIONS.map((ext) => `${basePath}${ext}`),
    ...LOCAL_IMPORT_EXTENSIONS.map((ext) => `${basePath}/index${ext}`),
  ]);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeFilePath(candidate);
    if (fileMap.has(normalizedCandidate)) return normalizedCandidate;
  }

  return null;
}

function prepareModules(pageFile: CodeFile, componentFiles: CodeFile[]): PreparedModule[] {
  const orderedFiles = [...componentFiles, pageFile];
  const prepared = orderedFiles.map((file, index) => {
    const withoutNextImports = stripNextImports(file.content);
    const imports = parseImports(withoutNextImports);
    const withoutImports = stripImportStatements(withoutNextImports);
    const exportRewrite = rewriteModuleExports(withoutImports, `__PreviewModule${index}`);
    const transpiled = transpilePreviewModule(exportRewrite.code, file.path);
    return {
      file,
      imports,
      defaultExportName: exportRewrite.defaultExportName,
      transformedCode: transpiled.outputText,
      transpileErrors: transpiled.errors,
    };
  });

  const fileMap = buildCodeFileMap(prepared.map((module) => module.file));
  const moduleMap = buildPreparedModuleMap(prepared);
  for (const preparedModule of prepared) {
    preparedModule.transformedCode = normalizeTranspiledModule(
      preparedModule.transformedCode,
      preparedModule,
      fileMap,
      moduleMap,
    );
  }

  return prepared;
}

function buildPreviewPrelude(modules: PreparedModule[], routePath: string): string {
  const lines: string[] = [
    "const __previewRoot = document.getElementById('root');",
    "const __previewReportedErrors = new Set();",
    `const __previewPathname = ${JSON.stringify(routePath)};`,
    "function __previewPost(type, payload) {",
    "  try {",
    "    if (window.parent && window.parent !== window) {",
    "      window.parent.postMessage({ source: 'sajtmaskin-preview', type, payload }, '*');",
    "    }",
    "  } catch {",
    "    // ignore cross-window postMessage failures",
    "  }",
    "}",
    "function __previewReportError(error, meta) {",
    "  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? 'Okänt preview-fel');",
    "  const name = error && typeof error === 'object' && 'name' in error ? String(error.name || '') : '';",
    "  const stack = error && typeof error === 'object' && 'stack' in error ? String(error.stack || '') : '';",
    "  const kind = meta && typeof meta === 'object' && 'kind' in meta ? String(meta.kind || '') : 'runtime';",
    "  const dedupeKey = [kind, name, message].join('::');",
    "  if (__previewReportedErrors.has(dedupeKey)) return;",
    "  __previewReportedErrors.add(dedupeKey);",
    "  __previewPost('preview-error', { message, name: name || null, stack: stack || null, kind });",
    "}",
    "function __previewShowError(error, meta) {",
    "  if (!__previewRoot) return;",
    "  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? 'Okänt preview-fel');",
    "  __previewRoot.innerHTML = '<div style=\"padding:2rem;font-family:system-ui;color:#ef4444\"><h2 style=\"margin:0 0 1rem\">Preview-fel</h2><pre style=\"white-space:pre-wrap;font-size:13px;color:#a3a3a3\">' + message + '</pre></div>';",
    "  __previewReportError(error, meta);",
    "}",
    "const Image = (props = {}) => {",
    "  const { src, alt, style, onError, width, height, fill, ...rest } = props;",
    "  const w = width || (fill ? '100%' : 400);",
    "  const h = height || (fill ? '100%' : 300);",
    "  const isLocalPlaceholder = typeof src === 'string' && src.startsWith('/placeholder');",
    "  const isAiAsset = typeof src === 'string' && src.startsWith('/ai/');",
    "  const [failed, setFailed] = React.useState(false);",
    "  const placeholderStyle = {",
    "    width: typeof w === 'number' ? w + 'px' : w,",
    "    height: typeof h === 'number' ? h + 'px' : h,",
    "    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',",
    "    display: 'flex', alignItems: 'center', justifyContent: 'center',",
    "    flexDirection: 'column', gap: '8px', borderRadius: '8px',",
    "    color: '#64748b', fontSize: '14px', textAlign: 'center',",
    "    padding: '16px', overflow: 'hidden',",
    "    ...style,",
    "  };",
    "  if (isAiAsset || (!src && !isLocalPlaceholder)) {",
    "    return React.createElement('div', { ...rest, style: placeholderStyle },",
    "      React.createElement('span', { style: { fontSize: '24px' } }, '\\uD83D\\uDDBC'),",
    "      React.createElement('span', null, alt || 'Image placeholder'),",
    "    );",
    "  }",
    "  if (failed) {",
    "    return React.createElement('div', { ...rest, style: placeholderStyle },",
    "      React.createElement('span', null, alt || 'Image failed to load'),",
    "    );",
    "  }",
    "  const imgStyle = { ...style, width: typeof w === 'number' ? w + 'px' : w, height: typeof h === 'number' ? h + 'px' : h, objectFit: 'cover' };",
    "  return React.createElement('img', { ...rest, src, alt: alt || '', style: imgStyle, onError: () => setFailed(true) });",
    "};",
    "const Link = ({ href, children, onClick, ...props }) => React.createElement('a', { href: href || '#', ...props, onClick: (e) => {",
    "  onClick?.(e);",
    "  if (e.defaultPrevented) return;",
    "  const rawHref = typeof href === 'string' ? href : '';",
    "  const isInternal = rawHref.startsWith('/') || rawHref.startsWith('./') || rawHref.startsWith('../');",
    "  if (!isInternal) return;",
    "  e.preventDefault();",
    "  let nextHref = rawHref || '/';",
    "  try {",
    "    nextHref = new URL(rawHref, 'https://preview.local' + (__previewPathname.endsWith('/') ? __previewPathname : __previewPathname + '/')).pathname || '/';",
    "  } catch {",
    "    nextHref = rawHref || '/';",
    "  }",
    "  if (typeof __previewPost === 'function') __previewPost('navigation-attempt', { href: nextHref });",
    "} }, children);",
    "const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: async () => {} });",
    "const usePathname = () => __previewPathname;",
    "const useSearchParams = () => new URLSearchParams();",
    "window.addEventListener('error', (event) => {",
    "  if (__previewRoot && !__previewRoot.hasChildNodes()) __previewShowError(event.error ?? event.message);",
    "});",
    "window.addEventListener('unhandledrejection', (event) => {",
    "  if (__previewRoot && !__previewRoot.hasChildNodes()) __previewShowError(event.reason ?? event);",
    "});",
    "class __PreviewErrorBoundary extends React.Component {",
    "  constructor(props) {",
    "    super(props);",
    "    this.state = { error: null };",
    "  }",
    "  static getDerivedStateFromError(error) {",
    "    return { error };",
    "  }",
    "  componentDidCatch(error) {",
    "    console.error('Preview render error:', error);",
    "    __previewReportError(error, { kind: 'react-render' });",
    "  }",
    "  render() {",
    "    if (this.state?.error) {",
    "      const message = this.state.error?.message ? String(this.state.error.message) : String(this.state.error);",
    "      return React.createElement('div', { style: { padding: '2rem', fontFamily: 'system-ui', color: '#ef4444' } },",
    "        React.createElement('h2', { style: { margin: '0 0 1rem' } }, 'Preview-fel'),",
    "        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', color: '#a3a3a3' } }, message),",
    "      );",
    "    }",
    "    return this.props.children;",
    "  }",
    "}",
    "function __previewCn(...values) {",
    "  const parts = [];",
    "  const visit = (value) => {",
    "    if (!value) return;",
    "    if (typeof value === 'string') { parts.push(value); return; }",
    "    if (Array.isArray(value)) { value.forEach(visit); return; }",
    "    if (typeof value === 'object') { for (const [key, enabled] of Object.entries(value)) { if (enabled) parts.push(key); } }",
    "  };",
    "  values.forEach(visit);",
    "  return parts.join(' ');",
    "}",
    "function __previewPrimitive(tag, defaults) {",
    "  const component = React.forwardRef(function PreviewPrimitive(props, ref) {",
    "    const { asChild, children, ...rest } = props || {};",
    "    const nextProps = { ...(defaults || {}), ...rest, ref };",
    "    if (asChild && React.isValidElement(children)) {",
    "      return React.cloneElement(children, { ...nextProps, ...children.props });",
    "    }",
    "    if (tag === 'input' || tag === 'img') return React.createElement(tag, nextProps);",
    "    return React.createElement(tag, nextProps, children);",
    "  });",
    "  return component;",
    "}",
    "function __previewStyled(tag, baseStyle, defaults) {",
    "  return React.forwardRef(function StyledPreview(props, ref) {",
    "    const { asChild, children, className, style, variant, size, ...rest } = props || {};",
    "    const merged = { ...baseStyle, ...style };",
    "    const nextProps = { ...(defaults || {}), ...rest, ref, style: merged, className };",
    "    if (asChild && React.isValidElement(children)) {",
    "      return React.cloneElement(children, { ...nextProps, ...children.props });",
    "    }",
    "    if (tag === 'input' || tag === 'img' || tag === 'textarea' || tag === 'hr') return React.createElement(tag, nextProps);",
    "    return React.createElement(tag, nextProps, children);",
    "  });",
    "}",
    "const __s = {",
    "  primary: 'var(--primary)',",
    "  primaryFg: 'var(--primary-foreground)',",
    "  secondary: 'var(--secondary)',",
    "  secondaryFg: 'var(--secondary-foreground)',",
    "  muted: 'var(--muted)',",
    "  mutedFg: 'var(--muted-foreground)',",
    "  card: 'var(--card)',",
    "  cardFg: 'var(--card-foreground)',",
    "  border: 'var(--border)',",
    "  bg: 'var(--background)',",
    "  fg: 'var(--foreground)',",
    "  destructive: 'var(--destructive)',",
    "  radius: 'var(--radius, 0.5rem)',",
    "};",
    "const __previewUiMap = {",
    "  Accordion: __previewPrimitive('div'),",
    "  AccordionContent: __previewStyled('div', { padding: '0 16px 16px' }),",
    "  AccordionItem: __previewStyled('div', { borderBottom: '1px solid ' + 'var(--border)' }),",
    "  AccordionTrigger: __previewStyled('button', { type: 'button', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', fontWeight: 500, fontSize: '14px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }),",
    "  Alert: __previewStyled('div', { border: '1px solid var(--border)', borderRadius: __s.radius, padding: '12px 16px' }),",
    "  AlertDescription: __previewStyled('div', { fontSize: '14px', color: __s.mutedFg }),",
    "  AlertTitle: __previewStyled('div', { fontWeight: 600, fontSize: '14px', marginBottom: '4px' }),",
    "  Avatar: __previewStyled('div', { width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', background: __s.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),",
    "  AvatarFallback: __previewStyled('span', { fontSize: '14px', fontWeight: 500, color: __s.mutedFg }),",
    "  AvatarImage: __previewPrimitive('img'),",
    "  Badge: __previewStyled('span', { display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600, background: __s.primary, color: __s.primaryFg, lineHeight: '1.5' }),",
    "  Button: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: __s.radius, padding: '8px 16px', fontSize: '14px', fontWeight: 500, background: __s.primary, color: __s.primaryFg, border: 'none', cursor: 'pointer', lineHeight: '1.5', whiteSpace: 'nowrap', transition: 'opacity 0.15s' }, { type: 'button' }),",
    "  Card: __previewStyled('div', { borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.card, color: __s.cardFg, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }),",
    "  CardContent: __previewStyled('div', { padding: '0 24px 24px' }),",
    "  CardDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg, margin: 0 }),",
    "  CardFooter: __previewStyled('div', { display: 'flex', alignItems: 'center', padding: '0 24px 24px' }),",
    "  CardHeader: __previewStyled('div', { padding: '24px 24px 8px' }),",
    "  CardTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600, lineHeight: '1.3' }),",
    "  Checkbox: __previewStyled('input', { width: '16px', height: '16px', accentColor: __s.primary }, { type: 'checkbox' }),",
    "  Dialog: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DialogContent: () => null,",
    "  DialogDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  DialogFooter: __previewStyled('div', { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }),",
    "  DialogHeader: __previewStyled('div', { marginBottom: '8px' }),",
    "  DialogTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  DialogTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }, { type: 'button' }),",
    "  Drawer: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DrawerContent: () => null,",
    "  DrawerDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  DrawerFooter: __previewStyled('div', { display: 'flex', gap: '8px', padding: '16px' }),",
    "  DrawerHeader: __previewStyled('div', { padding: '16px' }),",
    "  DrawerTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  DrawerTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  DropdownMenu: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DropdownMenuContent: () => null,",
    "  DropdownMenuGroup: __previewPrimitive('div'),",
    "  DropdownMenuItem: __previewStyled('button', { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  DropdownMenuLabel: __previewStyled('div', { padding: '6px 8px', fontSize: '12px', fontWeight: 600, color: __s.mutedFg }),",
    "  DropdownMenuSeparator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }, { role: 'separator' }),",
    "  DropdownMenuTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  HoverCard: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  HoverCardContent: () => null,",
    "  HoverCardTrigger: __previewPrimitive('button', { type: 'button' }),",
    "  Input: __previewStyled('input', { width: '100%', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', outline: 'none' }),",
    "  Label: __previewStyled('label', { fontSize: '14px', fontWeight: 500, lineHeight: '1.5' }),",
    "  NavigationMenu: __previewStyled('nav', { display: 'flex', alignItems: 'center' }),",
    "  NavigationMenuContent: () => null,",
    "  NavigationMenuItem: __previewStyled('div', { display: 'inline-flex' }),",
    "  NavigationMenuLink: __previewStyled('a', { fontSize: '14px', fontWeight: 500, padding: '8px 12px', color: 'inherit', textDecoration: 'none' }),",
    "  NavigationMenuList: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }),",
    "  NavigationMenuTrigger: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: 'none', border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Popover: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  PopoverContent: () => null,",
    "  PopoverTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Progress: __previewStyled('div', { height: '8px', width: '100%', borderRadius: '9999px', background: __s.muted, overflow: 'hidden' }),",
    "  RadioGroup: __previewStyled('div', { display: 'flex', flexDirection: 'column', gap: '8px' }),",
    "  RadioGroupItem: __previewStyled('input', { width: '16px', height: '16px', accentColor: __s.primary }, { type: 'radio' }),",
    "  ScrollArea: __previewStyled('div', { overflow: 'auto' }),",
    "  ScrollBar: __previewPrimitive('div'),",
    "  Select: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  SelectContent: () => null,",
    "  SelectItem: __previewStyled('div', { padding: '6px 32px 6px 8px', fontSize: '14px', cursor: 'pointer' }),",
    "  SelectTrigger: __previewStyled('button', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', cursor: 'pointer' }, { type: 'button' }),",
    "  SelectValue: __previewPrimitive('span'),",
    "  Separator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '0', width: '100%' }, { role: 'separator' }),",
    "  Sheet: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  SheetContent: () => null,",
    "  SheetDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  SheetHeader: __previewStyled('div', { marginBottom: '8px' }),",
    "  SheetTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  SheetTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Skeleton: __previewStyled('div', { borderRadius: __s.radius, background: __s.muted, animation: 'pulse 2s ease-in-out infinite' }),",
    "  Sonner: () => null,",
    "  Switch: __previewStyled('button', { width: '44px', height: '24px', borderRadius: '9999px', background: __s.muted, border: 'none', cursor: 'pointer', position: 'relative' }, { type: 'button', role: 'switch' }),",
    "  Table: __previewStyled('table', { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }),",
    "  TableBody: __previewPrimitive('tbody'),",
    "  TableCaption: __previewStyled('caption', { color: __s.mutedFg, fontSize: '14px', padding: '8px 0' }),",
    "  TableCell: __previewStyled('td', { padding: '12px 16px', borderBottom: '1px solid var(--border)' }),",
    "  TableFooter: __previewStyled('tfoot', { fontWeight: 500, background: __s.muted }),",
    "  TableHead: __previewStyled('th', { padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: __s.mutedFg, borderBottom: '1px solid var(--border)' }),",
    "  TableHeader: __previewPrimitive('thead'),",
    "  TableRow: __previewStyled('tr', { borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }),",
    "  Tabs: ({ children, defaultValue }) => { const [tab, setTab] = React.useState(defaultValue || ''); return React.createElement('__TabsCtx', null, React.Children.map(children, c => React.isValidElement(c) ? React.cloneElement(c, { __activeTab: tab, __setTab: setTab }) : c)); },",
    "  TabsContent: React.forwardRef(function TabsContent(props, ref) { const { value, __activeTab, children, ...rest } = props || {}; if (__activeTab && value && __activeTab !== value) return null; return React.createElement('div', { ...rest, ref }, children); }),",
    "  TabsList: __previewStyled('div', { display: 'inline-flex', gap: '2px', padding: '4px', borderRadius: __s.radius, background: __s.muted }),",
    "  TabsTrigger: React.forwardRef(function TabsTrigger(props, ref) { const { value, __activeTab, __setTab, children, ...rest } = props || {}; const active = __activeTab === value; return React.createElement('button', { ...rest, ref, type: 'button', onClick: () => __setTab && __setTab(value), style: { padding: '6px 12px', borderRadius: 'calc(var(--radius,0.5rem) - 2px)', border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', background: active ? __s.bg : 'transparent', color: active ? __s.fg : __s.mutedFg, boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', ...(rest.style||{}) } }, children); }),",
    "  Textarea: __previewStyled('textarea', { width: '100%', minHeight: '80px', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }),",
    "  Tooltip: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  TooltipContent: () => null,",
    "  TooltipProvider: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  TooltipTrigger: __previewPrimitive('button', { type: 'button' }),",
    "};",
    "function __previewGetUiComponent(name) {",
    "  return __previewUiMap[name] || __previewPrimitive('div');",
    "}",
    "function __previewGetIcon(name) {",
    "  return React.forwardRef(function PreviewIcon(props, ref) {",
    "    const s = props?.className?.includes('w-') ? {} : { width: '1em', height: '1em' };",
    "    return React.createElement('svg', { ...props, ref, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'data-preview-icon': name, style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...s, ...(props?.style||{}) } },",
    "      React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, opacity: 0.15 }),",
    "    );",
    "  });",
    "}",
  ];

  const emitted = new Set<string>();
  const GLOBAL_STUBS = new Set(["Image", "Link", "useRouter", "usePathname", "useSearchParams"]);

  const emit = (line: string) => {
    if (emitted.has(line)) return;
    emitted.add(line);
    lines.push(line);
  };

  const emitBinding = (name: string, value: string) => {
    if (GLOBAL_STUBS.has(name)) return;
    emit(`var ${name} = ${value};`);
  };

  for (const preparedModule of modules) {
    for (const imp of preparedModule.imports) {
      if (imp.source === "react") {
        if (imp.defaultImport && imp.defaultImport !== "React") {
          emitBinding(imp.defaultImport, "React");
        }
        if (imp.namespaceImport && imp.namespaceImport !== "React") {
          emitBinding(imp.namespaceImport, "React");
        }
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `React.${binding.imported}`);
        }
        continue;
      }

      if (imp.source === "next/image") {
        if (imp.defaultImport && imp.defaultImport !== "Image") {
          emitBinding(imp.defaultImport, "Image");
        }
        continue;
      }

      if (imp.source === "next/link") {
        if (imp.defaultImport && imp.defaultImport !== "Link") {
          emitBinding(imp.defaultImport, "Link");
        }
        continue;
      }

      if (imp.source === "next/navigation") {
        for (const binding of imp.namedImports) {
          if (
            binding.imported === "useRouter" ||
            binding.imported === "usePathname" ||
            binding.imported === "useSearchParams"
          ) {
            emitBinding(binding.local, binding.imported);
          } else {
            emitBinding(binding.local, "() => undefined");
          }
        }
        continue;
      }

      if (imp.source === "lucide-react") {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `__previewGetIcon(${JSON.stringify(binding.imported)})`);
        }
        continue;
      }

      if (imp.source.startsWith("@/components/ui/")) {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `__previewGetUiComponent(${JSON.stringify(binding.imported)})`);
        }
        continue;
      }

      if (imp.source === "@/lib/utils") {
        for (const binding of imp.namedImports) {
          if (binding.imported === "cn") {
            emitBinding(binding.local, "__previewCn");
          } else {
            emitBinding(binding.local, "(...args) => args[0]");
          }
        }
      }
    }
  }

  return lines.join("\n");
}

function buildLocalImportAliases(modules: PreparedModule[]): string {
  const fileMap = buildCodeFileMap(modules.map((module) => module.file));
  const moduleByPath = buildPreparedModuleMap(modules);
  const lines = new Set<string>();

  for (const preparedModule of modules) {
    for (const imp of preparedModule.imports) {
      const targetPath = resolveLocalImportPath(fileMap, preparedModule.file.path, imp.source);
      if (!targetPath) continue;

      const targetModule = moduleByPath.get(targetPath);
      if (!targetModule) continue;

      if (
        imp.defaultImport &&
        targetModule.defaultExportName &&
        imp.defaultImport !== targetModule.defaultExportName
      ) {
        lines.add(`var ${imp.defaultImport} = ${targetModule.defaultExportName};`);
      }

      for (const binding of imp.namedImports) {
        if (binding.local !== binding.imported) {
          lines.add(`var ${binding.local} = ${binding.imported};`);
        }
      }
    }
  }

  return [...lines].join("\n");
}

function isPreviewHandledImportSource(source: string): boolean {
  return isPreviewBuiltinImportSource(source);
}

function collectPreviewValidationIssues(modules: PreparedModule[]): PreviewValidationIssue[] {
  const fileMap = buildCodeFileMap(modules.map((module) => module.file));
  const moduleByPath = buildPreparedModuleMap(modules);
  const issues: PreviewValidationIssue[] = [];

  for (const preparedModule of modules) {
    for (const imp of preparedModule.imports) {
      if (isPreviewHandledImportSource(imp.source)) continue;

      const targetPath = resolveLocalImportPath(fileMap, preparedModule.file.path, imp.source);
      if (!targetPath) {
        if (imp.source.startsWith(".") || imp.source.startsWith("@/")) {
          issues.push({
            file: preparedModule.file.path,
            message: `Missing local import target: ${imp.source}`,
            severity: "warning",
          });
        }
        continue;
      }

      const targetModule = moduleByPath.get(targetPath);
      if (!targetModule) {
        issues.push({
          file: preparedModule.file.path,
          message: `Resolved local import is unavailable in preview: ${imp.source} -> ${targetPath}`,
          severity: "warning",
        });
        continue;
      }

      if (imp.defaultImport && !targetModule.defaultExportName) {
        issues.push({
          file: preparedModule.file.path,
          message: `Local import expects a default export from ${imp.source}, but none was found`,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

function buildMissingImportStubs(modules: PreparedModule[], issues: PreviewValidationIssue[]): string {
  if (issues.length === 0) return "";

  const fileMap = buildCodeFileMap(modules.map((m) => m.file));
  const stubbed = new Set<string>();
  const lines: string[] = [];

  for (const preparedModule of modules) {
    for (const imp of preparedModule.imports) {
      if (isPreviewHandledImportSource(imp.source)) continue;

      const targetPath = resolveLocalImportPath(fileMap, preparedModule.file.path, imp.source);
      if (targetPath) continue;
      if (!imp.source.startsWith(".") && !imp.source.startsWith("@/")) continue;

      if (imp.defaultImport && !stubbed.has(imp.defaultImport)) {
        stubbed.add(imp.defaultImport);
        lines.push(
          `var ${imp.defaultImport} = (props) => React.createElement("div", ` +
            `{ "data-stub": ${JSON.stringify(imp.source)}, style: { padding: "1rem", border: "1px dashed #666", borderRadius: "0.5rem", color: "#999", fontSize: "0.85rem", textAlign: "center" } }, ` +
            `"[${imp.defaultImport}]");`,
        );
      }

      for (const binding of imp.namedImports) {
        if (!stubbed.has(binding.local)) {
          stubbed.add(binding.local);
          lines.push(
            `var ${binding.local} = (props) => React.createElement("div", ` +
              `{ "data-stub": ${JSON.stringify(imp.source)}, style: { padding: "0.5rem", border: "1px dashed #666", borderRadius: "0.25rem", color: "#999", fontSize: "0.85rem" } }, ` +
              `"[${binding.local}]");`,
          );
        }
      }

      if (imp.namespaceImport && !stubbed.has(imp.namespaceImport)) {
        stubbed.add(imp.namespaceImport);
        lines.push(`var ${imp.namespaceImport} = new Proxy({}, { get: (_, key) => (props) => React.createElement("span", null, "[" + String(key) + "]") });`);
      }
    }
  }

  return lines.join("\n");
}

function buildPreviewScript(
  pageFile: CodeFile,
  componentFiles: CodeFile[],
  routePath: string,
): string {
  const modules = prepareModules(pageFile, componentFiles);
  const prelude = buildPreviewPrelude(modules, routePath);
  const transpileFailures = modules.flatMap((module) =>
    module.transpileErrors.map((error) => `${module.file.path}: ${error}`),
  );
  if (transpileFailures.length > 0) {
    const visibleErrors = transpileFailures.slice(0, PREVIEW_TRANSPILE_ERROR_LIMIT);
    const errorMessage = [
      "Preview compilation failed for generated code.",
      "",
      ...visibleErrors.map((entry) => `- ${entry}`),
    ].join("\n");
    return escapeInlineScript(
      [prelude, `__previewShowError(${JSON.stringify(errorMessage)}, { kind: 'compile' });`].join("\n\n"),
    );
  }

  const validationIssues = collectPreviewValidationIssues(modules);
  const validationErrors = validationIssues.filter((i) => i.severity === "error");
  const validationWarnings = validationIssues.filter((i) => i.severity === "warning");

  if (validationErrors.length > 0) {
    const visibleIssues = validationErrors.slice(0, PREVIEW_TRANSPILE_ERROR_LIMIT);
    const errorMessage = [
      "Preview validation failed for generated code.",
      "",
      ...visibleIssues.map((issue) => `- ${issue.file}: ${issue.message}`),
    ].join("\n");
    return escapeInlineScript(
      [prelude, `__previewShowError(${JSON.stringify(errorMessage)}, { kind: 'validation' });`].join("\n\n"),
    );
  }

  const missingImportStubs = buildMissingImportStubs(modules, validationWarnings);
  const warningLog = validationWarnings.length > 0
    ? validationWarnings.map((w) => `console.warn("[preview] ${w.file}: ${w.message.replace(/"/g, '\\"')}");`).join("\n")
    : "";

  const moduleCode = modules.map((module) => module.transformedCode).join("\n\n");
  const localAliases = buildLocalImportAliases(modules);
  const pageModule = modules[modules.length - 1];
  const renderName = pageModule?.defaultExportName ?? "__PreviewModulePage";

  return escapeInlineScript(
    [
      prelude,
      missingImportStubs,
      warningLog,
      moduleCode,
      localAliases,
      "try {",
      "  if (__previewRoot) {",
      "    ReactDOM.createRoot(__previewRoot).render(",
      `      React.createElement(__PreviewErrorBoundary, null, React.createElement(${renderName})),`,
      "    );",
      "    __previewPost('preview-ready', { ok: true });",
      "  }",
      "} catch (error) {",
      "  __previewShowError(error, { kind: 'runtime' });",
      "}",
    ].filter(Boolean).join("\n\n"),
  );
}

export function buildPreviewHtml(files: CodeFile[], routePath?: string | null): string | null {
  const normalizedRoute = normalizeRoutePath(routePath);
  const pageFile = findPageFile(files, normalizedRoute);
  if (!pageFile) return null;

  const cssFiles = findCssFiles(files);
  const componentFiles = findComponentFiles(files, pageFile.path);
  const customCss = normalizePreviewCss(
    cssFiles
      .map((f) => f.content)
      .join("\n"),
  );
  const baseCss = buildPreviewBaseCss();
  const previewScript = buildPreviewScript(pageFile, componentFiles, normalizedRoute);

  const allContent = [pageFile, ...componentFiles, ...cssFiles].map((f) => f.content).join("\n");
  const wantsDark = /className=["'][^"']*\bdark\b/.test(allContent) || /class=["'][^"']*\bdark\b/.test(allContent);
  const htmlClass = wantsDark ? ' class="dark"' : "";

  return `<!DOCTYPE html>
<html lang="sv"${htmlClass}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Preview</title>
  <script>
    (() => {
      const originalWarn = console.warn.bind(console);
      const tailwindBrowserWarning = "cdn.tailwindcss.com should not be used in production";
      console.warn = (...args) => {
        const joined = args
          .map((arg) => (typeof arg === "string" ? arg : ""))
          .join(" ");
        if (joined.includes(tailwindBrowserWarning)) return;
        originalWarn(...args);
      };
      window.__restorePreviewWarn = () => {
        console.warn = originalWarn;
      };
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    window.__restorePreviewWarn?.();
    delete window.__restorePreviewWarn;
    if (typeof tailwind !== 'undefined') {
      tailwind.config = { darkMode: 'class' };
    }
  </script>
  <style>
    ${baseCss}
    ${customCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script>
    ${previewScript}
  <\/script>
</body>
</html>`;
}

/**
 * Prepares files for @vercel/sandbox consumption.
 * Converts CodeFile[] to the Record<string, string> format the sandbox API expects.
 */
export function buildSandboxFiles(files: CodeFile[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of files) {
    result[file.path] = file.content;
  }
  return result;
}

/**
 * Creates a preview URL for a given chatId + versionId.
 * Points to the /api/preview-render endpoint which serves the HTML.
 */
export function buildPreviewUrl(
  chatId: string,
  versionId: string,
  projectId?: string | null,
  routePath?: string | null,
): string {
  const params = new URLSearchParams({
    chatId,
    versionId,
  });
  if (projectId) {
    params.set("projectId", projectId);
  }
  const normalizedRoute = normalizeRoutePath(routePath);
  if (normalizedRoute !== "/") {
    params.set("route", normalizedRoute);
  }
  return `/api/preview-render?${params.toString()}`;
}
