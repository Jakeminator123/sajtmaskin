import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import {
  findNearestIcon,
  isLucideTypeOnlyExport,
  parseSpecifier,
} from "@/lib/gen/suspense/rules/lucide-icon-fix";
import type { AutoFixEntry } from "./pipeline";

const IMPORT_RE = /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;

const KNOWN_MODULE_SPECIFIERS: Record<string, string[]> = {
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

  const importedNames = new Set<string>();
  for (const line of lines) {
    const defaultMatch = line.match(/^\s*import\s+(\w+)\s+from\s+/);
    if (defaultMatch) importedNames.add(defaultMatch[1]);

    const namedMatch = line.match(/^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+/);
    if (namedMatch) {
      for (const spec of namedMatch[1].split(",")) {
        const asMatch = spec.trim().match(/(\w+)\s+as\s+(\w+)/);
        importedNames.add(asMatch ? asMatch[2] : spec.trim());
      }
    }

    const namespaceMatch = line.match(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+/);
    if (namespaceMatch) importedNames.add(namespaceMatch[1]);
  }

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
  const fixes = [...nested.fixes, ...dupExport.fixes, ...shadcn.fixes, ...lucide.fixes, ...radix.fixes, ...slot.fixes, ...missing.fixes];
  const warnings = validateImports(missing.code);
  return { code: missing.code, fixes, warnings };
}
