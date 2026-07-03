import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { isTier3SdkModule } from "@/lib/integrations/tier3-sdk-deny";
import { KNOWN_MODULE_SPECIFIERS } from "../import-validator";
import { classifyShadcnLucideCollisionUsage } from "./lucide-misuse-fixer";
import type { AutoFixEntry } from "../pipeline";

/**
 * Deterministic TS2304 known-import fixer.
 *
 * Unlike the JSX-scan fixers in `import-validator.ts` (which only see
 * `<Tag/>` usages), this rule is *diagnostic-driven*: it consumes the tsc
 * diagnostics that the quality gate already produced and, for every
 * `Cannot find name 'X'` error (TS2304, plus the TS2552 "did you mean"
 * variant), adds the canonical import when `X` is a name we can resolve with
 * certainty:
 *
 *   - any icon in `LUCIDE_ICONS`            → `import { X } from "lucide-react"`
 *   - any name in `KNOWN_MODULE_SPECIFIERS` → its canonical module
 *   - `Image` / `Link`                      → default import from next/image|link
 *
 * Because it works off diagnostics rather than scanning JSX, it catches BOTH
 * `<Clapperboard />` (JSX) AND `const Icon = Clapperboard;` (non-JSX) usages —
 * the latter is exactly the gap that the post-merge `repairGeneratedFiles()`
 * JSX scan still leaves behind.
 *
 * Unknown names are left untouched on purpose so the LLM fixer can handle the
 * genuinely ambiguous cases (typos, local symbols, third-party APIs).
 */

export interface Ts2304Diagnostic {
  /** Project-relative file path the diagnostic points at. */
  file: string;
  /** Diagnostic message text (without the `error TSxxxx:` prefix). */
  message: string;
}

export interface Ts2304KnownImportAddition {
  file: string;
  name: string;
  module: string;
}

export interface Ts2304KnownImportFixResult {
  code: string;
  fixes: AutoFixEntry[];
  addedImports: Ts2304KnownImportAddition[];
}

type ResolvedImport = { module: string; kind: "named" | "default" | "type-named" };

const CANNOT_FIND_NAME_RE = /Cannot find name '([^']+)'/;

// `Image` and `Link` live in KNOWN_MODULE_SPECIFIERS but are DEFAULT exports of
// their modules, so they must be emitted as `import X from "..."` rather than a
// named import. Resolve them explicitly before the named-specifier scan.
const DEFAULT_IMPORT_NAMES: Record<string, string> = {
  Image: "next/image",
  Link: "next/link",
};

// Clerk server-side symbols. These are unambiguous server APIs (used in
// `middleware.ts` and route handlers) that production generations reference
// without importing — `Cannot find name 'clerkMiddleware'` / `createRouteMatcher`.
// Client-side Clerk symbols (`useAuth`, `ClerkProvider`, `<SignIn />`) live in
// `@clerk/nextjs` and are intentionally NOT resolved here to avoid guessing the
// wrong entrypoint.
const CLERK_SERVER_IMPORTS = new Set([
  "clerkMiddleware",
  "createRouteMatcher",
  "getAuth",
  "currentUser",
  "auth",
  "clerkClient",
]);

// Named symbols resolved to a package ONLY here (diagnostic-driven). These are
// deliberately NOT added to `KNOWN_MODULE_SPECIFIERS`, because that map also
// feeds the BLIND orphan-import guesser (`guessModuleForSpecifiers`), whose
// `some()` match would pull unrelated names into the package (e.g. a corrupted
// `{ toast, Clapperboard }` block wrongly closing as `from "sonner"` — Bugbot).
// The diagnostic path is exact (tsc names the missing symbol), so it is safe.
//
// `toast`: the sonner toast FUNCTION is the #1 recurring prod fault
// (`Cannot find name 'toast'`). The `<Toaster />` wrapper is separately handled
// via SHADCN_COMPONENTS (`@/components/ui/sonner`). sonner is not a tier-3 SDK,
// so this resolves in both F2 and F3.
const NAMED_PACKAGE_IMPORTS: Record<string, string> = {
  toast: "sonner",
};

