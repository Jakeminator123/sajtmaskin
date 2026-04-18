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
  fixNextOgImageResponseImport,
} from "./common-import-fixer";
import { fixDuplicateImportBindings } from "./rules/duplicate-import-binding-fixer";
import { fixLucideImageMisuse } from "./rules/lucide-image-fixer";
import { fixLucideLinkMisuse } from "./rules/lucide-link-fixer";
import { fixTailwindFontArbitrary } from "./rules/tailwind-font-arbitrary-fixer";
import { fixAsConstBooleanKeys } from "./rules/as-const-boolean-keys";
import {
  fixCnImportConflict,
  fixMissingMetadataImport,
  fixMissingMetadataRouteImport,
  fixMissingCnImport,
} from "./rules/metadata-import-fixer";
import { fixFontImport } from "./rules/font-import-fixer";
import { fixTier3SdkImports } from "./rules/tier3-sdk-guard-fixer";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { SyntaxValidation } from "./syntax-validator";
import { runJsxChecker } from "./jsx-checker";
import { runDepCompleter } from "./dep-completer";
import { runSecurityChecks } from "../security/run-security-checks";
import { DETERMINISTIC_AUTOFIX_MAX_PASSES } from "../defaults";
import type { FixEntry } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @deprecated Use `FixEntry` from `./types` for new code. */
export type AutoFixEntry = Omit<FixEntry, "category">;

export interface AutoFixResult {
  fixedContent: string;
  fixes: FixEntry[];
  warnings: string[];
  dependencies: Record<string, string>;
}

export interface AutoFixContext {
  chatId?: string;
  model?: string;
  /**
   * Lifecycle stage of the build. Drives the F2 SDK guard
   * (`tier3-sdk-guard-fixer`): tier-3 backend SDK imports are stripped
   * from F2 ("design") output but preserved as-is in F3
   * ("bygg integrationer"). Defaults to undefined which is treated as
   * F2 when set explicitly, but legacy callers without a buildSpec
   * skip the guard so we don't accidentally strip imports from
   * untyped flows.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Regex constants shared with repair-generated-files.ts (consolidated here)
// ---------------------------------------------------------------------------

const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;
const STATIC_METADATA_EXPORT_RE =
  /export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*\{[\s\S]*?\n\};?\s*/m;
const GENERATE_METADATA_EXPORT_RE = /\bexport\s+(?:async\s+)?function\s+generateMetadata\b/;
const CLIENT_HOOKS_RE =
  /\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|useTransition|useOptimistic|useRouter|useSearchParams|usePathname|useParams|useSelectedLayoutSegment|useSelectedLayoutSegments|useFormStatus|useActionState)\b/;
const EVENT_HANDLERS_RE =
  /\b(onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseEnter|onMouseLeave)\b/;
