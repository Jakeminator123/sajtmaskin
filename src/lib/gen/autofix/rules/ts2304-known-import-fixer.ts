import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import { KNOWN_MODULE_SPECIFIERS } from "../import-validator";
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

type ResolvedImport = { module: string; kind: "named" | "default" };

const CANNOT_FIND_NAME_RE = /Cannot find name '([^']+)'/;

// `Image` and `Link` live in KNOWN_MODULE_SPECIFIERS but are DEFAULT exports of
// their modules, so they must be emitted as `import X from "..."` rather than a
// named import. Resolve them explicitly before the named-specifier scan.
const DEFAULT_IMPORT_NAMES: Record<string, string> = {
  Image: "next/image",
  Link: "next/link",
};

function resolveKnownImport(name: string): ResolvedImport | null {
  // KNOWN_MODULE_SPECIFIERS wins over lucide-react: `Image` and `Link` exist in
  // BOTH sets, but a non-JSX `Cannot find name 'Image'` almost always means the
  // Next component (`import Image from "next/image"`), not the lucide glyph.
  // Emitting the lucide named import would promote the wrong component and keep
  // failing on Next-specific props. So check the Next defaults and the known
  // module specifiers first, and only fall back to the lucide named import.
  if (DEFAULT_IMPORT_NAMES[name]) {
    return { module: DEFAULT_IMPORT_NAMES[name], kind: "default" };
  }
  for (const [module, names] of Object.entries(KNOWN_MODULE_SPECIFIERS)) {
    if (names.includes(name)) return { module, kind: "named" };
  }
  if (LUCIDE_ICONS.has(name)) return { module: "lucide-react", kind: "named" };
  return null;
}

function extractMissingName(message: string): string | null {
  const match = message.match(CANNOT_FIND_NAME_RE);
  return match ? match[1] : null;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

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
 * Add the resolved imports for `missingNames` into a single file's source.
 * Merges into an existing value named-import line for the same module when one
 * exists; otherwise inserts a fresh import after the existing import block.
 */
function addKnownImportsToFile(
  code: string,
  missingNames: string[],
): { code: string; added: Array<{ name: string; module: string }> } {
  const alreadyImported = collectImportedNames(code);
  const namedByModule = new Map<string, string[]>();
  const defaultImports: Array<{ name: string; module: string }> = [];

  for (const name of missingNames) {
    if (alreadyImported.has(name)) continue;
    if (!nameAppearsInFile(code, name)) continue;
    const resolved = resolveKnownImport(name);
    if (!resolved) continue;
    if (resolved.kind === "default") {
      defaultImports.push({ name, module: resolved.module });
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
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\s/.test(lines[i]) || /^\s*["']use /.test(lines[i])) {
        insertIdx = i + 1;
      } else if (insertIdx > 0) {
        break;
      }
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
): Ts2304KnownImportFixResult {
  const missingByFile = new Map<string, Set<string>>();
  for (const diagnostic of diagnostics) {
    const name = extractMissingName(diagnostic.message);
    if (!name || !resolveKnownImport(name)) continue;
    const file = toPosixPath(diagnostic.file);
    if (!file) continue;
    const bucket = missingByFile.get(file) ?? new Set<string>();
    bucket.add(name);
    missingByFile.set(file, bucket);
  }

  if (missingByFile.size === 0) {
    return { code: content, fixes: [], addedImports: [] };
  }

  const project = parseCodeProject(content);
  if (project.files.length === 0) {
    return { code: content, fixes: [], addedImports: [] };
  }

  const fixes: AutoFixEntry[] = [];
  const addedImports: Ts2304KnownImportAddition[] = [];
  let changed = false;

  const fixedFiles = project.files.map((file) => {
    if (!/\.(tsx?|jsx?)$/.test(file.path)) return file;
    const missing = missingByFile.get(toPosixPath(file.path));
    if (!missing || missing.size === 0) return file;

    const result = addKnownImportsToFile(file.content, [...missing]);
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