// Type-only exports resolved as `import type { X } from "module"` (kind
// `type-named`). Value-importing these would bind a non-existent runtime
// export (TS2305 / runtime import error), so they get their own emission
// path. `LucideIcon` is the recurring prod name (`type Feature = { icon:
// LucideIcon }`); scope stays narrow on purpose — ambiguous type names that
// exist in several libraries (e.g. `SVGAttributes`, also in react) are NOT
// mapped here and stay with the LLM fixer.
const TYPE_NAMED_PACKAGE_IMPORTS: Record<string, string> = {
  LucideIcon: "lucide-react",
};

/**
 * True for server-only files where a bare `Stripe` reference resolves to the
 * `stripe` package default export (`new Stripe(...)` in an API route). Gating by
 * path keeps us from importing the Node SDK into a client component.
 */
function isServerRouteFile(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const p = toPosixPath(filePath);
  return /\/api\//.test(p) || /(?:^|\/)route\.[tj]sx?$/.test(p);
}

/**
 * F2/F3 tier-3 gate around {@link resolveKnownImportRaw}. The F2 SDK guard
 * (`tier3-sdk-guard-fixer`) strips tier-3 backend SDK imports (stripe,
 * @clerk/nextjs/server, …) from F2 design previews. This resolver must NOT
 * re-introduce them after the guard, or an F2 version could be promoted with a
 * forbidden backend import (the promotion gate only runs tsc/lint/build, it does
 * not re-enforce the F2/F3 contract). So unless `allowTier3` (F3 / fidelity3),
 * any name that resolves to a tier-3 module is left residual — the gate then
 * blocks instead of silently promoting. Non-tier-3 modules (shadcn, lucide,
 * next/*) are unaffected. Default is F2-safe (`allowTier3 === false`).
 */
function resolveKnownImport(
  name: string,
  filePath?: string,
  allowTier3 = false,
  fileCode?: string,
): ResolvedImport | null {
  const resolved = resolveKnownImportRaw(name, filePath, fileCode);
  if (resolved && !allowTier3 && isTier3SdkModule(resolved.module)) {
    return null;
  }
  return resolved;
}

function resolveKnownImportRaw(
  name: string,
  filePath?: string,
  fileCode?: string,
): ResolvedImport | null {
  // KNOWN_MODULE_SPECIFIERS wins over lucide-react: `Image` and `Link` exist in
  // BOTH sets, but a non-JSX `Cannot find name 'Image'` almost always means the
  // Next component (`import Image from "next/image"`), not the lucide glyph.
  // Emitting the lucide named import would promote the wrong component and keep
  // failing on Next-specific props. So check the Next defaults and the known
  // module specifiers first, and only fall back to the lucide named import.
  if (DEFAULT_IMPORT_NAMES[name]) {
    return { module: DEFAULT_IMPORT_NAMES[name], kind: "default" };
  }
  // Stripe Node SDK — default export, server files only.
  if (name === "Stripe" && isServerRouteFile(filePath)) {
    return { module: "stripe", kind: "default" };
  }
  // Resend Node SDK — NAMED export (`import { Resend } from "resend"`),
  // server files only, mirroring the Stripe gating exactly (prod chat
  // cc10e7de v8: `new Resend(resendApiKey)` in app/api/contact/route.ts with
  // no import). `resend` is on the tier-3 deny list, so the F2/F3 gate in
  // `resolveKnownImport` keeps it residual outside fidelity3.
  if (name === "Resend" && isServerRouteFile(filePath)) {
    return { module: "resend", kind: "named" };
  }
  // Clerk server entrypoint — named imports.
  if (CLERK_SERVER_IMPORTS.has(name)) {
    return { module: "@clerk/nextjs/server", kind: "named" };
  }
  // Diagnostic-only named package imports (e.g. `toast` → sonner). See the
  // NAMED_PACKAGE_IMPORTS comment: kept out of KNOWN_MODULE_SPECIFIERS so the
  // blind guesser can't mis-attribute unrelated symbols.
  if (NAMED_PACKAGE_IMPORTS[name]) {
    return { module: NAMED_PACKAGE_IMPORTS[name], kind: "named" };
  }
  // Type-only exports → `import type { X }` emission.
  if (TYPE_NAMED_PACKAGE_IMPORTS[name]) {
    return { module: TYPE_NAMED_PACKAGE_IMPORTS[name], kind: "type-named" };
  }
  for (const [module, names] of Object.entries(KNOWN_MODULE_SPECIFIERS)) {
    if (names.includes(name)) return { module, kind: "named" };
  }
  // shadcn/ui components map to per-symbol subpaths (`@/components/ui/<file>`).
  // Several shadcn names collide with lucide glyphs (e.g. `Badge`, `Calendar`,
  // `Table`) — when a name is in BOTH registries, disambiguate from the file's
  // actual usage (M#badge1): children or `variant=`/`asChild` can only be the
  // shadcn component (a glyph would render children inside an <svg> — invalid
  // HTML → hydration mismatch), while icon-ish self-closing usage is the glyph.
  // Anything unclear (e.g. a bare `<Calendar />`) stays with the LLM fixer.
  const inShadcn = Object.prototype.hasOwnProperty.call(SHADCN_COMPONENTS, name);
  const inLucide = LUCIDE_ICONS.has(name);
  if (inShadcn && inLucide) {
    if (!fileCode) return null;
    const usage = classifyShadcnLucideCollisionUsage(fileCode, name);
    if (usage === "shadcn") {
      return { module: `@/components/ui/${SHADCN_COMPONENTS[name]}`, kind: "named" };
    }
    if (usage === "lucide") return { module: "lucide-react", kind: "named" };
    return null;
  }
  if (inShadcn) {
    return { module: `@/components/ui/${SHADCN_COMPONENTS[name]}`, kind: "named" };
  }
  if (inLucide) return { module: "lucide-react", kind: "named" };
  return null;
}

