import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { runImportValidatorGuarded } from "./import-validator";
import { fixReactAndNavigationImports } from "./rules/react-import-consolidated";
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
import { countParseErrors, GUARDABLE_EXT_RE } from "./rules/import-binding-ast";
import { fixDuplicateImportBindings } from "./rules/duplicate-import-binding-fixer";
import { fixDuplicateImportAndLocalTypeCollision } from "./rules/duplicate-import-local-type-collision-fixer";
import { fixGlobalShadowingImports } from "./rules/global-shadow-import-fixer";
import { fixLucideImageMisuse, fixLucideLinkMisuse } from "./rules/lucide-misuse-fixer";
import { fixTailwindApplyOfComponents } from "./rules/tailwind-apply-component-fixer";
import { fixAsConstBooleanKeys } from "./rules/as-const-boolean-keys";
import { fixR3FVectorTuples } from "./rules/r3f-vector-tuple-fixer";
import { fixTypeOnlyImports } from "./rules/type-only-import-fixer";
import { fixValueUsedFromTypeImport } from "./rules/value-used-from-type-import-fixer";
import { fixImportAliasTypeHybrid } from "./rules/import-alias-type-syntax-fixer";
import {
  fixCnImportConflict,
  fixMissingMetadataImport,
  fixMissingMetadataRouteImport,
  fixMissingCnImport,
} from "./rules/metadata-import-fixer";
import { fixFontImport } from "./rules/font-import-fixer";
import { fixTier3SdkImports } from "./rules/tier3-sdk-guard-fixer";
import { fixEscapeLeakage } from "./rules/escape-leakage-fixer";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import { runJsxChecker } from "./jsx-checker";
import { fixDomBuiltinJsxTags } from "./rules/dom-builtin-jsx-fixer";
import {
  mergeMissingDependenciesIntoPackageJson,
  resolveCapabilityDependencies,
  runDepCompleter,
} from "./dep-completer";
import { validateAndUpgradeDeps } from "./dep-version-validator";
import { runSecurityChecks } from "../security/run-security-checks";
import { DETERMINISTIC_AUTOFIX_MAX_PASSES } from "../defaults";
import { toFixEntries, type FixEntry, type FixEntryDraft } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @deprecated Use `FixEntry` from `./types` for new code. */
export type AutoFixEntry = Omit<FixEntryDraft, "category" | "lane">;

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
   * unless `previewPolicy === "fidelity3"`. Absent/undefined is treated
   * as F2 — preview-blocking SDK leakage is the bigger risk than an
   * occasional false-positive strip in test harnesses.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
  /**
   * Canonical capability ids for deterministic dependency-injection.
   * Example: `visual-3d` -> `three` + `@react-three/fiber` + `@react-three/drei`.
   */
  requestedCapabilities?: string[];
  /**
   * Scaffold id picked by orchestrate. Combined with `variantId` it lets
   * `font-import-fixer` materialize the chosen variant's `fontPairings[0]`
   * into baseline `app/layout.tsx` files instead of relying on the LLM
   * to swap `Inter`. Absent => no-op (safe default for eval/repair).
   */
  scaffoldId?: string | null;
  /**
   * Scaffold-variant id picked by orchestrate (or carried over from a
   * locked snapshot on follow-ups). Used together with `scaffoldId` to
   * resolve the variant's first font pair.
   */
  variantId?: string | null;
}

const CLIENT_HOOKS =
  /\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|useTransition|useOptimistic)\b/;
const EVENT_HANDLERS =
  /\b(onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseEnter|onMouseLeave)\b/;
const BROWSER_APIS =
  /\b(window\.|document\.|localStorage|sessionStorage|navigator\.)\b/;
const USE_CLIENT_RE = /^["']use client["'];?\s*$/;

function isClientExtension(filename: string): boolean {
  return /\.(tsx|jsx)$/.test(filename);
}

function hasUseClientDirective(code: string): boolean {
  const lines = code.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    return USE_CLIENT_RE.test(trimmed);
  }
  return false;
}

function needsUseClient(code: string): boolean {
  return (
    CLIENT_HOOKS.test(code) ||
    EVENT_HANDLERS.test(code) ||
    BROWSER_APIS.test(code)
  );
}

