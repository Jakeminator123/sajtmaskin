import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import {
  findNearestIcon,
  isLucideTypeOnlyExport,
  parseSpecifier,
} from "@/lib/gen/suspense/rules/lucide-icon-fix";
import {
  countParseErrors,
  findIntroducedDuplicateImportBindings,
  isGuardablePath,
} from "./rules/import-binding-ast";
import type { AutoFixEntry } from "./pipeline";

const IMPORT_RE = /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;

// Whole-text import-binding regexes. Unlike the per-line scans below these
// span MULTI-LINE named-import blocks (`import {\n  Flame,\n} from
// "lucide-react"`), whose bindings the line-based scans cannot see.
// Prod incident 2026-07-03 (chat cc10e7de v8, M#imp1): `app/page.tsx` had a
// multi-line lucide import; `fixMissingIconValueImports` did not see those
// bindings, re-imported six icons, and the guarded wrapper then reverted the
// ENTIRE import-validator result — silently discarding the correct
// `Badge`/`Button` shadcn fixes that `detectMissingImports` had just added.
const NAMED_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+(type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/gm;
const DEFAULT_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+(type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)\s/gm;
const NAMESPACE_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s/gm;

/**
 * Names bound by import statements across the whole file, split into VALUE
 * and TYPE-ONLY bindings. Multi-line aware (see the regex comment above).
 * Canonical binding collector for this module — both the JSX-tag scan
 * (`detectMissingImports`) and the icon-value scan
 * (`fixMissingIconValueImports`) resolve "already imported?" through this.
 */
function collectImportBoundNames(code: string): {
  value: Set<string>;
  typeOnly: Set<string>;
} {
  const value = new Set<string>();
  const typeOnly = new Set<string>();

  NAMED_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(NAMED_IMPORT_STATEMENT_RE)) {
    const statementIsTypeOnly = Boolean(match[1]);
    for (const rawSpec of match[2].split(",")) {
      let spec = rawSpec.trim();
      if (!spec) continue;
      const specIsTypeOnly = /^type\s+/.test(spec);
      if (specIsTypeOnly) spec = spec.replace(/^type\s+/, "");
      const aliased = spec.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      const bound = aliased ? aliased[2] : spec;
      if (!/^[A-Za-z_$][\w$]*$/.test(bound)) continue;
      if (statementIsTypeOnly || specIsTypeOnly) typeOnly.add(bound);
      else value.add(bound);
    }
  }

  DEFAULT_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(DEFAULT_IMPORT_STATEMENT_RE)) {
    if (match[1]) typeOnly.add(match[2]);
    else value.add(match[2]);
  }

  NAMESPACE_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(NAMESPACE_IMPORT_STATEMENT_RE)) {
    value.add(match[1]);
  }

  return { value, typeOnly };
}

export const KNOWN_MODULE_SPECIFIERS: Record<string, string[]> = {
  react: [
    "useState", "useEffect", "useRef", "useCallback", "useMemo",
    "useContext", "useReducer", "useId", "useLayoutEffect",
    "createContext", "forwardRef", "memo", "lazy", "Suspense",
    "Fragment", "StrictMode", "Children", "cloneElement",
    "createElement", "isValidElement",
  ],
  "framer-motion": [
    "motion", "AnimatePresence", "useAnimation", "useInView",
    "useScroll", "useTransform", "useMotionValue", "useSpring",
    "useMotionValueEvent", "LayoutGroup", "Reorder",
  ],
  "next/image": ["Image"],
  "next/link": ["Link"],
  "next/navigation": [
    "useRouter", "usePathname", "useSearchParams", "useParams",
    "redirect", "notFound",
  ],
  "next/font/google": [
    "Inter", "Geist", "Geist_Mono", "Roboto", "Open_Sans", "Lato",
    "Montserrat", "Poppins", "Raleway", "Nunito", "Space_Grotesk",
    "DM_Sans", "DM_Mono", "Playfair_Display",
  ],
  "react-error-boundary": ["ErrorBoundary", "useErrorBoundary", "withErrorBoundary"],
  "react-intersection-observer": ["InView"],
  "@tanstack/react-virtual": ["useVirtualizer", "useWindowVirtualizer"],
  "@tanstack/react-query": [
    "QueryClient", "QueryClientProvider", "useQuery", "useMutation",
    "useInfiniteQuery", "useQueryClient", "useSuspenseQuery",
  ],
  "@/lib/utils": ["cn"],
};

const LUCIDE_TYPE_ONLY_IMPORTS = [
  "IconNode",
  "LucideIcon",
  "LucideProps",
  "SVGAttributes",
] as const;

function guessModuleForSpecifiers(specifiers: string[]): string | null {
  for (const [mod, known] of Object.entries(KNOWN_MODULE_SPECIFIERS)) {
    if (specifiers.every((s) => known.includes(s))) return mod;
    if (specifiers.some((s) => known.includes(s))) return mod;
  }
  if (specifiers.every((s) => LUCIDE_ICONS.has(s))) return "lucide-react";
  if (specifiers.every((s) => s in SHADCN_COMPONENTS)) return null;
  return null;
}

/**
 * Fix unclosed multi-line import blocks where a new `import` appears
 * before the `} from "..."` closer. GPT-5.x models sometimes generate:
 *
 *   import {
 *     useState,
 *     useEffect,
 *   import { Button } from "@/components/ui/button"
 *
 * This function detects the pattern and either closes the orphaned block
 * with a guessed module source, or removes the stale opener.
 */