function extractMissingName(message: string): string | null {
  const match = message.match(CANNOT_FIND_NAME_RE);
  return match ? match[1] : null;
}

export type CannotFindNameResidualReason =
  | "tier3_gated"
  | "ambiguous_shadcn_lucide"
  | "unknown_name"
  | "not_applied";

/**
 * Classify WHY a cannot-find-name diagnostic stayed residual after the
 * deterministic known-import pass. Telemetry-only (M#imp1 prod archaeology):
 * lets `runDeterministicImportRepair` report per name whether the tier-3
 * F2 gate suppressed a resolvable SDK import (`tier3_gated` — e.g. Stripe /
 * Resend in a fidelity2 lane), the name was an unresolvable shadcn∩lucide
 * collision, the name is simply not in any registry, or the name resolved but
 * an injection guard skipped it (already imported / locally declared /
 * server-only module in a client file / self-import).
 */
export function classifyCannotFindNameResidual(params: {
  name: string;
  filePath: string;
  fileCode?: string;
  allowTier3: boolean;
}): CannotFindNameResidualReason {
  const raw = resolveKnownImportRaw(params.name, params.filePath, params.fileCode);
  if (raw) {
    if (!params.allowTier3 && isTier3SdkModule(raw.module)) return "tier3_gated";
    return "not_applied";
  }
  const inShadcn = Object.prototype.hasOwnProperty.call(SHADCN_COMPONENTS, params.name);
  const inLucide = LUCIDE_ICONS.has(params.name);
  if (inShadcn && inLucide) return "ambiguous_shadcn_lucide";
  return "unknown_name";
}

/**
 * True when `name` exists in ANY of the known-library registries this fixer
 * resolves from (Next defaults, Stripe, Clerk server, diagnostic-only package
 * imports, KNOWN_MODULE_SPECIFIERS, shadcn, lucide) — regardless of whether it
 * would actually resolve for a given file (tier-3 gating, shadcn∩lucide
 * ambiguity, path gating). Used by the deterministic import-repair to
 * classify a residual TS2304 name: known library (stays with this fixer /
 * the LLM) vs own project file vs unknown.
 */