function fixUseClient(
  code: string,
  filename: string,
): { code: string; fixed: boolean } {
  if (!isClientExtension(filename)) {
    return { code, fixed: false };
  }

  if (hasUseClientDirective(code)) {
    return { code, fixed: false };
  }

  if (!needsUseClient(code)) {
    return { code, fixed: false };
  }

  return { code: `"use client";\n\n${code}`, fixed: true };
}

const FONT_FAMILY_ARBITRARY_RE =
  /className="([^"]*)font-\[family-name:var\(--([a-zA-Z0-9-]+)\)\]([^"]*)"/g;

function fixTailwindFontArbitrary(
  code: string,
): { code: string; fixed: boolean; count: number } {
  let count = 0;

  const result = code.replace(
    FONT_FAMILY_ARBITRARY_RE,
    (_match, before: string, varName: string, after: string) => {
      count++;
      const cleanBefore = before.trim();
      const cleanAfter = after.trim();
      const remainingClasses = [cleanBefore, cleanAfter]
        .filter(Boolean)
        .join(" ");

      const classAttr = remainingClasses ? `className="${remainingClasses}"` : "";
      const styleAttr = `style={{ fontFamily: "var(--${varName})" }}`;

      return [classAttr, styleAttr].filter(Boolean).join(" ");
    },
  );

  return { code: result, fixed: count > 0, count };
}

interface SyntaxValidation {
  valid: boolean;
  errors: Array<{ line: number; column: number; message: string }>;
}

type Loader = "tsx" | "ts" | "jsx" | "js" | "css";

const EXT_TO_LOADER: Record<string, Loader> = {
  ".tsx": "tsx",
  ".ts": "ts",
  ".jsx": "jsx",
  ".js": "js",
  ".css": "css",
};

function inferLoader(filename: string): Loader | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return undefined;
  return EXT_TO_LOADER[filename.slice(dot)];
}

async function getEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    return null;
  }
}

async function validateSyntax(
  code: string,
  filename: string,
): Promise<SyntaxValidation> {
  const loader = inferLoader(filename);
  if (!loader) return { valid: true, errors: [] };

  const esbuild = await getEsbuild();
  if (!esbuild) return { valid: true, errors: [] };

  try {
    await esbuild.transform(code, {
      loader,
      jsx: loader === "tsx" || loader === "jsx" ? "preserve" : undefined,
      logLevel: "silent",
    });
    return { valid: true, errors: [] };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "errors" in err &&
      Array.isArray((err as { errors: unknown[] }).errors)
    ) {
      const failure = err as {
        errors: Array<{ text: string; location?: { line: number; column: number } | null }>;
      };
      return {
        valid: false,
        errors: failure.errors.map((e) => ({
          line: e.location?.line ?? 0,
          column: e.location?.column ?? 0,
          message: e.text,
        })),
      };
    }
    return {
      valid: false,
      errors: [{ line: 0, column: 0, message: String(err) }],
    };
  }
}

/**
 * Validity guard for a single mechanical fixer.
 *
 * A mechanical fixer must never leave a file LESS parseable than it found it.
 * Given the code `before` and `after` a fixer ran, this returns `after` unless
 * the fixer turned parseable input into UNPARSEABLE output (valid before,
 * invalid after) — in which case it returns `before` and records a warning.
 *
 * It deliberately does NOT revert when the input was already unparseable: that
 * breakage is upstream (model/stream output) and must stay visible to the
 * syntax-validator / preflight gate rather than be masked here.
 *
 * Net effect: a guarded fixer becomes "revert-only safe" — it can fix or
 * no-op, but it can never be the step that introduces a syntax error. This is
 * the defence-in-depth recommended by the autofix deep-audit (2026-06-24).
 */
/**
 * Default validator: the synchronous TypeScript parser. Dependency-free (TS is
 * a runtime dependency) and dialect-correct per extension, so it works in
 * production-style installs where the dev-only `esbuild` may be absent — and it
 * does NOT mis-flag valid `.jsx`/`.tsx` JSX as broken. Returns the
 * `SyntaxValidation` shape so the (still injectable) signature is unchanged.
 */