function fixNestedImportBlocks(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isMultiLineOpener =
      /^\s*import\s*\{/.test(line) && !line.includes("} from") && !line.includes("from ");

    if (!isMultiLineOpener) {
      result.push(line);
      i++;
      continue;
    }

    const specifiers: string[] = [];
    const openerLine = i;
    let j = i;

    const openerMatch = /^\s*import\s*\{\s*(.*)$/.exec(line);
    if (openerMatch && openerMatch[1].trim()) {
      for (const s of openerMatch[1].split(",")) {
        const trimmed = s.trim().replace(/,+$/, "").trim();
        if (trimmed && !trimmed.startsWith("import ")) specifiers.push(trimmed);
      }
    }

    j++;
    let foundNested = false;
    let closerFound = false;

    while (j < lines.length && j < openerLine + 30) {
      const nextLine = lines[j];

      if (/^\s*\}\s*from\s+["']/.test(nextLine)) {
        closerFound = true;
        break;
      }

      if (/^\s*import\s+/.test(nextLine)) {
        foundNested = true;
        break;
      }

      const cleaned = nextLine.trim().replace(/,+$/, "").trim();
      if (cleaned && !cleaned.startsWith("//")) {
        for (const s of cleaned.split(",")) {
          const t = s.trim();
          if (t) specifiers.push(t);
        }
      }
      j++;
    }

    if (closerFound) {
      for (let k = i; k <= j; k++) result.push(lines[k]);
      i = j + 1;
      continue;
    }

    if (!foundNested) {
      result.push(line);
      i++;
      continue;
    }

    const validSpecifiers = specifiers
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter((s) => /^[A-Z_$a-z][\w$]*$/.test(s));

    if (validSpecifiers.length > 0) {
      const guessedModule = guessModuleForSpecifiers(validSpecifiers);
      if (guessedModule) {
        const importLine = `import { ${validSpecifiers.join(", ")} } from "${guessedModule}";`;
        result.push(importLine);
        fixes.push({
          fixer: "import-validator",
          description: `Closed orphaned import block with guessed source "${guessedModule}" for: ${validSpecifiers.join(", ")}`,
          line: openerLine + 1,
        });
      } else {
        fixes.push({
          fixer: "import-validator",
          description: `Removed orphaned import block with unresolvable specifiers: ${validSpecifiers.join(", ")}`,
          line: openerLine + 1,
        });
      }
    } else {
      fixes.push({
        fixer: "import-validator",
        description: "Removed empty orphaned import block opener",
        line: openerLine + 1,
      });
    }

    i = j;
  }

  return { code: result.join("\n"), fixes };
}

interface ImportStatement {
  names: string[];
  source: string;
  line: string;
  lineNumber: number;
}

function extractImports(code: string): ImportStatement[] {
  const results: ImportStatement[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_RE.lastIndex = 0;
    const match = IMPORT_RE.exec(line);
    if (!match) continue;

    const names = match[1]
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    results.push({ names, source: match[2], line, lineNumber: i });
  }

  return results;
}

/**
 * Fix incorrect shadcn/ui import paths.
 * LLMs often import from wrong subpaths (e.g. `@/components/ui/card` for `CardHeader`
 * when it should come from the same file, or using `@/components/ui/badge` for `BadgeCheck`
 * which is a lucide icon).
 */
function fixShadcnImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_RE.lastIndex = 0;
    const match = IMPORT_RE.exec(line);
    if (!match) continue;

    const source = match[2];
    if (!source.startsWith("@/components/ui/")) continue;

    const names = match[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const correctedBySubpath = new Map<string, string[]>();
    const unknownNames: string[] = [];

    for (const name of names) {
      const correctSubpath = SHADCN_COMPONENTS[name];
      if (correctSubpath) {
        const fullPath = `@/components/ui/${correctSubpath}`;
        const existing = correctedBySubpath.get(fullPath) ?? [];
        existing.push(name);
        correctedBySubpath.set(fullPath, existing);
      } else {
        unknownNames.push(name);
      }
    }

    if (correctedBySubpath.size <= 1 && unknownNames.length === 0) continue;

    const newLines: string[] = [];
    for (const [path, pathNames] of correctedBySubpath) {
      newLines.push(`import { ${pathNames.join(", ")} } from "${path}"`);
    }
    if (unknownNames.length > 0) {
      newLines.push(`import { ${unknownNames.join(", ")} } from "${source}"`);
    }

    if (newLines.length === 1 && newLines[0] === line) continue;

    lines.splice(i, 1, ...newLines);
    fixes.push({
      fixer: "import-validator",
      description: `Corrected shadcn import grouping for: ${names.join(", ")}`,
      line: i + 1,
    });
    i += newLines.length - 1;
  }

  return { code: lines.join("\n"), fixes };
}

/**
 * Fix unknown lucide-react icon names in both single-line and multi-line imports.
 * Uses the same nearest-icon resolution as the streaming lucide-icon-fix rule,
 * but operates on the full file so it catches multi-line imports that the
 * per-line streaming rule cannot match.
 */
const LUCIDE_IMPORT_MULTILINE_RE =
  /(import\s*\{)([^}]*?)(\}\s*from\s*["']lucide-react["'])/g;

function fixLucideImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];

  const fixed = code.replace(
    LUCIDE_IMPORT_MULTILINE_RE,
    (fullMatch, prefix: string, rawNames: string, suffix: string) => {
      const specifiers = rawNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (specifiers.length === 0) return fullMatch;

      let changed = false;
      const fixedSpecs = specifiers.flatMap((raw) => {
        // M#cr1 side-fix: inline type specifiers (`type PawPrint`) must be
        // left untouched. Running them through parseSpecifier/findNearestIcon
        // treated the whole string "type PawPrint" as an icon name and
        // fuzzy-corrupted the import into `Type as type PawPrint` (parse
        // error). Type-only bindings are erased at build — never fuzzy-match
        // or remove them here.
        if (/^type\s+/.test(raw)) return [raw];
        const { imported, local } = parseSpecifier(raw);

        if (isLucideTypeOnlyExport(imported) || isLucideTypeOnlyExport(local)) {
          changed = true;
          return [];
        }

        if (LUCIDE_ICONS.has(imported)) return [raw];

        const nearest = findNearestIcon(imported);
        if (!nearest) return [raw];
        changed = true;

        if (nearest === local) return [nearest];
        return [`${nearest} as ${local}`];
      });

      if (!changed) return fullMatch;
      if (fixedSpecs.length === 0) return "";

      const hasNewlines = rawNames.includes("\n");
      const joined = hasNewlines
        ? "\n  " + fixedSpecs.join(",\n  ") + ",\n"
        : " " + fixedSpecs.join(", ") + " ";

      const replacedNames = specifiers
        .filter((raw) => {
          if (/^type\s+/.test(raw)) return false;
          const { imported } = parseSpecifier(raw);
          return !LUCIDE_ICONS.has(imported) && findNearestIcon(imported) !== null;
        })
        .map((raw) => parseSpecifier(raw).imported);

      fixes.push({
        fixer: "import-validator",
        description: `Fixed unknown lucide icon(s): ${replacedNames.join(", ")}`,
        line: 0,
      });

      return `${prefix}${joined}${suffix}`;
    },
  );

  return { code: fixed, fixes };
}

