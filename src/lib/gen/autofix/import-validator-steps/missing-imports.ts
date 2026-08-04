import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { AutoFixEntry } from "../pipeline";
import { collectImportBoundNames } from "./bound-names";
import {
  KNOWN_MODULE_SPECIFIERS,
  LUCIDE_TYPE_ONLY_IMPORTS,
  NEXT_AUTO_IMPORTS,
  REACT_HOOKS,
} from "./known-imports";

// ---------------------------------------------------------------------------
// Missing import detection: scan JSX for unimported components
// ---------------------------------------------------------------------------

export function detectMissingImports(code: string): { code: string; fixes: AutoFixEntry[] } {
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