function validateSyntaxViaTsParser(code: string, filePath: string): SyntaxValidation {
  const errors = countParseErrors(code, filePath);
  return errors === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors: [{ line: 0, column: 0, message: `${errors} parse error(s)` }] };
}

export async function guardFixerSyntax(
  before: string,
  after: string,
  filePath: string,
  fixerId: string,
  warnings: string[],
  /**
   * Injectable for tests; defaults to the **TypeScript-parser** validator (no
   * dev-only esbuild reliance). Previously defaulted to esbuild, which is only
   * a dev/transitive dependency — in production-style installs `validateSyntax`
   * could silently fall back to `valid: true` for everything, letting a broken
   * jsx-checker output pass unreverted (Codex P2 finding on #237).
   */
  validate: (
    code: string,
    filePath: string,
  ) => SyntaxValidation | Promise<SyntaxValidation> = validateSyntaxViaTsParser,
): Promise<{ code: string; reverted: boolean }> {
  if (after === before) return { code: after, reverted: false };
  if (!GUARDABLE_EXT_RE.test(filePath)) return { code: after, reverted: false };

  const afterResult = await validate(after, filePath);
  if (afterResult.valid) return { code: after, reverted: false };

  const beforeResult = await validate(before, filePath);
  if (!beforeResult.valid) {
    // Pre-existing breakage — not this fixer's fault. Keep `after`.
    return { code: after, reverted: false };
  }

  warnings.push(
    `[${filePath}] ${fixerId} reverted: it made a parseable file unparseable ` +
      `(${afterResult.errors[0]?.message ?? "syntax error"}) — kept pre-fixer content`,
  );
  return { code: before, reverted: true };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Regex constants shared with repair-generated-files.ts (consolidated here)
// ---------------------------------------------------------------------------

const HTML_SCROLL_SMOOTH_RE = /(<html\b[^>]*?\bclassName=["'][^"']*)\bscroll-smooth\b([^"']*["'])/;
const CSS_SCROLL_SMOOTH_RE = /scroll-behavior:\s*smooth/g;
// Local gate mirror for the tier2-preview-base-path fixer (fixer itself does
// the same check, but this lets the pipeline skip the function call on
// irrelevant files).
const NEXT_CONFIG_FILE_RE = /(^|\/)next\.config\.(ts|mts)$/i;

// ---------------------------------------------------------------------------
// Per-file fixers extracted into rules/ in 2026-04-21:
//   rules/metadata-client-conflict-fixer.ts → fixMetadataClientConflict
//   rules/icon-component-value-fixer.ts     → fixIconComponentValueMisuse
//   rules/tier2-preview-base-path-fixer.ts  → ensureTier2PreviewBasePathInNextConfig
// Re-exported for existing callers (repair-generated-files.ts).
// ---------------------------------------------------------------------------

import { fixMetadataClientConflict } from "./rules/metadata-client-conflict-fixer";
import { fixIconComponentValueMisuse } from "./rules/icon-component-value-fixer";
import { ensureTier2PreviewBasePathInNextConfig } from "./rules/tier2-preview-base-path-fixer";

// Re-export for other callers (repair-generated-files.ts) that still import
// from the pipeline module.
export {
  fixMetadataClientConflict,
  fixIconComponentValueMisuse,
  ensureTier2PreviewBasePathInNextConfig,
};

/**
 * Run all mechanical (deterministic) fixers sequentially on accumulated content.
 *
 * ─── Fixer-family map (so future readers don't think it's one big blob) ───
 *
 *  Each fixer is a small pure function with a SPECIFIC failure mode it
 *  catches. Multiple "import" fixers exist because LLM output breaks
 *  imports in subtly different ways and each fixer is the smallest
 *  correct unit:
 *
 *  • Adding a missing import    → react-import-fixer + react-hook-import-fixer
 *    when the symbol is used      + nextjs-navigation-import-fixer (all three
 *    but never imported.          fronted by `rules/react-import-consolidated.ts`
 *                                  — one implementation, three FixEntry IDs for
 *                                  stable telemetry), react-type-import-fixer,
 *                                  next-image-import-fixer,
 *                                  next-og-image-response-import-fixer,
 *                                  metadata-import-fixer, metadata-route-import-fixer,
 *                                  cn-import-fixer, font-import-fixer.
 *
 *  • Wrong source for an       → tier3-sdk-guard-fixer (strips backend
 *    existing import.              SDKs in F2), lucide-misuse-fixer (lucide
 *                                   `Link`/`Image` re-routed to next/*).
 *
 *  • Cross-file import         → local-symbol-import-fixer (add missing
 *    reconciliation that            local imports), local-named-import-default-fixer
 *    needs the WHOLE project        and local-default-import-fixer (named ↔ default
 *    to decide.                     mismatch when other file's export shape
 *                                    contradicts the import shape),
 *                                    import-declaration-conflict-fixer (drop
 *                                    imports that shadow a local declaration),
 *                                    duplicate-import-binding-fixer (same
 *                                    identifier from two sources).
 *
 *  These five "cross-file" fixers look redundant but they're not — each
 *  encodes a different decision predicate and they're cheap to run.
 *  Consolidating them into one pass would force a more complex shared
 *  state machine without measurable savings; the current split makes
 *  each rule trivially auditable. If you ARE going to consolidate them
 *  later, do it AFTER you have telemetry showing redundant work
 *  (counters in `countByFixer(...)`), not before.
 *
 * Fixer order:
 *  0.   escape-leakage-fixer — unwrap JSON-double-encoded file content
 *  1.   use-client-fixer   — prepend "use client" when client APIs detected
 *  2.   import-validator   — fix shadcn import paths
 *  3.   react-import-consolidated — single pass that adds missing React
 *         default + React hooks + next/navigation symbols (emits three
 *         FixEntry IDs: react-import-fixer, react-hook-import-fixer,
 *         nextjs-navigation-import-fixer)
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
 *  4j-r3f. r3f-vector-tuple-fixer — `as const` on R3F position/scale/rotation/args
 *  4k.  scroll-smooth fixers — CSS + HTML preview compat
 *  4l.  tier2-preview-basepath — next.config basePath injection
 *  5.   syntax-validator   — esbuild transform check (async)
 *  6.   jsx-checker        — tag matching + missing imports/exports
 *  7.   dep-completer      — collect third-party dependencies
 *  7b.  dep-merge          — merge collected deps into package.json
 *  7c.  dep-version-validator — verify deps against live npm registry,
 *                                bump invalid majors to ^latest. Last line of
 *                                defense against "vit sida pga npm install ENOENT".
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
  const allFixes: FixEntryDraft[] = [];
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
  // F2 SDK guard runs whenever we are NOT in F3. Backend SDK imports leaking
  // into a design-phase build are a hard preview-blocker, so absent
  // `previewPolicy` defaults to "guard on" — legacy callers that genuinely
  // want F3 semantics must opt in explicitly.
  const tier3GuardActive = context?.previewPolicy !== "fidelity3";

  for (const file of project.files) {
    const isTsxOrJsx =
      file.language === "tsx" || file.language === "jsx" ||
      file.language === "ts" || file.language === "js";

    let currentCode = file.content;

    // 0. escape-leakage-fixer — detect and unwrap JSON-double-encoded
    // file content (literal `\n`, `\\"`, optionally surrounded by outer
    // quotes) BEFORE any downstream fixer runs. Otherwise rules that
    // split on `\r?\n` see the entire file as a single line and either
    // do nothing (silent skip) or, worse, generate over-escaped output.
    // Runs on every language — env files, JSON, .ts, .tsx alike.
    try {
      const escapeResult = fixEscapeLeakage(currentCode);
      if (escapeResult.fixed) {
        currentCode = escapeResult.code;
        allFixes.push({
          fixer: "escape-leakage-fixer",
          category: "mechanical",
          description: `Unwrapped JSON-double-encoded content (${escapeResult.kind}, recovered ${escapeResult.bytesRecovered} bytes)`,
          file: file.path,
        });
      }
    } catch (err) {
      allWarnings.push(
        `[${file.path}] escape-leakage-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

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
      // 2. import-validator — routed through the centralized guarded entry
      // (`runImportValidatorGuarded`) shared with the post-merge
      // `repairGeneratedFiles()` path. Its regex/line-based import surgery is
      // the highest-corruption-risk mechanical step per the audit, so the guard
      // reverts it (TS-parser check) if it ever turns parseable code
      // unparseable. This is the ONLY way import-validator runs in runtime.
      try {
        const importResult = runImportValidatorGuarded(currentCode, file.path);
        currentCode = importResult.code;
        if (!importResult.reverted) {
          for (const fix of importResult.fixes) {
            allFixes.push({ ...fix, category: "mechanical", file: file.path });
          }
        }
        for (const w of importResult.warnings) {
          allWarnings.push(`[${file.path}] ${w}`);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] import-validator threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3. Consolidated React + next/navigation import fixer (E5, OMTAG
      // fas 2·C). One implementation in `rules/react-import-consolidated.ts`
      // replaces three forked fixers (default React, React hooks, next/navigation
      // symbols). The single call returns per-flavor results so we still emit
      // three distinct `FixEntry`s — the fixer IDs, telemetry counters, and
      // registry rows they feed are unchanged.
      try {
        const consolidated = fixReactAndNavigationImports(currentCode);
        if (consolidated.fixed) {
          currentCode = consolidated.code;
          if (consolidated.consolidatedReactBindings.length > 0) {
            allFixes.push({
              fixer: "react-hook-import-fixer",
              category: "mechanical",
              description: `Consolidated duplicate react imports (deduped: ${consolidated.consolidatedReactBindings.join(", ")})`,
              file: file.path,
            });
          }
          if (consolidated.addedReactDefault) {
            allFixes.push({
              fixer: "react-import-fixer",
              category: "mechanical",
              description: "Added missing React import",
              file: file.path,
            });
          }
          if (consolidated.addedReactHooks.length > 0) {
            allFixes.push({
              fixer: "react-hook-import-fixer",
              category: "mechanical",
              description: `Added missing React hook imports: ${consolidated.addedReactHooks.join(", ")}`,
              file: file.path,
            });
          }
          if (consolidated.addedNavigationSymbols.length > 0) {
            allFixes.push({
              fixer: "nextjs-navigation-import-fixer",
              category: "mechanical",
              description: `Added missing next/navigation imports: ${consolidated.addedNavigationSymbols.join(", ")}`,
              file: file.path,
            });
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] react-import-consolidated threw: ${err instanceof Error ? err.message : String(err)}`,
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

      // 3c-alias-type-hybrid. import-alias-type-syntax-fixer — fix the
      // invalid `X as type Y` hybrid specifier that the LLM occasionally
      // emits. SWC rejects this outright so the file will not parse
      // otherwise. Runs BEFORE type-only-import-fixer so the downstream
      // conversion-to-`import type` sees a clean specifier list.
      try {
        const aliasHybridResult = fixImportAliasTypeHybrid(currentCode, file.path);
        if (aliasHybridResult.fixed) {
          currentCode = aliasHybridResult.code;
          for (const fix of aliasHybridResult.fixes) {
            allFixes.push(fix);
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] import-alias-type-syntax-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3c-typeonly. type-only-import-fixer — convert `import { X }` to
      // `import type { X }` when the binding is never used as a value
      // (TS2749 prevention). Empirical hit logged in
      // docs/plans/avklarat/P31-feature-runtime-envs-and-f3-toggle.md.
      try {
        const typeOnlyResult = fixTypeOnlyImports(currentCode, file.path);
        if (typeOnlyResult.fixed) {
          currentCode = typeOnlyResult.code;
          for (const fix of typeOnlyResult.fixes) {
            allFixes.push(fix);
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] type-only-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3c-valueusedfromtype. value-used-from-type-import-fixer — mirror of
      // type-only-import-fixer: convert `import type { X }` → `import { X }`
      // when X is used in a value position (JSX, function call, new, member
      // access). TS1361 prevention. Empirical hit 2026-04-23 (/showcase white
      // page). MUST run after type-only-import-fixer so we don't undo correct
      // conversions in the same pass.
      try {
        const valueUsedResult = fixValueUsedFromTypeImport(currentCode, file.path);
        if (valueUsedResult.fixed) {
          currentCode = valueUsedResult.code;
          for (const fix of valueUsedResult.fixes) {
            allFixes.push(fix);
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] value-used-from-type-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
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
        const conflictResult = fixImportedDeclarationConflicts(currentCode, file.path);
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

      // 3i-2. duplicate-import-local-type-collision-fixer — handle two
      // related patterns not covered by the binding-fixer above:
      //   (a) same-source default imports with different local names
      //       (e.g. `import X from "./m"; import Y from "./m";`)
      //   (b) an imported binding colliding with a local type alias /
      //       interface of the same name (duplicate-identifier error).
      // Empirical hit 2026-04-23 in components/showcase-gallery.tsx.
      try {
        const typeCollisionResult = fixDuplicateImportAndLocalTypeCollision(
          currentCode,
          file.path,
        );
        if (typeCollisionResult.fixed) {
          currentCode = typeCollisionResult.code;
          for (const fix of typeCollisionResult.fixes) {
            allFixes.push(fix);
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] duplicate-import-local-type-collision-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 3i-3. global-shadow-import-fixer (name-guard) — a LOCAL import whose
      // binding name shadows a JS/Web global (`import Date from "@/components/date"`).
      // AST-based: drops the binding when it is not used as a JSX component (so
      // `new Date()` resolves to the real global again), or aliases it when it
      // is rendered as `<Date .../>`. Never touches package imports such as
      // `import Image from "next/image"`.
      try {
        const shadowResult = fixGlobalShadowingImports(currentCode, file.path);
        if (shadowResult.fixed) {
          currentCode = shadowResult.code;
          const parts: string[] = [];
          if (shadowResult.removed.length > 0) {
            parts.push(`removed global-shadowing imports: ${shadowResult.removed.join(", ")}`);
          }
          if (shadowResult.renamed.length > 0) {
            parts.push(
              `aliased global-shadowing imports: ${shadowResult.renamed
                .map((r) => `${r.from}→${r.to}`)
                .join(", ")}`,
            );
          }
          allFixes.push({
            fixer: "global-shadow-import-fixer",
            category: "mechanical",
            description: parts.join("; "),
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] global-shadow-import-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
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

      // 4g. font-import-fixer — layout font imports + variant font materialization
      if (file.path.match(/(^|\/).*layout\.(tsx|jsx)$/i)) {
        try {
          const fontResult2 = fixFontImport(currentCode, file.path, {
            scaffoldId: context?.scaffoldId ?? null,
            variantId: context?.variantId ?? null,
          });
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

      // 4j-r3f. r3f-vector-tuple-fixer — promote 3-number arrays to tuples in
      // React Three Fiber object fields so TS does not widen them to number[]
      // (TS2322 at <mesh position={...}>). Empirical hit logged in
      // docs/plans/active/P27-r3f-tuple-and-repair-feedback.md.
      try {
        const r3fResult = fixR3FVectorTuples(currentCode, file.path);
        if (r3fResult.fixed) {
          currentCode = r3fResult.code;
          for (const fix of r3fResult.fixes) {
            allFixes.push(fix);
          }
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] r3f-vector-tuple-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
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

      // 5. syntax-validator (esbuild transform check)
      try {
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

      // 5.5. dom-builtin-jsx-fixer — rewrite DOM-interface JSX tags like
      // <HTMLFormElement> to their lowercase HTML equivalents (<form>).
      // MUST run before jsx-checker: otherwise jsx-checker will either warn
      // and leave the bad tag, or (if the name ever left the denylist)
      // try to generate a stub import for it. Empirical hit 2026-04-23.
      try {
        const domBuiltinResult = fixDomBuiltinJsxTags(currentCode, file.path);
        if (domBuiltinResult.fixed) {
          currentCode = domBuiltinResult.code;
          for (const fix of domBuiltinResult.fixes) {
            allFixes.push(fix);
          }
        }
        for (const w of domBuiltinResult.warnings) {
          allWarnings.push(w);
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] dom-builtin-jsx-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 6. jsx-checker (fix missing imports & default export) — validity-guarded:
      // it merges/inserts import lines via regex (e.g. lucide merge), so revert
      // if it ever turns parseable code unparseable.
      try {
        const beforeJsxChecker = currentCode;
        const jsxResult = runJsxChecker(currentCode, file.path);
        const guarded = await guardFixerSyntax(
          beforeJsxChecker,
          jsxResult.code,
          file.path,
          "jsx-checker",
          allWarnings,
        );
        currentCode = guarded.code;
        if (!guarded.reverted) {
          for (const fix of jsxResult.fixes) {
            allFixes.push({ ...fix, category: "mechanical", file: file.path });
          }
          for (const w of jsxResult.warnings) {
            allWarnings.push(`[${file.path}] ${w}`);
          }
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

    // 4l-css. tailwind-apply-component-fixer (for .css files) — Tailwind v4
    // forbids `@apply` of `@layer components` classes. Detect and inline.
    // This is the most common cause of "Cannot apply unknown utility class"
    // build errors on freshly generated sites.
    if (/\.css$/i.test(file.path)) {
      try {
        const applyResult = fixTailwindApplyOfComponents(currentCode);
        if (applyResult.fixed) {
          currentCode = applyResult.code;
          allFixes.push({
            fixer: "tailwind-apply-component-fixer",
            category: "mechanical",
            description: `Inlined Tailwind v4 @apply of ${applyResult.replacedClasses.length} component-layer class(es): ${applyResult.replacedClasses.join(", ")}`,
            file: file.path,
          });
        }
      } catch (err) {
        allWarnings.push(
          `[${file.path}] tailwind-apply-component-fixer threw: ${err instanceof Error ? err.message : String(err)}`,
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

  // 7b. merge collected dependencies into package.json.
  // Capability-driven dependency injection (plan-07 short): when the
  // orchestration metadata marks e.g. `visual-3d`, inject the dossier deps
  // deterministically even if the LLM forgot the imports.
  const capabilityDependencies = resolveCapabilityDependencies(
    context?.requestedCapabilities,
  );
  if (Object.keys(capabilityDependencies).length > 0) {
    allDependencies = { ...capabilityDependencies, ...allDependencies };
  }
  if (Object.keys(allDependencies).length > 0) {
    const pkgIdx = fixedFiles.findIndex((f) => f.path === "package.json");
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(fixedFiles[pkgIdx].content) as Record<string, unknown>;
        const { packageJson: mergedPackageJson, mergedCount } =
          mergeMissingDependenciesIntoPackageJson(pkg, allDependencies);
        if (mergedCount > 0) {
          fixedFiles[pkgIdx] = {
            ...fixedFiles[pkgIdx],
            content: JSON.stringify(mergedPackageJson, null, 2),
          };
          allFixes.push({
            fixer: "dep-completer",
            category: "mechanical",
            description: `Pinned ${mergedCount} missing ${mergedCount === 1 ? "dependency" : "dependencies"} in package.json`,
            file: "package.json",
          });
        }
      } catch {
        allWarnings.push("[package.json] dep-merge skipped: invalid JSON");
      }
    }
  }

  // 7c. dep-version-validator — verifierar package.json-deps mot npm-registret
  // och rättar majors som inte finns publicerade (t.ex. LLM-hallucinerad version
  // ELLER stale entry i KNOWN_PACKAGES). Är registret otillgängligt lämnas
  // specen orörd. Detta är sista skyddet mot "vit sida pga `npm install` ENOENT".
  {
    const pkgIdx = fixedFiles.findIndex((f) => f.path === "package.json");
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(fixedFiles[pkgIdx].content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const hasDeps =
          (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
          (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);
        if (hasDeps) {
          const result = await validateAndUpgradeDeps({
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
          });
          if (result.corrections.length > 0) {
            const updated = {
              ...pkg,
              ...(pkg.dependencies ? { dependencies: result.dependencies } : {}),
              ...(pkg.devDependencies ? { devDependencies: result.devDependencies } : {}),
            };
            fixedFiles[pkgIdx] = {
              ...fixedFiles[pkgIdx],
              content: JSON.stringify(updated, null, 2),
            };
            for (const c of result.corrections) {
              allFixes.push({
                fixer: "dep-version-validator",
                category: "mechanical",
                description: `Bumped ${c.pkg} from ${c.from} to ${c.to} (${c.reason})`,
                file: "package.json",
              });
            }
          }
        }
      } catch (err) {
        allWarnings.push(
          `dep-version-validator threw: ${err instanceof Error ? err.message : String(err)}`,
        );
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
    fixes: toFixEntries(allFixes, "mechanical"),
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
export function rebuildContent(
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