export function isKnownLibraryImportName(name: string): boolean {
  if (DEFAULT_IMPORT_NAMES[name]) return true;
  if (name === "Stripe" || name === "Resend") return true;
  if (CLERK_SERVER_IMPORTS.has(name)) return true;
  if (NAMED_PACKAGE_IMPORTS[name]) return true;
  if (TYPE_NAMED_PACKAGE_IMPORTS[name]) return true;
  for (const names of Object.values(KNOWN_MODULE_SPECIFIERS)) {
    if (names.includes(name)) return true;
  }
  if (Object.prototype.hasOwnProperty.call(SHADCN_COMPONENTS, name)) return true;
  return LUCIDE_ICONS.has(name);
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/**
 * True when the file opens with a `"use client"` directive (allowing leading
 * comments/blank lines). Used to keep server-only modules out of client
 * components (BB#291): a stray TS2304 on e.g. `auth` in a client component
 * must NOT pull in `@clerk/nextjs/server` — that import is illegal in the
 * client bundle and trades one build error for another. Server pages,
 * middleware and route handlers (no directive) still resolve normally.
 *
 * Tolerates the directive variants Next.js accepts (Codex P2, PR #351):
 * a trailing `//`/`/* … *​/` comment after the directive, and full multi-line
 * block comments before it (tracked statefully — an inner block-comment line
 * does not have to start with `*`).
 */
function hasUseClientDirective(code: string): boolean {
  let inBlockComment = false;
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    return /^["']use client["']\s*;?\s*(?:\/\/.*|\/\*.*?\*\/\s*)?$/.test(trimmed);
  }
  return false;
}

/** Modules that must never be imported inside a `"use client"` file. */
const SERVER_ONLY_MODULES = new Set(["@clerk/nextjs/server", "stripe", "resend"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Names already bound by an import statement (default, named, namespace). */
function collectImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const line of code.split("\n")) {
    const named = line.match(/^\s*import\s+(?:type\s+)?\{([^}]+)\}/);
    if (named) {
      for (const spec of named[1].split(",")) {
        const aliased = spec.trim().match(/(\w+)\s+as\s+(\w+)/);
        const bound = aliased ? aliased[2] : spec.trim();
        if (bound) names.add(bound);
      }
    }
    const def = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)\s/);
    if (def) names.add(def[1]);
    const ns = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.add(ns[1]);
  }
  return names;
}

function nameAppearsInFile(code: string, name: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(code);
}

/**
 * True when the file already declares or re-exports `name` locally, so it must
 * not be imported from elsewhere. Guards against e.g. adding
 * `import { cn } from "@/lib/utils"` into `lib/utils.ts` itself (#201), and more
 * generally against a registry import shadowing a local declaration.
 */
