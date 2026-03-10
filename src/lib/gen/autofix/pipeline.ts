import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { fixUseClient } from "./use-client-fixer";
import { runImportValidator } from "./import-validator";
import { fixReactImport } from "./react-import-fixer";
import { fixFontImport } from "./rules/font-import-fixer";
import type { SyntaxValidation } from "./syntax-validator";
import { runJsxChecker } from "./jsx-checker";
import { runDepCompleter } from "./dep-completer";
import { runSecurityChecks } from "../security";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoFixEntry {
  fixer: string;
  description: string;
  file?: string;
  line?: number;
}

export interface AutoFixResult {
  fixedContent: string;
  fixes: AutoFixEntry[];
  warnings: string[];
  dependencies: Record<string, string>;
}

export interface AutoFixContext {
  chatId?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run all post-generation fixers sequentially on accumulated content.
 *
 * The content is expected to be in CodeProject format (fenced code blocks with
 * `file="..."` attributes). Each file is processed independently.
 *
 * Fixer order:
 *  1. use-client-fixer  — prepend "use client" when client APIs detected
 *  2. import-validator   — fix shadcn import paths
 *  3. react-import-fixer — add missing `import React`
 *  4. syntax-validator   — esbuild transform check (async)
 *  5. jsx-checker        — tag matching warnings
 *  6. dep-completer      — collect third-party dependencies
 *
 * Fail-safe: if any fixer throws, it is skipped and a warning is logged.
 */
export async function runAutoFix(
  content: string,
  _context?: AutoFixContext,
): Promise<AutoFixResult> {
  const allFixes: AutoFixEntry[] = [];
  const allWarnings: string[] = [];
  let allDependencies: Record<string, string> = {};

  const project = parseCodeProject(content);

  if (project.files.length === 0) {
    return {
      fixedContent: content,
      fixes: [],
      warnings: ["No code files found in content — autofix skipped"],
      dependencies: {},
    };
  }

  const fixedFiles: CodeFile[] = [];

  for (const file of project.files) {
    const isTsxOrJsx =
      file.language === "tsx" || file.language === "jsx" ||
      file.language === "ts" || file.language === "js";

    let currentCode = file.content;

    // 1. use-client-fixer (tsx/jsx only)
    if (file.language === "tsx" || file.language === "jsx") {
      try {
        const ucResult = fixUseClient(currentCode, file.path);
        if (ucResult.fixed) {
          currentCode = ucResult.code;
          allFixes.push({
            fixer: "use-client-fixer",
            description: 'Prepended "use client" directive',
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] use-client-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (isTsxOrJsx) {
      // 2. import-validator
      try {
        const importResult = runImportValidator(currentCode);
        currentCode = importResult.code;
        for (const fix of importResult.fixes) {
          allFixes.push({ ...fix, file: file.path });
        }
        for (const w of importResult.warnings) {
          allWarnings.push(`[${file.path}] ${w}`);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] import-validator threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3. react-import-fixer
      try {
        const riResult = fixReactImport(currentCode);
        if (riResult.fixed) {
          currentCode = riResult.code;
          allFixes.push({
            fixer: "react-import-fixer",
            description: "Added missing React import",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] react-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3b. font-import-fixer (layout files only)
      try {
        const fontResult = fixFontImport(currentCode, file.path);
        if (fontResult.fixed) {
          currentCode = fontResult.code;
          for (const fix of fontResult.fixes) {
            allFixes.push({ ...fix, file: file.path });
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] font-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4. syntax-validator (async, dynamically imported to avoid Turbopack bundling esbuild)
      try {
        const { validateSyntax } = await import("./syntax-validator");
        const syntaxResult: SyntaxValidation = await validateSyntax(currentCode, file.path);
        if (!syntaxResult.valid) {
          for (const e of syntaxResult.errors) {
            allWarnings.push(
              `[${file.path}] syntax error line ${e.line}:${e.column} — ${e.message}`,
            );
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] syntax-validator threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 5. jsx-checker (fix missing imports & default export)
      try {
        const jsxResult = runJsxChecker(currentCode);
        currentCode = jsxResult.code;
        for (const fix of jsxResult.fixes) {
          allFixes.push({ ...fix, file: file.path });
        }
        for (const w of jsxResult.warnings) {
          allWarnings.push(`[${file.path}] ${w}`);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] jsx-checker threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 6. dep-completer
      try {
        const depResult = runDepCompleter(currentCode);
        for (const fix of depResult.fixes) {
          allFixes.push({ ...fix, file: file.path });
        }
        for (const w of depResult.warnings) {
          allWarnings.push(`[${file.path}] ${w}`);
        }
        allDependencies = { ...allDependencies, ...depResult.dependencies };
      } catch (err) {
        allWarnings.push(
          `[${file.path}] dep-completer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    fixedFiles.push({ ...file, content: currentCode });
  }

  let fixedContent = rebuildContent(content, project.files, fixedFiles);

  // 7. security checks (last step)
  try {
    const securityResult = runSecurityChecks(fixedContent);
    fixedContent = securityResult.sanitizedContent;
    for (const w of securityResult.warnings) {
      allWarnings.push(`[security:${w.severity}] ${w.file}:${w.line} — ${w.pattern}`);
    }
    for (const indicator of securityResult.injectionIndicators) {
      allWarnings.push(`[security:injection] ${indicator}`);
    }
  } catch (err) {
    allWarnings.push(
      `security-checks threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    fixedContent,
    fixes: allFixes,
    warnings: allWarnings,
    dependencies: allDependencies,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace original file contents in the raw CodeProject string with fixed versions.
 * Uses file-path-aware fenced block matching to avoid replacing the wrong file
 * when multiple files contain identical content snippets.
 */
function rebuildContent(
  originalContent: string,
  originalFiles: CodeFile[],
  fixedFiles: CodeFile[],
): string {
  let result = originalContent;

  for (let i = 0; i < originalFiles.length; i++) {
    const orig = originalFiles[i];
    const fixed = fixedFiles[i];
    if (orig.content === fixed.content) continue;

    const escapedPath = orig.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fenceRe = new RegExp(
      "(```\\w+\\s+file=\"" + escapedPath + "\"[^\\n]*\\n)" +
        "([\\s\\S]*?)" +
        "(\\n```)",
    );
    const match = result.match(fenceRe);
    if (match) {
      result = result.replace(fenceRe, `$1${fixed.content}$3`);
    } else {
      result = result.replace(orig.content, fixed.content);
    }
  }

  return result;
}
