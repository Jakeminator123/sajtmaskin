import type { CodeFile, PreparedModule, PreviewValidationIssue } from "./types";
import { PREVIEW_TRANSPILE_ERROR_LIMIT, isPreviewBuiltinImportSource } from "./constants";
import { escapeInlineScript, resolveLocalImportPath } from "./utils";
import { buildCodeFileMap, buildPreparedModuleMap } from "./file-resolution";
import { prepareModules } from "./transpile";
import { buildPreviewPrelude } from "./shims";

export function buildLocalImportAliases(modules: PreparedModule[]): string {
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

export function collectPreviewValidationIssues(modules: PreparedModule[]): PreviewValidationIssue[] {
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

export function buildMissingImportStubs(modules: PreparedModule[], issues: PreviewValidationIssue[]): string {
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

export function buildPreviewScript(
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
      [
        prelude,
        `__previewShowError(${JSON.stringify(errorMessage)}, { kind: 'compile', code: 'preview_compile_error', stage: 'preview-script', source: 'own-engine-preview' });`,
      ].join("\n\n"),
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
      [
        prelude,
        `__previewShowError(${JSON.stringify(errorMessage)}, { kind: 'validation', code: 'preview_validation_error', stage: 'preview-script', source: 'own-engine-preview' });`,
      ].join("\n\n"),
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
      "  __previewShowError(error, { kind: 'runtime', code: 'preview_runtime_error', stage: 'preview-script', source: 'own-engine-preview' });",
      "}",
    ].filter(Boolean).join("\n\n"),
  );
}