export function fileDeclaresSymbol(code: string, name: string): boolean {
  const n = escapeRegExp(name);
  const declaration = new RegExp(
    `(?:^|\\n)\\s*export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b` +
      `|(?:^|\\n)\\s*(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b`,
  );
  if (declaration.test(code)) return true;
  // Re-export: `export { name }` / `export { x as name }`.
  return new RegExp(`export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(code);
}

/**
 * True when `module` (e.g. `@/lib/utils`) resolves to the file currently being
 * edited, which would produce a self-/circular-import. Only path-alias modules
 * (`@/…`, `~/…`) can point back at a project file; bare package specifiers
 * (`lucide-react`, `next/image`) never do.
 */
function moduleMatchesFile(module: string, filePath: string): boolean {
  if (!filePath) return false;
  let target: string | null = null;
  if (module.startsWith("@/") || module.startsWith("~/")) {
    target = module.slice(2);
  } else {
    return false;
  }
  const stripIndex = (value: string): string => value.replace(/\/index$/, "");
  const fileNoExt = stripIndex(toPosixPath(filePath).replace(/\.(tsx?|jsx?)$/, ""));
  return stripIndex(target) === fileNoExt;
}

/**
 * Add the resolved imports for `missingNames` into a single file's source.
 * Merges into an existing value named-import line for the same module when one
 * exists; otherwise inserts a fresh import after the existing import block.
 */
function addKnownImportsToFile(
  code: string,
  missingNames: string[],
  filePath = "",
  allowTier3 = false,
): { code: string; added: Array<{ name: string; module: string }> } {
  const alreadyImported = collectImportedNames(code);
  const namedByModule = new Map<string, string[]>();
  const typeNamedByModule = new Map<string, string[]>();
  const defaultImports: Array<{ name: string; module: string }> = [];
  const isClientFile = hasUseClientDirective(code);

  for (const name of missingNames) {
    if (alreadyImported.has(name)) continue;
    if (!nameAppearsInFile(code, name)) continue;
    // Never import a symbol the file already declares/exports locally — the
    // local declaration is the source of truth, not the registry. #201
    if (fileDeclaresSymbol(code, name)) continue;
    const resolved = resolveKnownImport(name, filePath, allowTier3, code);
    if (!resolved) continue;
    // BB#291: never inject a server-only module into a "use client" file.
    // Content-gated (not path-gated) so server components, middleware.ts and
    // route handlers keep resolving while client components leave the name
    // residual for the LLM fixer.
    if (isClientFile && SERVER_ONLY_MODULES.has(resolved.module)) continue;
    // Never import from a module that resolves to this same file (e.g. adding
    // `import { cn } from "@/lib/utils"` into lib/utils.ts → self-import). #201
    if (moduleMatchesFile(resolved.module, filePath)) continue;
    if (resolved.kind === "default") {
      defaultImports.push({ name, module: resolved.module });
    } else if (resolved.kind === "type-named") {
      const bucket = typeNamedByModule.get(resolved.module) ?? [];
      if (!bucket.includes(name)) bucket.push(name);
      typeNamedByModule.set(resolved.module, bucket);
    } else {
      const bucket = namedByModule.get(resolved.module) ?? [];
      if (!bucket.includes(name)) bucket.push(name);
      namedByModule.set(resolved.module, bucket);
    }
  }

  const lines = code.split("\n");
  const added: Array<{ name: string; module: string }> = [];
  const newImports: string[] = [];

  for (const [module, names] of namedByModule) {
    // Merge only into a *value* named import (`import { ... }`), never a
    // `import type { ... }` line — otherwise a value (e.g. a JSX icon) would
    // become type-only and trip TS1361 at the usage site.
    const existingIdx = lines.findIndex(
      (line) =>
        (line.includes(`from "${module}"`) || line.includes(`from '${module}'`)) &&
        /^\s*import\s+\{/.test(line) &&
        !/^\s*import\s+type\s/.test(line),
    );

    if (existingIdx >= 0) {
      const braceMatch = lines[existingIdx].match(
        /^(\s*import\s+\{)([^}]*)(\}\s*from\s+.+)$/,
      );
      if (braceMatch) {
        const existingSpecs = braceMatch[2]
          .split(",")
          .map((spec) => spec.trim())
          .filter(Boolean);
        const toAdd = names.filter((name) => !existingSpecs.includes(name));
        if (toAdd.length > 0) {
          lines[existingIdx] = `${braceMatch[1]}${braceMatch[2].trimEnd()}, ${toAdd.join(", ")} ${braceMatch[3]}`;
          for (const name of toAdd) added.push({ name, module });
        }
        continue;
      }
    }

    newImports.push(`import { ${names.join(", ")} } from "${module}"`);
    for (const name of names) added.push({ name, module });
  }

  // Type-only names merge ONLY into an existing `import type { ... }` line for
  // the same module — never into a value import (a type-only export has no
  // runtime binding; a value merge would emit TS2305 / a runtime import error).
  for (const [module, names] of typeNamedByModule) {
    const existingIdx = lines.findIndex(
      (line) =>
        (line.includes(`from "${module}"`) || line.includes(`from '${module}'`)) &&
        /^\s*import\s+type\s+\{/.test(line),
    );

    if (existingIdx >= 0) {
      const braceMatch = lines[existingIdx].match(
        /^(\s*import\s+type\s+\{)([^}]*)(\}\s*from\s+.+)$/,
      );
      if (braceMatch) {
        const existingSpecs = braceMatch[2]
          .split(",")
          .map((spec) => spec.trim())
          .filter(Boolean);
        const toAdd = names.filter((name) => !existingSpecs.includes(name));
        if (toAdd.length > 0) {
          lines[existingIdx] = `${braceMatch[1]} ${[...existingSpecs, ...toAdd].join(", ")} ${braceMatch[3]}`;
          for (const name of toAdd) added.push({ name, module });
        }
        continue;
      }
    }

    newImports.push(`import type { ${names.join(", ")} } from "${module}"`);
    for (const name of names) added.push({ name, module });
  }

  for (const { name, module } of defaultImports) {
    const hasDefaultFromModule = lines.some((line) =>
      new RegExp(
        `^\\s*import\\s+[A-Za-z_$][\\w$]*\\s+from\\s+["']${escapeRegExp(module)}["']`,
      ).test(line),
    );
    if (hasDefaultFromModule) continue;
    newImports.push(`import ${name} from "${module}"`);
    added.push({ name, module });
  }

  if (newImports.length > 0) {
    // Never splice INSIDE a multi-line import block: for `import {\n  Flame,\n}
    // from "lucide-react"` the old walk stopped on the block's second line and
    // inserted there — a parse regression the post-injection receipt then
    // reverted, silently dropping every fix for the file (v8-eval, M#imp1).
    // Track open blocks and advance past the `} from "…"` closer.
    let insertIdx = 0;
    let inImportBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inImportBlock) {
        insertIdx = i + 1;
        if (/\}\s*from\s+["']/.test(line)) inImportBlock = false;
        continue;
      }
      if (/^\s*import\s/.test(line) || /^\s*["']use /.test(line)) {
        insertIdx = i + 1;
        if (line.includes("{") && !/from\s+["']/.test(line)) {
          inImportBlock = true;
        }
        continue;
      }
      if (insertIdx > 0) break;
    }
    lines.splice(insertIdx, 0, ...newImports);
  }

  // `lines` may have been mutated by an in-place merge OR a fresh-import
  // splice (or both). Only rebuild when we actually added something so the
  // no-op path returns the byte-identical original.
  if (added.length === 0) {
    return { code, added };
  }
  return { code: lines.join("\n"), added };
}

