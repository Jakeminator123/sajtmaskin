import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { fixUseClient } from "./use-client-fixer";
import { runImportValidator } from "./import-validator";
import { fixReactImport } from "./react-import-fixer";
import { fixReactHookImports } from "./react-hook-import-fixer";
import {
  buildProjectModuleExportIndex,
  fixImportedDeclarationConflicts,
  fixLocalNamedImportDefaultMismatches,
  buildProjectExportIndex,
  fixLocalDefaultImportMismatches,
  fixMissingLocalSymbolImports,
  fixMissingReactTypeImports,
  fixNextImageImport,
} from "./common-import-fixer";
import { fixLucideImageMisuse } from "./rules/lucide-image-fixer";
import { fixLucideLinkMisuse } from "./rules/lucide-link-fixer";
import { fixTailwindFontArbitrary } from "./rules/tailwind-font-arbitrary-fixer";
import {
  fixCnImportConflict,
  fixMissingMetadataImport,
  fixMissingMetadataRouteImport,
  fixMissingCnImport,
} from "./rules/metadata-import-fixer";
import type { SyntaxValidation } from "./syntax-validator";
import { runJsxChecker } from "./jsx-checker";
import { runDepCompleter } from "./dep-completer";
import { runSecurityChecks } from "../security/run-security-checks";
import { DETERMINISTIC_AUTOFIX_MAX_PASSES } from "../defaults";

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
 *  1.  use-client-fixer   — prepend "use client" when client APIs detected
 *  2.  import-validator   — fix shadcn import paths
 *  3.  react-import-fixer — add missing `import React` + hooks + types
 *  3b. next-image / local-symbol import fixers
 *  4a. metadata-import-fixer — Metadata type import
 *  4b. metadata-route / cn-conflict / cn-import fixers
 *  4d. lucide-image-fixer — lucide Image → next/image
 *  4e. lucide-link-fixer  — lucide Link → next/link
 *  4f. tailwind-font-arbitrary-fixer
 *  5.  syntax-validator   — esbuild transform check (async)
 *  6.  jsx-checker        — tag matching + missing imports/exports
 *  7.  dep-completer      — collect third-party dependencies
 *  7b. dep-merge          — merge collected deps into package.json
 *  8.  security checks    — sanitize suspicious payloads
 *
 * Note: font import repair is owned by `repairGeneratedFiles()` so deterministic
 * font fixes run in one canonical place.
 *
 * The full `runAutoFix()` wrapper may execute multiple deterministic passes
 * (see `repairPolicies.deterministicAutofixPasses` in `config/ai_models/manifest.json`)
 * before the caller escalates to an LLM fixer (`runLlmFixer`).
 * The escalation phase is now also bounded by a time budget in `validateAndFix()`.
 *
 * Fail-safe: if any fixer throws, it is skipped and a warning is logged.
 */
