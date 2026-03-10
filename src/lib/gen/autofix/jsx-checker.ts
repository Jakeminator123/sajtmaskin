import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { AutoFixEntry } from "./pipeline";

const IMPORT_RE = /^import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/gm;
const JSX_OPEN_TAG_RE = /<([A-Z]\w*)[\s/>]/g;
const JSX_SELF_CLOSING_RE = /<([A-Z]\w*)\s[^>]*\/>/g;
const JSX_CLOSE_TAG_RE = /<\/([A-Z]\w*)\s*>/g;
const DEFAULT_EXPORT_RE = /export\s+default\s+/m;
const LUCIDE_IMPORT_RE =
  /^\s*import\s*\{[^}]+\}\s*from\s*["']lucide-react["']/m;
const TOP_LEVEL_COMPONENT_RE =
  /^(?:export\s+)?(?:function\s+([A-Z]\w*)|(?:const|let)\s+([A-Z]\w*)\s*=)/;

const BUILT_IN = new Set([
  "Fragment",
  "Suspense",
  "StrictMode",
  "Profiler",
]);

function extractImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  IMPORT_RE.lastIndex = 0;

  for (const match of code.matchAll(IMPORT_RE)) {
    if (match[1]) {
      for (const n of match[1].split(",")) {
        const trimmed = n.trim().split(/\s+as\s+/).pop()?.trim();
        if (trimmed) names.add(trimmed);
      }
    }
    if (match[2]) {
      names.add(match[2]);
    }
  }

  return names;
}

function extractUsedComponents(code: string): Set<string> {
  const used = new Set<string>();

  JSX_OPEN_TAG_RE.lastIndex = 0;
  for (const m of code.matchAll(JSX_OPEN_TAG_RE)) {
    used.add(m[1]);
  }
  JSX_SELF_CLOSING_RE.lastIndex = 0;
  for (const m of code.matchAll(JSX_SELF_CLOSING_RE)) {
    used.add(m[1]);
  }

  return used;
}

function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function extractLocalDeclarations(code: string): Set<string> {
  const decls = new Set<string>();
  const FUNC_RE = /(?:function|const|let|var)\s+([A-Z]\w*)\s*[=(]/g;
  for (const m of code.matchAll(FUNC_RE)) {
    decls.add(m[1]);
  }
  return decls;
}

function findLastImportLine(lines: string[]): number {
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) last = i;
  }
  return last;
}

/**
 * Simple tag-matching check: count opening and closing tags.
 * Returns warnings for any components with mismatched counts.
 */
function checkTagMatching(code: string): string[] {
  const warnings: string[] = [];
  const openCounts = new Map<string, number>();
  const closeCounts = new Map<string, number>();

  const codeWithoutSelfClosing = code.replace(/<([A-Z]\w*)\s[^>]*\/>/g, "");

  JSX_OPEN_TAG_RE.lastIndex = 0;
  for (const m of codeWithoutSelfClosing.matchAll(JSX_OPEN_TAG_RE)) {
    openCounts.set(m[1], (openCounts.get(m[1]) ?? 0) + 1);
  }

  JSX_CLOSE_TAG_RE.lastIndex = 0;
  for (const m of codeWithoutSelfClosing.matchAll(JSX_CLOSE_TAG_RE)) {
    closeCounts.set(m[1], (closeCounts.get(m[1]) ?? 0) + 1);
  }

  const allTags = new Set([...openCounts.keys(), ...closeCounts.keys()]);
  for (const tag of allTags) {
    const open = openCounts.get(tag) ?? 0;
    const close = closeCounts.get(tag) ?? 0;
    if (open !== close) {
      warnings.push(
        `Tag mismatch for <${tag}>: ${open} opening vs ${close} closing`,
      );
    }
  }

  return warnings;
}

/**
 * Fix missing component imports:
 * - Lucide icons → merge into existing lucide-react import or add new one
 * - shadcn/ui components → import from correct @/components/ui/... path
 * - Other → default import from @/components/kebab-case-name
 */