// ---------------------------------------------------------------------------
// Radix UI: @radix-ui/react-* → "radix-ui" monorepo imports
// ---------------------------------------------------------------------------

const PACKAGE_TO_RADIX_EXPORT: Record<string, string> = {
  "@radix-ui/react-slot": "Slot",
  "@radix-ui/react-dialog": "Dialog",
  "@radix-ui/react-dropdown-menu": "DropdownMenu",
  "@radix-ui/react-tabs": "Tabs",
  "@radix-ui/react-tooltip": "Tooltip",
  "@radix-ui/react-accordion": "Accordion",
  "@radix-ui/react-collapsible": "Collapsible",
  "@radix-ui/react-select": "Select",
  "@radix-ui/react-switch": "Switch",
  "@radix-ui/react-checkbox": "Checkbox",
  "@radix-ui/react-label": "Label",
  "@radix-ui/react-scroll-area": "ScrollArea",
  "@radix-ui/react-separator": "Separator",
  "@radix-ui/react-avatar": "Avatar",
  "@radix-ui/react-popover": "Popover",
  "@radix-ui/react-progress": "Progress",
  "@radix-ui/react-slider": "Slider",
  "@radix-ui/react-toggle": "Toggle",
  "@radix-ui/react-toggle-group": "ToggleGroup",
  "@radix-ui/react-hover-card": "HoverCard",
  "@radix-ui/react-navigation-menu": "NavigationMenu",
  "@radix-ui/react-radio-group": "RadioGroup",
  "@radix-ui/react-context-menu": "ContextMenu",
  "@radix-ui/react-menubar": "Menubar",
  "@radix-ui/react-alert-dialog": "AlertDialog",
  "@radix-ui/react-aspect-ratio": "AspectRatio",
};

const OLD_RADIX_NAMESPACE_RE =
  /^(\s*)import\s+\*\s+as\s+(\w+)\s+from\s+["'](@radix-ui\/react-[\w-]+)["']\s*;?\s*$/;

const OLD_RADIX_NAMED_RE =
  /^(\s*)import\s+\{([^}]+)\}\s+from\s+["'](@radix-ui\/react-[\w-]+)["']\s*;?\s*$/;

function fixRadixImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const nsMatch = line.match(OLD_RADIX_NAMESPACE_RE);
    if (nsMatch) {
      const [, indent, alias, pkg] = nsMatch;
      const exportName = PACKAGE_TO_RADIX_EXPORT[pkg];
      if (exportName) {
        lines[i] = `${indent}import { ${exportName} as ${alias} } from "radix-ui"`;
        fixes.push({
          fixer: "import-validator",
          description: `Converted namespace import from "${pkg}" to unified "radix-ui"`,
          line: i + 1,
        });
      }
      continue;
    }

    const namedMatch = line.match(OLD_RADIX_NAMED_RE);
    if (namedMatch) {
      const [, indent, rawNames, pkg] = namedMatch;
      const exportName = PACKAGE_TO_RADIX_EXPORT[pkg];
      if (exportName) {
        const names = rawNames.trim();
        lines[i] = `${indent}import { ${names} } from "radix-ui"`;
        fixes.push({
          fixer: "import-validator",
          description: `Converted named import from "${pkg}" to unified "radix-ui"`,
          line: i + 1,
        });
      }
    }
  }

  return { code: lines.join("\n"), fixes };
}

// ---------------------------------------------------------------------------
// Slot namespace fix: bare `Slot` from "radix-ui" → `SlotPrimitive.Slot`
// ---------------------------------------------------------------------------

function fixRadixSlotUsage(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];

  const slotImportRe = /^(\s*)import\s+\{\s*Slot\s*\}\s+from\s+["']radix-ui["']/m;
  const match = code.match(slotImportRe);
  if (!match) return { code, fixes };

  const usesSlotDot = /SlotPrimitive\./.test(code);
  if (usesSlotDot) return { code, fixes };

  const usedAsBareJsx = /<Slot[\s/>]/.test(code) || /\?\s*Slot\s*:/.test(code);
  if (!usedAsBareJsx) return { code, fixes };

  let fixed = code.replace(slotImportRe, "$1import { Slot as SlotPrimitive } from \"radix-ui\"");
  fixed = fixed.replace(/\basChild\s*\?\s*Slot\s*:/g, "asChild ? SlotPrimitive.Slot :");
  fixed = fixed.replace(/<Slot(\s)/g, "<SlotPrimitive.Slot$1");
  fixed = fixed.replace(/<Slot>/g, "<SlotPrimitive.Slot>");
  fixed = fixed.replace(/<\/Slot>/g, "</SlotPrimitive.Slot>");

  if (fixed !== code) {
    fixes.push({
      fixer: "import-validator",
      description: "Fixed bare Slot usage from radix-ui namespace to SlotPrimitive.Slot",
      line: 0,
    });
  }

  return { code: fixed, fixes };
}

// ---------------------------------------------------------------------------
// Missing import detection: scan JSX for unimported components
// ---------------------------------------------------------------------------

const NEXT_AUTO_IMPORTS: Record<string, string> = {
  Link: 'import Link from "next/link"',
  Image: 'import Image from "next/image"',
  Metadata: 'import type { Metadata } from "next"',
};

