import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { AutoFixEntry } from "./pipeline";
import {
  countParseErrors,
  isDenylistedStubDefaultName,
} from "./rules/import-binding-ast";
import { classifyShadcnLucideCollisionUsage } from "./rules/lucide-misuse-fixer";

/**
 * Single-line import matcher. Multiline imports are normalised first
 * via `flattenMultilineImports`, so this regex only needs to handle the
 * collapsed form.
 */
const IMPORT_RE =
  /^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/gm;
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

/**
 * Built-in DOM and standard-library types that appear in TypeScript generic
 * positions (e.g. `useRef<HTMLDivElement>`, `FormEvent<HTMLFormElement>`).
 * These are matched by `JSX_OPEN_TAG_RE` because the trailing `>` satisfies
 * the `[\s/>]` lookahead — they are NOT JSX components and must never trigger
 * a generated `@/components/<kebab>` stub import.
 *
 * `HTMLxxxElement` and `SVGxxxElement` are handled by the regex in
 * `isDenylistedStubDefaultName` (see `rules/import-binding-ast.ts`).
 */
const GLOBAL_TYPES = new Set([
  // React event types
  "FormEvent",
  "MouseEvent",
  "KeyboardEvent",
  "ChangeEvent",
  "FocusEvent",
  "DragEvent",
  "ClipboardEvent",
  "TouchEvent",
  "WheelEvent",
  "AnimationEvent",
  "TransitionEvent",
  "PointerEvent",
  "UIEvent",
  "Event",
  "EventTarget",
  // DOM globals
  "Document",
  "Window",
  "Element",
  "Node",
  "NodeList",
  "CSSStyleDeclaration",
  "MutationObserver",
  "IntersectionObserver",
  "ResizeObserver",
  "AbortController",
  "AbortSignal",
  "Headers",
  "Request",
  "Response",
  "URL",
  "URLSearchParams",
  "FormData",
  "Blob",
  "File",
  "FileList",
  "FileReader",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  // Common React type helpers used as generics
  "HTMLAttributes",
  "ComponentProps",
  "PropsWithChildren",
  "ReactNode",
  "ReactElement",
  "CSSProperties",
  "RefObject",
  "MutableRefObject",
  "Ref",
  // TypeScript utility / built-ins occasionally written in generic position
  "Promise",
  "Array",
  "Map",
  "Set",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
]);

/**
 * Returns true for tokens that look like built-in DOM/standard types and must
 * never be treated as missing JSX components.
 */
function isGlobalTypeName(name: string): boolean {
  if (GLOBAL_TYPES.has(name)) return true;
  return isDenylistedStubDefaultName(name);
}

/**
 * Flatten multiline import declarations into a single line so the simple
 * `IMPORT_RE` regex can pick up every named binding. Without this, an import
 * like:
 *
 *   import {
 *     RigidBody,
 *     type RapierRigidBody,
 *   } from "@react-three/rapier";
 *
 * would not be recognised, and `RapierRigidBody` would be reported as missing
 * even though it is already imported.
 */
function flattenMultilineImports(code: string): string {
  const lines = code.split("\n");
  const out: string[] = [];
  let buffer: string[] | null = null;

  for (const line of lines) {
    if (buffer) {
      buffer.push(line);
      // Continue collecting until we close the brace AND see `from "..."` (or `;`).
      const joined = buffer.join(" ");
      if (/\}\s*from\s*["'][^"']+["']/.test(joined) || /\}\s*;?\s*$/.test(line)) {
        out.push(joined.replace(/\s+/g, " "));
        buffer = null;
      }
      continue;
    }

    // Detect the start of a multiline named import: `import ... { ... ` without
    // a closing `}` on the same line.
    if (/^\s*import\s+(?:type\s+)?\{[^}]*$/.test(line)) {
      buffer = [line];
      continue;
    }

    out.push(line);
  }

  // Flush any unterminated buffer back as-is.
  if (buffer) out.push(...buffer);

  return out.join("\n");
}

function extractImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  const flattened = flattenMultilineImports(code);
  IMPORT_RE.lastIndex = 0;

  for (const match of flattened.matchAll(IMPORT_RE)) {
    if (match[1]) {
      for (const n of match[1].split(",")) {
        // Strip a leading `type ` modifier on a per-binding basis so
        // `import { RigidBody, type RapierRigidBody } ...` registers both.
        const cleaned = n.trim().replace(/^type\s+/, "");
        const trimmed = cleaned.split(/\s+as\s+/).pop()?.trim();
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
  // SAJ-63: also capture `type Foo = ...`, `interface Foo`, `class Foo` so
  // jsx-checker does not (a) emit phantom imports for names that are local TS
  // types used in generic position (`useState<GamePhase>(...)` paired with
  // `type GamePhase = "idle" | "playing" | "finished"`) and (b) raise tag-
  // mismatch warnings for those same TS-generic positions.
  // Direct follow-up to SAJ-61b (which only covered `type Lane = ...` via the
  // import path) — this also hardens `checkTagMatching` and `interface`/`class`.
  const TYPE_RE = /(?:type|interface|class)\s+([A-Z]\w*)\b/g;
  for (const m of code.matchAll(TYPE_RE)) {
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
 *
 * NOTE: the counting is regex-heuristic and mis-fires on valid JSX shapes
 * (nested self-closing in props, `=>` in props, imported types in generic
 * position). `runJsxChecker` therefore parse-gates the result: warnings are
 * only emitted when the TS parser confirms the file does not parse.
 *
 * SAJ-63: takes `localDecls` so a name that is locally a TS `type`/`interface`/
 * `class` (and therefore appears in a generic position like `useState<X>(…)`,
 * not as a JSX tag) is excluded from mismatch counting. Without this, TS
 * generics produce false positive `Tag mismatch for <X>: 1 opening vs 0 closing`
 * warnings that drive autofix into a phantom-import loop.
 */
function checkTagMatching(code: string, localDecls: Set<string>): string[] {
  const warnings: string[] = [];
  const openCounts = new Map<string, number>();
  const closeCounts = new Map<string, number>();

  const codeWithoutSelfClosing = code.replace(/<([A-Z]\w*)(?:\s[^>]*)?\/>/g, "");

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
    if (localDecls.has(tag)) continue;
    // Global DOM/standard-library type names appear in TS generic positions
    // (`useRef<HTMLCanvasElement | null>`) where JSX_OPEN_TAG_RE still matches.
    // They can never be JSX components, so counting them produces false
    // `Tag mismatch for <HTMLCanvasElement>: 1 opening vs 0 closing` warnings —
    // which escalate to preview-blocking verifier findings in canvas/R3F files
    // (prod chat 1c34592c v3 was failed + sent to repair on exactly this).
    // Same exclusion `fixMissingImports` already applies.
    if (isGlobalTypeName(tag)) continue;
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

function isPreviewCriticalJsxFile(filePath: string | undefined, code: string): boolean {
  const normalized = (filePath ?? "").replace(/\\/g, "/").toLowerCase();
  if (/components\/.*(?:3d|three|webgl).*\.tsx?$/.test(normalized)) return true;
  // Case-SENSITIVE on purpose: `<Canvas` is the R3F component while `<canvas`
  // is a plain HTML element (2D canvas games etc). The previous `i` flag made
  // every DOM-canvas file "R3F-critical", escalating ordinary jsx-checker
  // warnings to preview-blocking verifier findings. `<mesh`/`<group` are the
  // lowercase R3F intrinsics; the package specifiers are lowercase already.
  if (/@react-three\/fiber|@react-three\/drei|<Canvas\b|<mesh\b|<group\b/.test(code)) {
    return true;
  }
  return false;
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
    // Built-in DOM/standard-library types appear in TS generic positions like
    // `useRef<HTMLDivElement>` and must not be treated as missing components.
    if (isGlobalTypeName(comp)) continue;
    if (imported.has(comp)) continue;
    if (localDecls.has(comp)) continue;
    missing.push(comp);
  }

  if (missing.length === 0) return { code, fixes, warnings };

  const lucideNames: string[] = [];
  const shadcnByPath = new Map<string, string[]>();
  const genericNames: string[] = [];

  for (const name of missing) {
    // shadcn∩lucide collision (Badge, Calendar, Table, …): decide by usage.
    // Children or `variant=`/`asChild` means the shadcn component — merging the
    // name into the lucide import instead renders an svg glyph whose children
    // are invalid HTML (hydration mismatch; prod chat 1c34592c v3). Same
    // usage-classifier as the ts2304 fixer; mixed/bare usage stays unresolved
    // (one import can't satisfy both — the LLM fixer owns that case).
    if (LUCIDE_ICONS.has(name) && SHADCN_COMPONENTS[name]) {
      const usage = classifyShadcnLucideCollisionUsage(code, name);
      if (usage === "shadcn") {
        const path = `@/components/ui/${SHADCN_COMPONENTS[name]}`;
        const existing = shadcnByPath.get(path) ?? [];
        existing.push(name);
        shadcnByPath.set(path, existing);
      } else if (usage === "lucide") {
        lucideNames.push(name);
      } else {
        warnings.push(
          `Skipped ambiguous shadcn∩lucide import for ${name} (mixed/bare usage — left for the LLM fixer)`,
        );
      }
    } else if (LUCIDE_ICONS.has(name)) {
      lucideNames.push(name);
    } else if (SHADCN_COMPONENTS[name]) {
      const path = `@/components/ui/${SHADCN_COMPONENTS[name]}`;
      const existing = shadcnByPath.get(path) ?? [];
      existing.push(name);
      shadcnByPath.set(path, existing);
    } else if (isDenylistedStubDefaultName(name)) {
      // Final safety net: never emit `import X from "@/components/<kebab>"`
      // for known-bad names (DOM types, package re-exports). These would
      // create non-existent stub modules and break the build.
      warnings.push(
        `Skipped generated stub import for built-in/global name: ${name}`,
      );
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

/**
 * SAJ-63: hook files (e.g. `hooks/use-reduced-motion.ts`, `use-pointer.tsx`)
 * are not React components — they are functions named `useX` that return
 * primitives or refs. The default-export check is meaningless for them and
 * produced a noisy false positive `No default export found — could not
 * determine component to export` in run 20260427-095232-freeform.
 */
function isHookFilePath(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  if (lower.includes("/hooks/")) return true;
  const basename = lower.split(/[\\/]/).pop() ?? "";
  return /^use-[a-z]/.test(basename);
}

export function runJsxChecker(
  code: string,
  filePath?: string,
): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const fixes: AutoFixEntry[] = [];
  const warnings: string[] = [];

  // SAJ-63: compute localDecls once and share with checkTagMatching so TS
  // generic positions (`useState<GamePhase>(…)` paired with a local
  // `type GamePhase`) do not produce phantom `Tag mismatch` warnings.
  const localDecls = extractLocalDeclarations(code);

  let tagWarnings = checkTagMatching(code, localDecls);
  // PARSE GATE: the TS parser is ground truth for tag pairing — a genuinely
  // unclosed or mis-paired JSX tag ALWAYS makes a .tsx/.jsx file unparseable.
  // The naive count regexes above mis-fire on perfectly VALID JSX (nested
  // self-closing inside a prop `fallback={<X />}`, `=>` inside self-closing
  // props, imported types in generic position `useRef<Group>(null)`), and a
  // false `Tag mismatch` here escalates to a preview-blocking verifier
  // finding that fails the version and sends it into a repair loop that can
  // never converge (prod: retro-3D "Monster 3D", components/retro-3d-scene.tsx).
  // So: only emit tag warnings when the file actually fails to parse — the
  // counts then serve as locator hints for the repair prompt. Lazy: the
  // parser only runs when the regex counting flagged something.
  if (
    tagWarnings.length > 0 &&
    countParseErrors(code, filePath ?? "generated-file.tsx") === 0
  ) {
    tagWarnings = [];
  }
  const criticalJsxFile = isPreviewCriticalJsxFile(filePath, code);
  warnings.push(
    ...tagWarnings.map((warning) =>
      criticalJsxFile ? `preview-blocking: ${warning}` : warning,
    ),
  );

  const importResult = fixMissingImports(code);
  let currentCode = importResult.code;
  fixes.push(...importResult.fixes);
  warnings.push(...importResult.warnings);

  // SAJ-63: skip default-export check for hook files. A `use-*.ts(x)` file
  // (or any file under `/hooks/`) is by convention a named-export hook, not
  // a component, and the heuristic that walks for "last function returning
  // JSX" is meaningless there.
  if (!isHookFilePath(filePath)) {
    const exportResult = fixMissingDefaultExport(currentCode);
    currentCode = exportResult.code;
    fixes.push(...exportResult.fixes);
    warnings.push(...exportResult.warnings);
  }

  return { code: currentCode, fixes, warnings };
}