const BROWSER_APIS_RE = /\b(window\.|document\.|localStorage|sessionStorage|navigator\.)\b/;
const FRAMER_MOTION_IMPORT_RE = /from\s+["']framer-motion["']/;
const HTML_SCROLL_SMOOTH_RE = /(<html\b[^>]*?\bclassName=["'][^"']*)\bscroll-smooth\b([^"']*["'])/;
const CSS_SCROLL_SMOOTH_RE = /scroll-behavior:\s*smooth/g;
const ICON_KEY_RE = /key=\{([A-Za-z_$][\w$]*)\.icon\}/g;
const ICON_VALUE_RENDER_RE = /(\s*)\{([A-Za-z_$][\w$]*)\.icon\}(\s*)/g;
const NEXT_CONFIG_FILE_RE = /(^|\/)next\.config\.(ts|mts)$/i;

// ---------------------------------------------------------------------------
// Helpers for fixers consolidated from repair-generated-files.ts
// ---------------------------------------------------------------------------

function hasUseClientDirective(code: string): boolean {
  return USE_CLIENT_DIRECTIVE_RE.test(code);
}

function hasMetadataExport(code: string): boolean {
  return STATIC_METADATA_EXPORT_RE.test(code) || GENERATE_METADATA_EXPORT_RE.test(code);
}

function needsUseClient(code: string): boolean {
  return (
    CLIENT_HOOKS_RE.test(code) ||
    EVENT_HANDLERS_RE.test(code) ||
    BROWSER_APIS_RE.test(code) ||
    FRAMER_MOTION_IMPORT_RE.test(code)
  );
}

function stripUseClientDirective(code: string): string {
  return code.replace(USE_CLIENT_DIRECTIVE_RE, "");
}

function stripMetadataImport(code: string): string {
  return code.replace(
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']next["'];?\s*\n?/g,
    (full, typePrefix: string | undefined, specifiers: string) => {
      const remaining = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part !== "Metadata" && part !== "type Metadata");
      if (remaining.length === 0) return "";
      const prefix = typePrefix ?? "";
      return `import ${prefix}{ ${remaining.join(", ")} } from "next";\n`;
    },
  );
}

export function fixMetadataClientConflict(code: string, filePath: string): {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
} {
  if (!hasUseClientDirective(code) || !hasMetadataExport(code)) {
    return { code, fixed: false, fixes: [] };
  }

  if (!needsUseClient(code)) {
    const nextCode = stripUseClientDirective(code);
    return {
      code: nextCode,
      fixed: nextCode !== code,
      fixes: nextCode !== code
        ? [{
            fixer: "metadata-client-conflict-fixer",
            category: "mechanical",
            description: 'Removed unnecessary "use client" directive from metadata file',
            file: filePath,
          }]
        : [],
    };
  }

  const withoutStaticMetadata = code.replace(STATIC_METADATA_EXPORT_RE, "");
  if (withoutStaticMetadata !== code) {
    const cleaned = stripMetadataImport(withoutStaticMetadata);
    return {
      code: cleaned,
      fixed: true,
      fixes: [{
        fixer: "metadata-client-conflict-fixer",
        category: "mechanical",
        description: "Removed static metadata export from client component to keep App Router valid",
        file: filePath,
      }],
    };
  }

  return { code, fixed: false, fixes: [] };
}

export function fixIconComponentValueMisuse(code: string, filePath: string): {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
} {
  let nextCode = code;
  let fixed = false;

  nextCode = nextCode.replace(ICON_KEY_RE, (_full, itemName: string) => {
    fixed = true;
    return `key={typeof ${itemName}.icon === "string" ? ${itemName}.icon : (${itemName}.title ?? ${itemName}.label ?? ${itemName}.name ?? "icon-item")}`;
  });

  nextCode = nextCode.replace(ICON_VALUE_RENDER_RE, (full, prefix: string, itemName: string, suffix: string) => {
    if (full.includes("<")) return full;
    fixed = true;
    return `${prefix}{typeof ${itemName}.icon === "string" ? ${itemName}.icon : <${itemName}.icon className="h-5 w-5" />}${suffix}`;
  });

  return {
    code: nextCode,
    fixed,
    fixes: fixed
      ? [{
          fixer: "icon-component-value-fixer",
          category: "mechanical",
          description: "Replaced raw icon component values with stable key/render-safe JSX usage",
          file: filePath,
        }]
      : [],
  };
}

export function ensureTier2PreviewBasePathInNextConfig(code: string, filePath: string): {
  code: string;
  fixed: boolean;
} {
  if (!NEXT_CONFIG_FILE_RE.test(filePath.replace(/\\/g, "/"))) {
    return { code, fixed: false };
  }
  if (code.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { code, fixed: false };
  }
  if (/\bbasePath\s*:/.test(code)) {
    return { code, fixed: false };
  }
  const re = /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/;
  if (!re.test(code)) {
    return { code, fixed: false };
  }
  const nextCode = code.replace(
    re,
    `$1\n  ...(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim()\n    ? { basePath: process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim() }\n    : {}),`,
  );
  return { code: nextCode, fixed: nextCode !== code };
}

/**
 * Run all mechanical (deterministic) fixers sequentially on accumulated content.
 *
 * Fixer order:
 *  1.   use-client-fixer   — prepend "use client" when client APIs detected
 *  2.   import-validator   — fix shadcn import paths
 *  3.   react-import-fixer — add missing `import React` + hooks + types
 *  3b.  next-image / local-symbol import fixers
 *  4a.  metadata-import-fixer — Metadata type import
 *  4b.  metadata-route / cn-conflict / cn-import fixers
 *  4d.  lucide-image-fixer — lucide Image → next/image
 *  4e.  lucide-link-fixer  — lucide Link → next/link (with icon-alias)
 *  4f.  tailwind-font-arbitrary-fixer
 *  4g.  font-import-fixer  — layout font imports
 *  4h.  metadata-client-conflict-fixer — "use client" vs static metadata
 *  4i.  icon-component-value-fixer — icon key/render safety
 *  4j.  as-const-boolean-keys — TS inference for nav arrays
 *  4k.  scroll-smooth fixers — CSS + HTML preview compat
 *  4l.  tier2-preview-basepath — next.config basePath injection
 *  5.   syntax-validator   — esbuild transform check (async)
 *  6.   jsx-checker        — tag matching + missing imports/exports
 *  7.   dep-completer      — collect third-party dependencies
 *  7b.  dep-merge          — merge collected deps into package.json
 *  8.   security checks    — sanitize suspicious payloads
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
  context?: AutoFixContext,
): Promise<AutoFixResult> {
  const allFixes: FixEntry[] = [];
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
  // F2 SDK guard is opt-in via explicit previewPolicy — legacy callers
  // without a buildSpec leave it disabled so we don't surprise them.
  const tier3GuardActive = context?.previewPolicy === "fidelity2";

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
            category: "mechanical",
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

    // 1b. tier3-sdk-guard-fixer (F2 only) — strip backend SDK imports the
    // model emitted in design phase. Run before import-validator so it
    // doesn't try to "fix" imports we're about to remove.
    if (tier3GuardActive && isTsxOrJsx) {
      try {
        const guardResult = fixTier3SdkImports(currentCode);
        if (guardResult.removedModules.length > 0) {
          currentCode = guardResult.code;
          allFixes.push({
            fixer: "tier3-sdk-guard-fixer",
            category: "mechanical",
            description: `Removed F2 tier-3 SDK imports: ${guardResult.removedModules.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] tier3-sdk-guard-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (isTsxOrJsx) {
      // 2. import-validator
      try {
        const importResult = runImportValidator(currentCode);
        currentCode = importResult.code;
        for (const fix of importResult.fixes) {
          allFixes.push({ ...fix, category: "mechanical", file: file.path });
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
            category: "mechanical",
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
            category: "mechanical",
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
            category: "mechanical",
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
            category: "mechanical",
            description: 'Added missing `import Image from "next/image"`',
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] next-image-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3e. next-og-image-response-import-fixer — add next/og when ImageResponse is used without import
      try {
        const nextOgResult = fixNextOgImageResponseImport(currentCode);
        if (nextOgResult.fixed) {
          currentCode = nextOgResult.code;
          allFixes.push({
            fixer: "next-og-image-response-import-fixer",
            category: "mechanical",
            description: 'Added missing `import { ImageResponse } from "next/og"`',
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] next-og-image-response-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3f. local-symbol-import-fixer — import shared local config/data symbols when uniquely exported
      try {
        const symbolResult = fixMissingLocalSymbolImports(currentCode, file.path, exportIndex);
        if (symbolResult.fixed) {
          currentCode = symbolResult.code;
          allFixes.push({
            fixer: "local-symbol-import-fixer",
            category: "mechanical",
            description: `Added missing local symbol imports: ${symbolResult.addedSymbols.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] local-symbol-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3g. local-import-mismatch-fixer — reconcile local default/named import mismatches
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
            category: "mechanical",
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
            category: "mechanical",
            description: `Rewired local default imports to named imports: ${defaultToNamed.rewiredImports.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] local-import-mismatch-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3h. import-declaration-conflict-fixer — drop imports that shadow local declarations
      try {
        const conflictResult = fixImportedDeclarationConflicts(currentCode);
        if (conflictResult.fixed) {
          currentCode = conflictResult.code;
          allFixes.push({
            fixer: "import-declaration-conflict-fixer",
            category: "mechanical",
            description: `Removed conflicting import bindings: ${conflictResult.removedBindings.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] import-declaration-conflict-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3i. duplicate-import-binding-fixer — remove same identifier imported from two sources
      try {
        const dupResult = fixDuplicateImportBindings(currentCode, file.path);
        if (dupResult.fixed) {
          currentCode = dupResult.code;
          allFixes.push({
            fixer: "duplicate-import-binding-fixer",
            category: "mechanical",
            description: `Removed duplicate import bindings: ${dupResult.removedBindings.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] duplicate-import-binding-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4a. metadata-import-fixer — add missing Metadata type import in page/layout files
      try {
        const metaResult = fixMissingMetadataImport(currentCode, file.path);
        if (metaResult.fixed) {
          currentCode = metaResult.code;
          allFixes.push({
            fixer: "metadata-import-fixer",
            category: "mechanical",
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
            category: "mechanical",
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
            category: "mechanical",
            description: "Removed conflicting local cn import from @/lib/utils",
            file: file.path,
          });
        }
        const cnResult = fixMissingCnImport(currentCode, file.path);
        if (cnResult.fixed) {
          currentCode = cnResult.code;
          allFixes.push({
            fixer: "cn-import-fixer",
            category: "mechanical",
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
            category: "mechanical",
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
            category: "mechanical",
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
            category: "mechanical",
            description: `Replaced ${fontResult.count} Tailwind font-[family-name:...] class(es) with inline style`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] tailwind-font-arbitrary-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4g. font-import-fixer — layout font imports
      if (file.path.match(/(^|\/).*layout\.(tsx|jsx)$/i)) {
        try {
          const fontResult2 = fixFontImport(currentCode, file.path);
          if (fontResult2.fixed) {
            currentCode = fontResult2.code;
            for (const fix of fontResult2.fixes) {
              allFixes.push({
                fixer: fix.fixer,
                category: "mechanical",
                description: fix.description,
                file: fix.file ?? file.path,
              });
            }
          }
        } catch (err) {
          allWarnings.push(
            `[${file.path}] font-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 4h. metadata-client-conflict-fixer
      try {
        const metaClientResult = fixMetadataClientConflict(currentCode, file.path);
        if (metaClientResult.fixed) {
          currentCode = metaClientResult.code;
          allFixes.push(...metaClientResult.fixes);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] metadata-client-conflict-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4i. icon-component-value-fixer
      try {
        const iconResult = fixIconComponentValueMisuse(currentCode, file.path);
        if (iconResult.fixed) {
          currentCode = iconResult.code;
          allFixes.push(...iconResult.fixes);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] icon-component-value-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4j. as-const-boolean-keys
      try {
        const asConstResult = fixAsConstBooleanKeys(currentCode, file.path);
        if (asConstResult.fixed) {
          currentCode = asConstResult.code;
          for (const fix of asConstResult.fixes) {
            allFixes.push({ ...fix, category: "mechanical" });
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] as-const-boolean-keys threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4k. scroll-smooth HTML fixer
      if (HTML_SCROLL_SMOOTH_RE.test(currentCode)) {
        try {
          const before = currentCode;
          currentCode = currentCode.replace(
            HTML_SCROLL_SMOOTH_RE,
            (_, pre: string, post: string) => {
              const cleaned = `${pre}${post}`.replace(/\s{2,}/g, " ").replace(/"\s+"/, '"');
              return cleaned.replace(/<html\b/, '<html data-scroll-behavior="smooth"');
            },
          );
          if (currentCode !== before) {
            allFixes.push({
              fixer: "scroll-smooth-html-fixer",
              category: "mechanical",
              description: 'Replaced scroll-smooth className with data-scroll-behavior="smooth" on <html> for Next.js 16 compatibility',
              file: file.path,
            });
          }
        } catch (err) {
          allWarnings.push(
            `[${file.path}] scroll-smooth-html-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
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
          allFixes.push({ ...fix, category: "mechanical", file: file.path });
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
          allFixes.push({ ...fix, category: "mechanical", file: file.path });
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

    // 4l. tier2-preview-basepath — next.config basePath injection (runs on config files)
    if (NEXT_CONFIG_FILE_RE.test(file.path.replace(/\\/g, "/"))) {
      try {
        const basePathResult = ensureTier2PreviewBasePathInNextConfig(currentCode, file.path);
        if (basePathResult.fixed) {
          currentCode = basePathResult.code;
          allFixes.push({
            fixer: "tier2-preview-basepath-next-config",
            category: "mechanical",
            description: "Injected conditional basePath from SAJTMASKIN_PREVIEW_BASE_PATH for preview-host URLs",
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] tier2-preview-basepath threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 4k-css. scroll-smooth CSS fixer (for .css files)
    if (/\.css$/i.test(file.path) && CSS_SCROLL_SMOOTH_RE.test(currentCode)) {
      const before = currentCode;
      currentCode = currentCode.replace(CSS_SCROLL_SMOOTH_RE, "scroll-behavior: auto");
      if (currentCode !== before) {
        allFixes.push({
          fixer: "scroll-smooth-css-fixer",
          category: "mechanical",
          description: "Replaced scroll-behavior: smooth with scroll-behavior: auto in CSS for preview compatibility",
          file: file.path,
        });
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
            category: "mechanical",
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
  const allFixes: FixEntry[] = [];
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