/**
 * Apply the deterministic known-import fix across a whole CodeProject string
 * using the supplied tsc diagnostics. Returns the original content unchanged
 * when nothing resolvable is found.
 */
export function fixKnownTs2304Imports(
  content: string,
  diagnostics: ReadonlyArray<Ts2304Diagnostic>,
  options: { allowTier3?: boolean } = {},
): Ts2304KnownImportFixResult {
  const allowTier3 = options.allowTier3 ?? false;
  // Parse before bucketing: collision resolution (shadcn∩lucide) is
  // usage-driven and needs the file's source, not just its path.
  const project = parseCodeProject(content);
  if (project.files.length === 0) {
    return { code: content, fixes: [], addedImports: [] };
  }
  const codeByFile = new Map(
    project.files.map((file) => [toPosixPath(file.path), file.content]),
  );

  const missingByFile = new Map<string, Set<string>>();
  for (const diagnostic of diagnostics) {
    const name = extractMissingName(diagnostic.message);
    if (!name) continue;
    const file = toPosixPath(diagnostic.file);
    if (!file) continue;
    // Resolution is file-aware (Stripe/shadcn path-gating), usage-aware
    // (shadcn∩lucide collisions) and lifecycle-aware (tier-3 SDKs only in F3),
    // so resolve with the diagnostic's file + code + policy before bucketing.
    if (!resolveKnownImport(name, file, allowTier3, codeByFile.get(file))) continue;
    const bucket = missingByFile.get(file) ?? new Set<string>();
    bucket.add(name);
    missingByFile.set(file, bucket);
  }

  if (missingByFile.size === 0) {
    return { code: content, fixes: [], addedImports: [] };
  }

  const fixes: AutoFixEntry[] = [];
  const addedImports: Ts2304KnownImportAddition[] = [];
  let changed = false;

  const fixedFiles = project.files.map((file) => {
    if (!/\.(tsx?|jsx?)$/.test(file.path)) return file;
    const missing = missingByFile.get(toPosixPath(file.path));
    if (!missing || missing.size === 0) return file;

    const result = addKnownImportsToFile(file.content, [...missing], file.path, allowTier3);
    if (result.added.length === 0) return file;

    changed = true;
    for (const addition of result.added) {
      addedImports.push({ file: file.path, name: addition.name, module: addition.module });
    }
    fixes.push({
      fixer: "ts2304-known-import-fixer",
      description: `Added known import(s) for ${result.added
        .map((addition) => `${addition.name} (${addition.module})`)
        .join(", ")}`,
      file: file.path,
    });
    return { ...file, content: result.code };
  });

  if (!changed) {
    return { code: content, fixes: [], addedImports: [] };
  }

  return { code: serializeCodeProject(fixedFiles), fixes, addedImports };
}