const REACT_HOOKS: Record<string, true> = {
  useState: true,
  useEffect: true,
  useRef: true,
  useCallback: true,
  useMemo: true,
  useContext: true,
  useReducer: true,
  useId: true,
  useTransition: true,
  useDeferredValue: true,
  useImperativeHandle: true,
  useLayoutEffect: true,
  useSyncExternalStore: true,
  useInsertionEffect: true,
};

function detectMissingImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");

  // Multi-line aware (M#imp1): the old per-line scan could not see bindings
  // inside multi-line import blocks, so already-imported names got re-added
  // and the guarded wrapper reverted the whole result. Type-only bindings
  // count as "imported" here on purpose — re-importing them as values is a
  // different fixer's job (value-used-from-type-import), not a missing import.
  const bound = collectImportBoundNames(code);
  const importedNames = new Set<string>([...bound.value, ...bound.typeOnly]);

  const jsxTagRe = /<([A-Z][A-Za-z0-9]*)\b/g;
  const jsxTags = new Set<string>();
  for (const m of code.matchAll(jsxTagRe)) {
    jsxTags.add(m[1]);
  }

  const typeUsageRe = /:\s*(Metadata)\b/g;
  for (const m of code.matchAll(typeUsageRe)) {
    jsxTags.add(m[1]);
  }

  const hookUsageRe = /\b(use[A-Z]\w*)\s*[<(]/g;
  const missingHooks = new Set<string>();
  for (const m of code.matchAll(hookUsageRe)) {
    const name = m[1];
    if (REACT_HOOKS[name] && !importedNames.has(name)) {
      missingHooks.add(name);
    }
  }

  const newImports: string[] = [];

  for (const tag of jsxTags) {
    if (importedNames.has(tag)) continue;

    if (NEXT_AUTO_IMPORTS[tag]) {
      newImports.push(NEXT_AUTO_IMPORTS[tag]);
      fixes.push({
        fixer: "import-validator",
        description: `Added missing import for ${tag}`,
        line: 0,
      });
      continue;
    }

    const shadcnSubpath = SHADCN_COMPONENTS[tag];
    if (shadcnSubpath) {
      const existing = lines.findIndex(
        (l) => l.includes(`from "@/components/ui/${shadcnSubpath}"`) || l.includes(`from '@/components/ui/${shadcnSubpath}'`),
      );
      if (existing >= 0) {
        const line = lines[existing];
        const braceMatch = line.match(/^(\s*import\s+\{)([^}]*)(\}\s+from\s+.+)$/);
        if (braceMatch && !braceMatch[2].includes(tag)) {
          lines[existing] = `${braceMatch[1]}${braceMatch[2].trimEnd()}, ${tag} ${braceMatch[3]}`;
          fixes.push({
            fixer: "import-validator",
            description: `Added missing ${tag} to existing import from ui/${shadcnSubpath}`,
            line: existing + 1,
          });
        }
      } else {
        newImports.push(`import { ${tag} } from "@/components/ui/${shadcnSubpath}"`);
        fixes.push({
          fixer: "import-validator",
          description: `Added missing shadcn import for ${tag}`,
          line: 0,
        });
      }
      continue;
    }

    if (LUCIDE_ICONS.has(tag)) {
      const existing = lines.findIndex(
        (l) => l.includes('from "lucide-react"') || l.includes("from 'lucide-react'"),
      );
      if (existing >= 0) {
        const line = lines[existing];
        const braceMatch = line.match(/^(\s*import\s+(?:type\s+)?\{)([^}]*)(\}\s+from\s+.+)$/);
        if (braceMatch && !braceMatch[2].includes(tag)) {
          lines[existing] = `${braceMatch[1]}${braceMatch[2].trimEnd()}, ${tag} ${braceMatch[3]}`;
          fixes.push({
            fixer: "import-validator",
            description: `Added missing lucide icon ${tag} to existing import`,
            line: existing + 1,
          });
        }
      } else {
        newImports.push(`import { ${tag} } from "lucide-react"`);
        fixes.push({
          fixer: "import-validator",
          description: `Added missing lucide import for ${tag}`,
          line: 0,
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SAJ-61 P0/c2: JSX namespace usage (e.g. `<motion.div>` / `<motion.aside>`).
  // The default `jsxTagRe` only matches PascalCase tags, so `motion.div`
  // sneaks past — the LLM emits bare `motion.X` JSX without the
  // accompanying `import { motion } from "framer-motion"`. Look up the
  // namespace root (`motion`) in `KNOWN_MODULE_SPECIFIERS` and add the
  // canonical named import when none is present.
  // ───────────────────────────────────────────────────────────────────────
  // `motion.div`, `motion.aside`, `motion.section` — `motion` is the
  // namespace root (lowercase), the second segment is a native HTML tag
  // (also lowercase) or a custom subcomponent (PascalCase). We only care
  // about the root, so match either.
  const jsxNamespaceRe = /<([a-z][A-Za-z0-9]*)\.[A-Za-z][\w$]*/g;
  const namespaceRoots = new Set<string>();
  for (const m of code.matchAll(jsxNamespaceRe)) {
    namespaceRoots.add(m[1]);
  }
  for (const ns of namespaceRoots) {
    if (importedNames.has(ns)) continue;
    let resolvedModule: string | null = null;
    for (const [modulePath, names] of Object.entries(KNOWN_MODULE_SPECIFIERS)) {
      if (names.includes(ns)) {
        resolvedModule = modulePath;
        break;
      }
    }
    if (!resolvedModule) continue;
    newImports.push(`import { ${ns} } from "${resolvedModule}"`);
    fixes.push({
      fixer: "import-validator",
      description: `Added missing namespace import for <${ns}.*> from ${resolvedModule}`,
      line: 0,
    });
    importedNames.add(ns);
  }

  // ───────────────────────────────────────────────────────────────────────
  // SAJ-61 P0/c3: Lucide exposes component and prop types. Generated code
  // often value-imports them before using them in type positions. Move these
  // names to a type-only import so the value import fixer does not delete the
  // binding and leave a `Cannot find name` diagnostic behind.
  // ───────────────────────────────────────────────────────────────────────
  const lucideTypesNeeded = LUCIDE_TYPE_ONLY_IMPORTS.filter((typeName) => {
    const used = new RegExp(`\\b${typeName}\\b`).test(code);
    return used && !importedNames.has(typeName);
  });
  if (lucideTypesNeeded.length > 0) {
    const existingTypeOnly = lines.findIndex(
      (l) =>
        /from\s+["']lucide-react["']/.test(l) &&
        /import\s+type\s+\{/.test(l),
    );
    const pendingTypeImports = new Set(lucideTypesNeeded);
    if (existingTypeOnly >= 0) {
      const line = lines[existingTypeOnly];
      const braceMatch = line.match(/^(\s*import\s+type\s+\{)([^}]*)(\}\s+from\s+["']lucide-react["'].*)$/);
      if (braceMatch) {
        const existingSpecs = braceMatch[2]
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        for (const typeName of lucideTypesNeeded) {
          if (existingSpecs.includes(typeName)) pendingTypeImports.delete(typeName);
        }
        if (pendingTypeImports.size > 0) {
          const merged = [...existingSpecs, ...pendingTypeImports].join(", ");
          lines[existingTypeOnly] = `${braceMatch[1]} ${merged} ${braceMatch[3]}`;
          fixes.push({
            fixer: "import-validator",
            description: `Added missing lucide-react type import(s): ${[...pendingTypeImports].join(", ")}`,
            line: existingTypeOnly + 1,
          });
          pendingTypeImports.clear();
        }
      }
      // braceMatch === null → existing line shape is unparseable, fall
      // through to the "fresh import" branch below so we still satisfy the
      // missing import.
    }
    if (pendingTypeImports.size > 0) {
      newImports.push(`import type { ${[...pendingTypeImports].join(", ")} } from "lucide-react"`);
      fixes.push({
        fixer: "import-validator",
        description: `Added missing type import(s) for ${[...pendingTypeImports].join(", ")} from lucide-react`,
        line: 0,
      });
    }
    for (const typeName of lucideTypesNeeded) importedNames.add(typeName);
  }

  if (missingHooks.size > 0) {
    const hookNames = [...missingHooks].sort();
    const existingReact = lines.findIndex(
      (l) => /from\s+["']react["']/.test(l) && /import\s+\{/.test(l),
    );
    if (existingReact >= 0) {
      const line = lines[existingReact];
      const braceMatch = line.match(/^(\s*import\s+\{)([^}]*)(\}\s+from\s+["']react["'].*)$/);
      if (braceMatch) {
        const alreadyImported = braceMatch[2].split(",").map((s) => s.trim());
        const toAdd = hookNames.filter((h) => !alreadyImported.includes(h));
        if (toAdd.length > 0) {
          lines[existingReact] = `${braceMatch[1]}${braceMatch[2].trimEnd()}, ${toAdd.join(", ")} ${braceMatch[3]}`;
          fixes.push({
            fixer: "import-validator",
            description: `Added missing React hooks: ${toAdd.join(", ")}`,
            line: existingReact + 1,
          });
        }
      }
    } else {
      newImports.push(`import { ${hookNames.join(", ")} } from "react"`);
      fixes.push({
        fixer: "import-validator",
        description: `Added missing React hooks: ${hookNames.join(", ")}`,
        line: 0,
      });
    }
  }

  if (newImports.length > 0) {
    // Never splice INSIDE a multi-line import block (M#imp1): the old walk
    // stopped at the first non-`import` line, which for `import {\n  Flame,\n}
    // from "lucide-react"` is the second line of the block — inserting there
    // corrupted the block, hid its bindings from every later scan, and ended
    // in a guarded-wrapper revert of the whole result. Track open blocks and
    // advance to the `} from "…"` closer before inserting.
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

  return { code: lines.join("\n"), fixes };
}

// ---------------------------------------------------------------------------
// Non-JSX lucide value usage: `icon: PawPrint` in a data/registry object.
// ---------------------------------------------------------------------------

/**
 * `icon:`/`Icon:` (or any `*icon:` key like `activeIcon:`) whose value is a
 * bare PascalCase identifier — the "icon registry" idiom:
 *
 *   const MOTIFS = [{ label: "Trail", icon: PawPrint }];
 *
 * `detectMissingImports` above only scans JSX (`<PawPrint/>`), so this value
 * reference slips through on the deterministic export/preview path. There is no
 * tsc there to trigger `ts2304-known-import-fixer`, so a missing import ships as
 * a runtime `ReferenceError: PawPrint is not defined` (white screen). Captured
 * group 1 is the candidate icon name.
 */
const ICON_PROPERTY_VALUE_RE = /\b[A-Za-z]*[Ii]con\s*:\s*([A-Z][A-Za-z0-9]*)\b/g;

/**
 * JSX-prop form of the same idiom: an icon component passed as a prop value,
 *
 *   <FeatureCard icon={PawPrint} />
 *
 * Like the `icon:` object form, `detectMissingImports` (a JSX *tag* scan) never
 * sees `PawPrint` here, so on the deterministic export/preview path (no tsc to
 * drive `ts2304-known-import-fixer`) a missing import ships as a runtime
 * `ReferenceError` / white screen. Only a BARE PascalCase identifier between the
 * braces is matched — `icon={<PawPrint/>}` (already covered by the JSX-tag scan)
 * and `icon={Icons.PawPrint}` (member access) are intentionally NOT matched, so
 * this never double-imports. Captured group 1 is the candidate icon name.
 */
const ICON_PROPERTY_JSX_VALUE_RE = /\b[A-Za-z]*[Ii]con\s*=\s*\{\s*([A-Z][A-Za-z0-9]*)\s*\}/g;

/**
 * Names bound by import statements, split into VALUE bindings and TYPE-ONLY
 * bindings (M#cr1). `import type { PawPrint }` (or an inline `type PawPrint`
 * specifier) is erased at build — a bare `icon: PawPrint` value usage still
 * ships a TS1361/`ReferenceError` unless the binding is converted to a value
 * import. Treating both kinds as "already imported" (the old single-Set
 * behaviour) silently skipped exactly the file that needed fixing.
 *
 * Multi-line aware since M#imp1 (prod chat cc10e7de v8): delegates to the
 * whole-text collector so a multi-line lucide import block's bindings are
 * seen — the old per-line scan re-imported six already-imported icons, which
 * made the guarded wrapper revert the whole import-validator result.
 */
function collectImportedBindings(code: string): {
  value: Set<string>;
  typeOnly: Set<string>;
} {
  return collectImportBoundNames(code);
}

/**
 * Convert a type-only lucide binding into a value binding (M#cr1). Handles:
 *  - inline spec in a value import: `import { type PawPrint, Menu } from
 *    "lucide-react"` → strip the `type` keyword (done — no further add needed);
 *  - whole-line `import type { PawPrint } from "lucide-react"` with a single
 *    spec → flip the line to a value import (done);
 *  - whole-line with multiple specs → remove the name from the type line and
 *    report `needsValueImport: true` so the caller adds the value import.
 *
 * Only lucide-react imports are converted — a type binding from any other
 * module is a different symbol and is left for the LLM fixer (returns null).
 */
function convertLucideTypeImportToValue(
  code: string,
  name: string,
): { code: string; needsValueImport: boolean } | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("lucide-react")) continue;

    // Inline `type Name` spec inside a VALUE import line.
    if (/^\s*import\s+\{/.test(line) && !/^\s*import\s+type\s/.test(line)) {
      const inlineRe = new RegExp(`(\\{[^}]*?)\\btype\\s+(${n})\\b`);
      if (inlineRe.test(line)) {
        lines[i] = line.replace(inlineRe, "$1$2");
        return { code: lines.join("\n"), needsValueImport: false };
      }
      continue;
    }

    // Whole-line `import type { … } from "lucide-react"`.
    const whole = line.match(
      /^(\s*import\s+)type\s+\{([^}]*)\}(\s*from\s+["']lucide-react["'].*)$/,
    );
    if (!whole) continue;
    const specs = whole[2]
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean);
    if (!specs.includes(name)) continue;
    if (specs.length === 1) {
      lines[i] = `${whole[1]}{ ${name} }${whole[3]}`;
      return { code: lines.join("\n"), needsValueImport: false };
    }
    const remaining = specs.filter((spec) => spec !== name);
    lines[i] = `${whole[1]}type { ${remaining.join(", ")} }${whole[3]}`;
    return { code: lines.join("\n"), needsValueImport: true };
  }
  return null;
}

/**
 * True when the file declares or re-exports `name` locally, so the `icon:`
 * value is a local symbol — NOT a lucide icon that needs importing. Mirrors the
 * guard in `ts2304-known-import-fixer.ts` to avoid shadowing a local binding.
 */
function fileDeclaresSymbolLocally(code: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Runtime-value local declarations win over a lucide import: importing the
  // icon would duplicate the binding (TS2440 / esbuild "already declared"). This
  // includes `enum` / `const enum`, which (unlike `type`/`interface`) emit a
  // runtime value object. `type`/`interface` are intentionally NOT matched —
  // they are erased at build, so a bare `icon: X` value reference genuinely
  // needs the lucide value import; skipping it would ship a runtime
  // `ReferenceError` (the white-screen this fixer exists to prevent).
  const kw = "(?:function|const\\s+enum|enum|const|let|var|class)";
  const declaration = new RegExp(
    `(?:^|\\n)\\s*export\\s+(?:default\\s+)?(?:async\\s+)?${kw}\\s+${n}\\b` +
      `|(?:^|\\n)\\s*(?:async\\s+)?${kw}\\s+${n}\\b`,
  );
  if (declaration.test(code)) return true;
  // M#cr2 / BB#296: destructuring and parameter bindings also declare the
  // name locally. Without these, `const { icon: PawPrint } = x` or
  // `function Card({ icon: PawPrint })` matched the icon-value regexes above
  // and got a DUPLICATE lucide import injected (TS2440 — semantic, not a
  // parse error, so the guarded wrapper does not revert it on the
  // export/preview path).
  //  - variable destructuring: `const { icon: PawPrint } = …` / `const { PawPrint } = …`
  const destructuring = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s*\\{[^}]*\\b(?:\\w+\\s*:\\s*)?${n}\\b[^}]*\\}\\s*=`,
  );
  if (destructuring.test(code)) return true;
  //  - parameter destructuring: `function Card({ icon: PawPrint, … })` and
  //    arrow components `const Card = ({ icon: PawPrint }) => …`. A CALL with
  //    an object literal (`fn({ icon: PawPrint })`) deliberately does NOT match:
  //    there the `(` follows an identifier, not `function name` or `=`.
  const paramDestructuring = new RegExp(
    `function\\s+[A-Za-z_$][\\w$]*\\s*\\(\\s*\\{[^)]*\\b(?:\\w+\\s*:\\s*)?${n}\\b` +
      `|=\\s*(?:async\\s*)?\\(\\s*\\{[^)]*\\b(?:\\w+\\s*:\\s*)?${n}\\b`,
  );
  if (paramDestructuring.test(code)) return true;
  return new RegExp(`export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(code);
}

/**
 * Add a missing `lucide-react` value import for icons used only as a bare value
 * in an `icon:` property or an `icon={...}` JSX prop (no JSX-tag usage).
 * Narrowly scoped to avoid false
 * positives on common-word icon names (`Box`, `Text`, `Image`, …): the name
 * must be a real lucide icon, NOT already imported, NOT declared locally, NOT a
 * Next default-import name (`Image`/`Link`/`Metadata`), and NOT a shadcn
 * component. Merges into an existing value `import { … } from "lucide-react"`
 * line when present, otherwise inserts a fresh import.
 */
function fixMissingIconValueImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  ICON_PROPERTY_VALUE_RE.lastIndex = 0;
  ICON_PROPERTY_JSX_VALUE_RE.lastIndex = 0;
  const candidates = new Set<string>();
  for (const m of code.matchAll(ICON_PROPERTY_VALUE_RE)) {
    candidates.add(m[1]);
  }
  for (const m of code.matchAll(ICON_PROPERTY_JSX_VALUE_RE)) {
    candidates.add(m[1]);
  }
  if (candidates.size === 0) return { code, fixes };

  const imported = collectImportedBindings(code);
  const toAdd: string[] = [];
  let working = code;
  for (const name of candidates) {
    if (!LUCIDE_ICONS.has(name)) continue; // must be a real lucide icon
    if (NEXT_AUTO_IMPORTS[name]) continue; // Image/Link/Metadata → next/*, not lucide
    if (name in SHADCN_COMPONENTS) continue; // avoid shadcn-component collision
    if (imported.value.has(name)) continue; // already value-imported (incl. JSX fixer above)
    if (fileDeclaresSymbolLocally(code, name)) continue; // local symbol, not lucide
    if (imported.typeOnly.has(name)) {
      // M#cr1: `import type { PawPrint }` + `icon: PawPrint` — the type
      // binding is erased at build, so convert it to a value import instead
      // of adding a duplicate binding (TS2300/TS2440).
      const converted = convertLucideTypeImportToValue(working, name);
      if (!converted) continue; // type-imported from a non-lucide module — leave for the LLM
      working = converted.code;
      if (!converted.needsValueImport) {
        fixes.push({
          fixer: "import-validator",
          description: `Converted type-only lucide import to value import for icon property: ${name}`,
          line: 0,
        });
        continue;
      }
      // Name removed from the multi-spec type line — fall through to add the
      // value import below.
    }
    if (!toAdd.includes(name)) toAdd.push(name);
  }
  if (toAdd.length === 0) return { code: working, fixes };

  const lines = working.split("\n");
  // Merge ONLY into a value named import, never `import type { … }` (that would
  // make the icon type-only and re-break the value usage with TS1361).
  const existingIdx = lines.findIndex(
    (l) =>
      (l.includes('from "lucide-react"') || l.includes("from 'lucide-react'")) &&
      /^\s*import\s+\{/.test(l) &&
      !/^\s*import\s+type\s/.test(l),
  );

  if (existingIdx >= 0) {
    const braceMatch = lines[existingIdx].match(/^(\s*import\s+\{)([^}]*)(\}\s+from\s+.+)$/);
    if (braceMatch) {
      const existingSpecs = braceMatch[2]
        .split(",")
        .map((spec) => spec.trim())
        .filter(Boolean);
      const newOnes = toAdd.filter((name) => !existingSpecs.includes(name));
      if (newOnes.length > 0) {
        // Strip a trailing comma off the existing specifiers before re-joining
        // so an `import { Menu, }` line does not become `import { Menu,, … }`
        // (an empty specifier → TS1109 parse error).
        const head = braceMatch[2].replace(/\s+$/, "").replace(/,$/, "");
        lines[existingIdx] = `${braceMatch[1]}${head}, ${newOnes.join(", ")} ${braceMatch[3]}`;
        fixes.push({
          fixer: "import-validator",
          description: `Added missing lucide value import(s) for icon property: ${newOnes.join(", ")}`,
          line: existingIdx + 1,
        });
      }
      return { code: lines.join("\n"), fixes };
    }
  }

  // Fresh import: insert at a safe top-of-file position — after any leading
  // directive prologue (`"use client"` / `"use server"`) and the comment/blank
  // lines that may surround it, but BEFORE the first import/code line. The
  // directive MUST stay the first *statement* (Next.js only honours it when no
  // statement precedes it), so we skip leading `//` and `/* … */` comments too:
  // a `"use client"` preceded by a header comment, or carrying a trailing
  // comment, must NOT get the lucide import hoisted above it (that would demote
  // the file to a Server Component — a silent, parse-clean regression the
  // guarded wrapper cannot catch). We deliberately do NOT advance past an
  // `import {` opener: a multi-line lucide block (`import {\n Menu,\n} from
  // "lucide-react"`) has no single-line value import for the merge above to find,
  // and the previous logic spliced the new line between the opener and its
  // `} from "…"` closer — corrupting the file (then reverted by the guarded
  // wrapper, silently dropping the import and re-shipping the white screen).
  let insertIdx = 0;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (inBlockComment) {
      insertIdx = i + 1;
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed === "") {
      insertIdx = i + 1;
      continue;
    }
    if (trimmed.startsWith("//")) {
      insertIdx = i + 1;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      insertIdx = i + 1;
      // A single-line `/* … */` closes on the same line; otherwise keep
      // skipping until the line that contains the `*/` terminator.
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    // Leading directive prologue, tolerating a trailing `//` or `/* … */`
    // comment after the (optional) semicolon.
    if (/^["'`]use [^"'`]+["'`]\s*;?\s*(?:\/\/.*|\/\*.*?\*\/\s*)?$/.test(trimmed)) {
      insertIdx = i + 1;
      continue;
    }
    break;
  }
  lines.splice(insertIdx, 0, `import { ${toAdd.join(", ")} } from "lucide-react"`);
  fixes.push({
    fixer: "import-validator",
    description: `Added missing lucide value import(s) for icon property: ${toAdd.join(", ")}`,
    line: 0,
  });
  return { code: lines.join("\n"), fixes };
}

/**
 * Validate all imports and return warnings for unknown components/icons.
 * Does not block — only flags for logging.
 */
function validateImports(code: string): string[] {
  const warnings: string[] = [];
  const imports = extractImports(code);

  for (const imp of imports) {
    if (imp.source.startsWith("@/components/ui/")) {
      for (const name of imp.names) {
        if (!SHADCN_COMPONENTS[name]) {
          warnings.push(
            `Unknown shadcn component "${name}" imported from "${imp.source}" (line ${imp.lineNumber + 1})`,
          );
        }
      }
    }

    if (imp.source === "lucide-react") {
      for (const name of imp.names) {
        if (!LUCIDE_ICONS.has(name)) {
          warnings.push(
            `Unknown lucide icon "${name}" (line ${imp.lineNumber + 1})`,
          );
        }
      }
    }
  }

  return warnings;
}

/**
 * Remove duplicate `export default` statements, keeping only the last one.
 * GPT-5.x sometimes emits both `export default function Foo()` and a trailing
 * `export default Foo;` in the same file.
 */
function fixDuplicateDefaultExport(code: string): { code: string; fixes: AutoFixEntry[] } {
  const EXPORT_DEFAULT_RE = /^export\s+default\b/;
  const lines = code.split("\n");
  const defaultExportLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (EXPORT_DEFAULT_RE.test(lines[i].trim())) {
      defaultExportLines.push(i);
    }
  }

  if (defaultExportLines.length <= 1) {
    return { code, fixes: [] };
  }

  const linesToRemove = new Set(defaultExportLines.slice(0, -1));
  const kept = lines.filter((_, i) => !linesToRemove.has(i));
  return {
    code: kept.join("\n"),
    fixes: [{
      fixer: "duplicate-default-export-fixer",
      description: `Removed ${linesToRemove.size} duplicate export default statement(s)`,
    }],
  };
}

export function runImportValidator(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const nested = fixNestedImportBlocks(code);
  const dupExport = fixDuplicateDefaultExport(nested.code);
  const shadcn = fixShadcnImports(dupExport.code);
  const lucide = fixLucideImports(shadcn.code);
  const radix = fixRadixImports(lucide.code);
  const slot = fixRadixSlotUsage(radix.code);
  const missing = detectMissingImports(slot.code);
  // Runs AFTER the JSX scan so a JSX-added lucide import is already present in
  // `missing.code` and the bare `icon:` value reference is not imported twice.
  const iconValues = fixMissingIconValueImports(missing.code);
  const fixes = [...nested.fixes, ...dupExport.fixes, ...shadcn.fixes, ...lucide.fixes, ...radix.fixes, ...slot.fixes, ...missing.fixes, ...iconValues.fixes];
  const warnings = validateImports(iconValues.code);
  return { code: iconValues.code, fixes, warnings };
}

/**
 * Canonical, **guarded** entry for `runImportValidator` in runtime paths.
 *
 * The raw `runImportValidator` rewrites imports with regex/line surgery and is
 * the highest-corruption-risk mechanical step (per the autofix deep-audit). On
 * BOTH the CodeProject `runAutoFix` pass AND the post-merge
 * `repairGeneratedFiles()` path (finalize-preflight / preview-session /
 * preview-render / export), it must never leave a file LESS parseable than it
 * found it.
 *
 * This wrapper re-checks the result with the synchronous TypeScript parser and
 * **reverts** the import-validator output when it either
 *
 *   1. turned parseable input into unparseable output, or
 *   2. INTRODUCED duplicate import bindings — the same local name declared by
 *      2+ import statements (TS2300; e.g. a JSX-scan injection duplicating a
 *      binding that already exists in a multi-line import the line-based scan
 *      could not see). Cheap parser-based post-check per file.
 *
 * — keeping the pre-fixer content and recording a warning in both cases.
 * It deliberately does NOT revert when the input was already unparseable /
 * already duplicated: that upstream model/stream breakage must stay visible to
 * the syntax-validator / preflight gate rather than be masked here.
 *
 * Runtime callers MUST use this instead of `runImportValidator` directly so the
 * fixer can never run unguarded. (`runImportValidator` stays exported only for
 * focused unit tests of the underlying transforms.)
 */
export function runImportValidatorGuarded(
  code: string,
  filePath: string,
  /** Injectable for tests; defaults to the real `runImportValidator`. */
  runner: (code: string) => {
    code: string;
    fixes: AutoFixEntry[];
    warnings: string[];
  } = runImportValidator,
): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
  reverted: boolean;
} {
  const result = runner(code);
  if (result.code === code) {
    return { ...result, reverted: false };
  }
  // Guard all TS/JS dialects incl. module-suffixed paths (.mjs/.cjs/.mts/.cts);
  // runAutoFixSinglePass enters import-validator by fence language, so these
  // must not bypass the guard. Shared with the jsx-checker guard.
  if (!isGuardablePath(filePath)) {
    return { ...result, reverted: false };
  }

  const errorsAfter = countParseErrors(result.code, filePath);
  if (errorsAfter === 0) {
    // Parse-clean output can still be semantically broken: an injection branch
    // may have re-declared a binding that already existed in an import shape
    // its line-based scan cannot see (multi-line import). Revert when the
    // fixer INTRODUCED duplicate import bindings; pre-existing duplicates are
    // left alone (upstream breakage stays visible downstream).
    const introducedDuplicates = findIntroducedDuplicateImportBindings(
      code,
      result.code,
      filePath,
    );
    if (introducedDuplicates.length === 0) {
      return { ...result, reverted: false };
    }
    return {
      code,
      fixes: [],
      warnings: [
        ...result.warnings,
        `import-validator reverted: it introduced duplicate import binding(s) ` +
          `(${introducedDuplicates.join(", ")}) — kept pre-fixer content`,
      ],
      reverted: true,
    };
  }

  const errorsBefore = countParseErrors(code, filePath);
  if (errorsBefore > 0) {
    // Pre-existing breakage — not import-validator's fault. Keep its output so
    // the broken state still flows downstream to preflight/diagnostics.
    return { ...result, reverted: false };
  }

  return {
    code,
    fixes: [],
    warnings: [
      ...result.warnings,
      `import-validator reverted: it made a parseable file unparseable ` +
        `(${errorsAfter} parser error(s)) — kept pre-fixer content`,
    ],
    reverted: true,
  };
}