async function runAutoFixSinglePass(
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
  const exportIndex = buildProjectExportIndex(project.files);
  const moduleExportIndex = buildProjectModuleExportIndex(project.files);

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

      // 3b. react-hook-import-fixer — add missing named React hook imports (useState etc.)
      try {
        const hookResult = fixReactHookImports(currentCode);
        if (hookResult.fixed) {
          currentCode = hookResult.code;
          allFixes.push({
            fixer: "react-hook-import-fixer",
            description: `Added missing React hook imports: ${hookResult.addedHooks.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] react-hook-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3c. react-type-import-fixer — add missing ReactNode / common type-only imports
      try {
        const reactTypeResult = fixMissingReactTypeImports(currentCode);
        if (reactTypeResult.fixed) {
          currentCode = reactTypeResult.code;
          allFixes.push({
            fixer: "react-type-import-fixer",
            description: `Added missing React type imports: ${reactTypeResult.addedTypes.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] react-type-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3d. next-image-import-fixer — add next/image when Image JSX is used without import
      try {
        const nextImageResult = fixNextImageImport(currentCode);
        if (nextImageResult.fixed) {
          currentCode = nextImageResult.code;
          allFixes.push({
            fixer: "next-image-import-fixer",
            description: 'Added missing `import Image from "next/image"`',
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] next-image-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3e. local-symbol-import-fixer — import shared local config/data symbols when uniquely exported
      try {
        const symbolResult = fixMissingLocalSymbolImports(currentCode, file.path, exportIndex);
        if (symbolResult.fixed) {
          currentCode = symbolResult.code;
          allFixes.push({
            fixer: "local-symbol-import-fixer",
            description: `Added missing local symbol imports: ${symbolResult.addedSymbols.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] local-symbol-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3f. local-import-mismatch-fixer — reconcile local default/named import mismatches
      try {
        const namedToDefault = fixLocalNamedImportDefaultMismatches(
          currentCode,
          file.path,
          project.files,
          moduleExportIndex,
        );
        if (namedToDefault.fixed) {
          currentCode = namedToDefault.code;
          allFixes.push({
            fixer: "local-named-import-default-fixer",
            description: `Rewired local named imports to default imports: ${namedToDefault.rewiredImports.join(", ")}`,
            file: file.path,
          });
        }

        const defaultToNamed = fixLocalDefaultImportMismatches(
          currentCode,
          file.path,
          project.files,
          moduleExportIndex,
        );
        if (defaultToNamed.fixed) {
          currentCode = defaultToNamed.code;
          allFixes.push({
            fixer: "local-default-import-fixer",
            description: `Rewired local default imports to named imports: ${defaultToNamed.rewiredImports.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] local-import-mismatch-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3g. import-declaration-conflict-fixer — drop imports that shadow local declarations
      try {
        const conflictResult = fixImportedDeclarationConflicts(currentCode);
        if (conflictResult.fixed) {
          currentCode = conflictResult.code;
          allFixes.push({
            fixer: "import-declaration-conflict-fixer",
            description: `Removed conflicting import bindings: ${conflictResult.removedBindings.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] import-declaration-conflict-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4a. metadata-import-fixer — add missing Metadata type import in page/layout files
      try {
        const metaResult = fixMissingMetadataImport(currentCode, file.path);
        if (metaResult.fixed) {
          currentCode = metaResult.code;
          allFixes.push({
            fixer: "metadata-import-fixer",
            description: "Added missing Metadata type import from next",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] metadata-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4b. MetadataRoute import fixer
      try {
        const mrResult = fixMissingMetadataRouteImport(currentCode, file.path);
        if (mrResult.fixed) {
          currentCode = mrResult.code;
          allFixes.push({
            fixer: "metadata-route-import-fixer",
            description: "Added missing MetadataRoute type import from next",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] metadata-route-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4c. cn import fixer — add missing cn import from @/lib/utils
      try {
        const cnConflictResult = fixCnImportConflict(currentCode, file.path);
        if (cnConflictResult.fixed) {
          currentCode = cnConflictResult.code;
          allFixes.push({
            fixer: "cn-import-conflict-fixer",
            description: "Removed conflicting local cn import from @/lib/utils",
            file: file.path,
          });
        }
        const cnResult = fixMissingCnImport(currentCode, file.path);
        if (cnResult.fixed) {
          currentCode = cnResult.code;
          allFixes.push({
            fixer: "cn-import-fixer",
            description: "Added missing cn import from @/lib/utils",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] cn-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4d. lucide-image-fixer — fix Image imported from lucide-react when used as next/image
      try {
        const imgResult = fixLucideImageMisuse(currentCode, file.path);
        if (imgResult.fixed) {
          currentCode = imgResult.code;
          allFixes.push({
            fixer: "lucide-image-fixer",
            description: "Replaced lucide-react Image with next/image",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] lucide-image-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4e. lucide-link-fixer — fix Link imported from lucide-react when used as next/link
      try {
        const linkResult = fixLucideLinkMisuse(currentCode, file.path);
        if (linkResult.fixed) {
          currentCode = linkResult.code;
          allFixes.push({
            fixer: "lucide-link-fixer",
            description: "Replaced lucide-react Link with next/link",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] lucide-link-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4f. tailwind-font-arbitrary-fixer — replace font-[family-name:var(--x)] with inline style
      try {
        const fontResult = fixTailwindFontArbitrary(currentCode);
        if (fontResult.fixed) {
          currentCode = fontResult.code;
          allFixes.push({
            fixer: "tailwind-font-arbitrary-fixer",
            description: `Replaced ${fontResult.count} Tailwind font-[family-name:...] class(es) with inline style`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] tailwind-font-arbitrary-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 5. syntax-validator (async, dynamically imported to avoid Turbopack bundling esbuild)
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

      // 6. jsx-checker (fix missing imports & default export)
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

      // 7. dep-completer
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

  // 7b. merge collected dependencies into package.json
  if (Object.keys(allDependencies).length > 0) {
    const pkgIdx = fixedFiles.findIndex((f) => f.path === "package.json");
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(fixedFiles[pkgIdx].content);
        const deps = (pkg.dependencies ?? {}) as Record<string, string>;
        let merged = 0;
        for (const [name, version] of Object.entries(allDependencies)) {
          if (!deps[name]) {
            deps[name] = version;
            merged++;
          }
        }
        if (merged > 0) {
          pkg.dependencies = deps;
          fixedFiles[pkgIdx] = {
            ...fixedFiles[pkgIdx],
            content: JSON.stringify(pkg, null, 2),
          };
          allFixes.push({
            fixer: "dep-completer",
            description: `Pinned ${merged} missing ${merged === 1 ? "dependency" : "dependencies"} in package.json`,
            file: "package.json",
          });
        }
      } catch {
        allWarnings.push("[package.json] dep-merge skipped: invalid JSON");
      }
    }
  }

  let fixedContent = rebuildContent(content, project.files, fixedFiles);

  // 8. security checks (last step)
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

export async function runAutoFix(
  content: string,
  context?: AutoFixContext,
): Promise<AutoFixResult> {
  let currentContent = content;
  const allFixes: AutoFixEntry[] = [];
  const warningSet = new Set<string>();
  let allDependencies: Record<string, string> = {};

  for (let pass = 1; pass <= DETERMINISTIC_AUTOFIX_MAX_PASSES; pass++) {
    const before = currentContent;
    const result = await runAutoFixSinglePass(currentContent, context);
    currentContent = result.fixedContent;
    allDependencies = { ...allDependencies, ...result.dependencies };

    for (const fix of result.fixes) {
      allFixes.push(
        pass === 1
          ? fix
          : { ...fix, description: `[pass ${pass}] ${fix.description}` },
      );
    }
    for (const warning of result.warnings) {
      warningSet.add(warning);
    }

    const changed = before !== currentContent;
    if (!changed || result.fixes.length === 0) {
      break;
    }
  }

  return {
    fixedContent: currentContent,
    fixes: allFixes,
    warnings: [...warningSet],
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
