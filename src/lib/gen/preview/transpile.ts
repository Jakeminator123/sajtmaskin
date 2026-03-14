import ts from "typescript";
import type { CodeFile, PreparedModule } from "./types";
import { PREVIEW_BUILTIN_SOURCES, PREVIEW_TRANSPILE_ERROR_LIMIT, isPreviewBuiltinImportSource } from "./constants";
import { escapeRegExp, normalizeFilePath, resolveLocalImportPath } from "./utils";
import { stripNextImports, parseImports, stripImportStatements, rewriteModuleExports } from "./import-parser";
import { buildCodeFileMap, buildPreparedModuleMap } from "./file-resolution";

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

    if (source === "framer-motion" || source === "motion/react") {
      result = result.replace(fullMatch, "");
      result = result.replace(memberRe, "$1");
      result = result.replace(defaultRe, "motion");
      continue;
    }

    if (PREVIEW_BUILTIN_SOURCES.has(source) || source.startsWith("@radix-ui/") || source.startsWith("date-fns/")) {
      result = result.replace(fullMatch, "");
      result = result.replace(memberRe, "$1");
      result = result.replace(defaultRe, varName);
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

export function prepareModules(pageFile: CodeFile, componentFiles: CodeFile[]): PreparedModule[] {
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

  const codeFileMap = buildCodeFileMap(prepared.map((module) => module.file));
  const preparedModuleMap = buildPreparedModuleMap(prepared);
  for (const preparedModule of prepared) {
    preparedModule.transformedCode = normalizeTranspiledModule(
      preparedModule.transformedCode,
      preparedModule,
      codeFileMap,
      preparedModuleMap,
    );
  }

  return prepared;
}