function fixMissingImports(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const fixes: AutoFixEntry[] = [];
  const warnings: string[] = [];
  const imported = extractImportedNames(code);
  const used = extractUsedComponents(code);
  const localDecls = extractLocalDeclarations(code);

  const missing: string[] = [];
  for (const comp of used) {
    if (BUILT_IN.has(comp)) continue;
    if (imported.has(comp)) continue;
    if (localDecls.has(comp)) continue;
    missing.push(comp);
  }

  if (missing.length === 0) return { code, fixes, warnings };

  const lucideNames: string[] = [];
  const shadcnByPath = new Map<string, string[]>();
  const genericNames: string[] = [];

  for (const name of missing) {
    if (LUCIDE_ICONS.has(name)) {
      lucideNames.push(name);
    } else if (SHADCN_COMPONENTS[name]) {
      const path = `@/components/ui/${SHADCN_COMPONENTS[name]}`;
      const existing = shadcnByPath.get(path) ?? [];
      existing.push(name);
      shadcnByPath.set(path, existing);
    } else {
      genericNames.push(name);
    }
  }

  const lines = code.split("\n");

  if (lucideNames.length > 0) {
    const lucideIdx = lines.findIndex((l) => LUCIDE_IMPORT_RE.test(l));
    if (lucideIdx >= 0) {
      lines[lucideIdx] = lines[lucideIdx].replace(
        /(\}\s*from)/,
        `, ${lucideNames.join(", ")} $1`,
      );
      fixes.push({
        fixer: "jsx-checker",
        description: `Merged ${lucideNames.join(", ")} into lucide-react import`,
        line: lucideIdx + 1,
      });
    } else {
      const insertIdx = findLastImportLine(lines) + 1;
      lines.splice(
        insertIdx,
        0,
        `import { ${lucideNames.join(", ")} } from "lucide-react"`,
      );
      fixes.push({
        fixer: "jsx-checker",
        description: `Added lucide-react import for ${lucideNames.join(", ")}`,
        line: insertIdx + 1,
      });
    }
  }

  for (const [path, names] of shadcnByPath) {
    const insertIdx = findLastImportLine(lines) + 1;
    lines.splice(
      insertIdx,
      0,
      `import { ${names.join(", ")} } from "${path}"`,
    );
    fixes.push({
      fixer: "jsx-checker",
      description: `Added import for ${names.join(", ")} from ${path}`,
      line: insertIdx + 1,
    });
  }

  for (const name of genericNames) {
    const insertIdx = findLastImportLine(lines) + 1;
    const kebab = pascalToKebab(name);
    lines.splice(
      insertIdx,
      0,
      `import ${name} from "@/components/${kebab}"`,
    );
    fixes.push({
      fixer: "jsx-checker",
      description: `Added missing import for <${name}>`,
      line: insertIdx + 1,
    });
  }

  return { code: lines.join("\n"), fixes, warnings };
}

/**
 * If no `export default` exists, find the last top-level function/const
 * that returns JSX and append `export default ComponentName` at the end.
 */
function fixMissingDefaultExport(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  DEFAULT_EXPORT_RE.lastIndex = 0;
  if (DEFAULT_EXPORT_RE.test(code)) {
    return { code, fixes: [], warnings: [] };
  }

  const lines = code.split("\n");
  let lastComponentName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TOP_LEVEL_COMPONENT_RE);
    if (!match) continue;

    const name = match[1] || match[2];
    const rest = lines.slice(i).join("\n");
    const hasJsx =
      /<[A-Z]|<div|<span|<section|<main|<header|<footer|<nav|<ul|<li|<p[ >\n]|<h[1-6]|<form|<button|<input|<a[ >\n]/i.test(
        rest,
      );
    if (hasJsx) {
      lastComponentName = name;
    }
  }

  if (!lastComponentName) {
    return {
      code,
      fixes: [],
      warnings: [
        "No default export found — could not determine component to export",
      ],
    };
  }

  return {
    code: code.trimEnd() + `\n\nexport default ${lastComponentName};\n`,
    fixes: [
      {
        fixer: "jsx-checker",
        description: `Added default export for ${lastComponentName}`,
        line: lines.length + 1,
      },
    ],
    warnings: [],
  };
}

export function runJsxChecker(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const fixes: AutoFixEntry[] = [];
  const warnings: string[] = [];

  warnings.push(...checkTagMatching(code));

  const importResult = fixMissingImports(code);
  let currentCode = importResult.code;
  fixes.push(...importResult.fixes);
  warnings.push(...importResult.warnings);

  const exportResult = fixMissingDefaultExport(currentCode);
  currentCode = exportResult.code;
  fixes.push(...exportResult.fixes);
  warnings.push(...exportResult.warnings);

  return { code: currentCode, fixes, warnings };
}
