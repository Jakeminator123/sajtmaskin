import type { CodeFile } from "@/lib/gen/parser";
import type { FixEntry } from "../types";

// ---------------------------------------------------------------------------
// Detects missing provider wrapping in root layout and injects it.
//
// Currently handles:
//  1. ThemeProvider (next-themes) — when theme signals are present
//  2. Toaster (sonner) — when toast usage is detected elsewhere
//  3. Hoist raw <script> / next/script <Script> / <Analytics /> out of
//     ThemeProvider. ThemeProvider is a Client Component; a <script> child
//     makes React 19 warn "Encountered a script tag while rendering React
//     component" and trip the Next overlay (prod chats 2026-08-18:
//     a53cf1ee / 3b8fbc58 — JSON-LD + Analytics inside ThemeProvider).
//
// Does NOT touch custom providers (CartProvider, AuthProvider, …) because
// those require app-specific props. The cross-file-import-checker already
// generates functional provider stubs for those.
// ---------------------------------------------------------------------------

const LAYOUT_FILE_RE = /^(?:src\/)?app\/layout\.(tsx|jsx)$/;
const THEME_SIGNAL_RE =
  /suppressHydrationWarning|className=.*\bdark\b|class=.*\bdark\b|next-themes/;
const THEME_PROVIDER_USAGE_RE = /ThemeProvider|useTheme/;
const TOAST_USAGE_RE = /\btoast\s*\(|\bsonner\b|\bToaster\b/;

const THEME_PROVIDER_IMPORT = 'import { ThemeProvider } from "next-themes";';
const TOASTER_IMPORT = 'import { Toaster } from "@/components/ui/sonner";';

function isRootLayout(path: string): boolean {
  return LAYOUT_FILE_RE.test(path.replace(/\\/g, "/"));
}

function hasThemeProvider(content: string): boolean {
  return /\bThemeProvider\b/.test(content);
}

function hasToaster(content: string): boolean {
  return /\bToaster\b/.test(content) && /from\s+["']@\/components\/ui\/sonner["']/.test(content);
}

function projectUsesTheme(files: CodeFile[]): boolean {
  return files.some(
    (f) =>
      !isRootLayout(f.path) &&
      /\.(tsx?|jsx?)$/.test(f.path) &&
      THEME_PROVIDER_USAGE_RE.test(f.content),
  );
}

function projectUsesToasts(files: CodeFile[]): boolean {
  return files.some(
    (f) =>
      !isRootLayout(f.path) &&
      /\.(tsx?|jsx?)$/.test(f.path) &&
      TOAST_USAGE_RE.test(f.content),
  );
}

function depsInclude(files: CodeFile[], pkg: string): boolean {
  const pkgFile = files.find(
    (f) => f.path.replace(/\\/g, "/") === "package.json",
  );
  return pkgFile ? pkgFile.content.includes(`"${pkg}"`) : false;
}

function addImport(content: string, importLine: string): string {
  const lines = content.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i]!)) lastImportIdx = i;
  }
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return lines.join("\n");
}

/**
 * Wrap the ENTIRE `<body>` content in the provider — never a nested
 * `{children}` token.
 *
 * Prod incident 2026-08-01 (chat e8bd3ba6, "Sniglar på Mars"): the previous
 * implementation wrapped the first `{children}` occurrence, which in scaffold
 * layouts sits inside `<main>`. next-themes' ThemeProvider renders an inline
 * theme-init `<script>`, and with the provider injected mid-tree the preview
 * threw "Encountered a script tag while rendering React component" plus a
 * hydration mismatch that cross-matched sibling elements. Body level is the
 * documented next-themes placement and keeps the script out of the content
 * tree. Returns null when no body section is found (skip injection — a root
 * layout without <body> is broken for other reasons).
 */
function wrapBodyContentWithProvider(
  content: string,
  providerTag: string,
  attrs: string,
): string | null {
  // Line-anchored on purpose (Bugbot on #709): a bare /<body…>/ also matches
  // prose in comments ("// the <body> element…") and would splice the provider
  // into the comment. In a real root layout the JSX tags start their own lines,
  // while comment mentions carry a `//`, `*` or `{/*` prefix and never match.
  const bodyOpenMatch = /^[ \t]*<body\b[^>]*>/m.exec(content);
  if (!bodyOpenMatch) return null;
  const openEnd = bodyOpenMatch.index + bodyOpenMatch[0].length;

  let bodyCloseMatch: RegExpExecArray | null = null;
  for (const match of content.matchAll(/^([ \t]*)<\/body>/gm)) {
    bodyCloseMatch = match;
  }
  if (!bodyCloseMatch) return null;
  const closeIdx = bodyCloseMatch.index + bodyCloseMatch[1]!.length;
  if (closeIdx <= openEnd) return null;

  const opening = attrs ? `<${providerTag} ${attrs}>` : `<${providerTag}>`;
  const closing = `</${providerTag}>`;
  // Indentation of the `</body>` line drives the inserted lines so the
  // result stays readable for follow-up prompts that echo file contents.
  const closeIndent = bodyCloseMatch[1]!;
  const innerIndent = `${closeIndent}  `;
  const inner = content.slice(openEnd, closeIdx).replace(/\s+$/, "");

  return (
    content.slice(0, openEnd) +
    `\n${innerIndent}${opening}` +
    inner +
    `\n${innerIndent}${closing}` +
    `\n${closeIndent}` +
    content.slice(closeIdx)
  );
}

function insertSiblingBeforeClosingBody(
  content: string,
  jsx: string,
): string {
  const re = /(\s*)((<\/body>)|(<\/html>))/;
  const m = content.match(re);
  if (!m) return content;
  const indent = m[1] ?? "        ";
  return content.replace(re, `${indent}${jsx}\n$2`);
}

const THEME_PROVIDER_CLOSE = "</ThemeProvider>";
const HOISTABLE_OPEN_RE = /<(script|Script|Analytics)\b/g;

/**
 * Line-anchored open search (same class as the <body> matcher above /
 * Bugbot on #709 + #1031): a bare `/<ThemeProvider\b/` also matches prose in
 * comments (`// <ThemeProvider>…`) and would hoist out of a comment into live
 * module-level JSX. Real root-layout providers start their own lines.
 */
function findLiveThemeProviderOpen(source: string): number {
  const match = /^[ \t]*<ThemeProvider\b/m.exec(source);
  return match ? match.index + match[0].indexOf("<ThemeProvider") : -1;
}

function isLikelyJsxTagAt(source: string, index: number): boolean {
  if (index === 0) return true;
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  const prefix = source.slice(lineStart, index);
  if (prefix.includes("//")) return false;
  if (prefix.includes("{/*")) return false;
  const prev = source[index - 1];
  return prev !== undefined && /[\s>({\[]/.test(prev);
}

/**
 * True when `index` sits inside a JSX/block comment or after `//` on its line.
 * Used so a ThemeProvider close tag inside a JSX comment cannot truncate the
 * real provider region (Bugbot high on #1031).
 */
function isInsideComment(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  const linePrefix = source.slice(lineStart, index);
  if (linePrefix.includes("//")) return true;

  // Walk backwards for the nearest `/*` / `{/*` that is not already closed
  // before `index`. Cheap and good enough for layout files.
  const before = source.slice(0, index);
  const lastBlockOpen = Math.max(before.lastIndexOf("{/*"), before.lastIndexOf("/*"));
  if (lastBlockOpen < 0) return false;
  const closer = before.indexOf("*/", lastBlockOpen + 2);
  return closer < 0 || closer >= index;
}

function findOpeningTagEnd(source: string, tagStart: number): number | null {
  let quote: string | null = null;
  let brace = 0;
  for (let i = tagStart + 1; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) {
      if (ch === "\\" && i + 1 < source.length) {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      brace += 1;
      continue;
    }
    if (ch === "}") {
      if (brace > 0) brace -= 1;
      continue;
    }
    if (brace > 0) continue;
    if (ch === "/" && source[i + 1] === ">") return i + 2;
    if (ch === ">") return i + 1;
  }
  return null;
}

function isSelfClosingOpen(source: string, tagStart: number, openEnd: number): boolean {
  return /\/\s*>$/.test(source.slice(tagStart, openEnd));
}

function findMatchingClose(source: string, innerStart: number, tagName: string): number | null {
  const close = `</${tagName}>`;
  const openNeedle = `<${tagName}`;
  let depth = 1;
  let i = innerStart;
  while (i < source.length) {
    const nextOpen = source.indexOf(openNeedle, i);
    const nextClose = source.indexOf(close, i);
    if (nextClose < 0) return null;
    // Skip comment/string lookalikes for both open and close (Bugbot #1031).
    const openIsTag =
      nextOpen >= 0 &&
      nextOpen < nextClose &&
      isLikelyJsxTagAt(source, nextOpen) &&
      !isInsideComment(source, nextOpen) &&
      (source[nextOpen + openNeedle.length] === undefined ||
        /[\s/>]/.test(source[nextOpen + openNeedle.length]!));
    if (openIsTag) {
      const openEnd = findOpeningTagEnd(source, nextOpen);
      if (openEnd === null) return null;
      if (!isSelfClosingOpen(source, nextOpen, openEnd)) depth += 1;
      i = openEnd;
      continue;
    }
    if (!isLikelyJsxTagAt(source, nextClose) || isInsideComment(source, nextClose)) {
      i = nextClose + close.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose;
    i = nextClose + close.length;
  }
  return null;
}

/**
 * True when the hoistable node sits inside a `{ … }` JSX expression (e.g.
 * `{enabled && <Analytics />}`). Hoisting only the tag would leave invalid
 * JSX (`{enabled && }`) and change conditional behavior (pr-ai-review
 * F-8c754d26e650 on #1031). Direct children — the prod shape — have brace
 * depth 0 and are still hoisted.
 */
function isInsideJsxExpression(inner: string, nodeStart: number): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < nodeStart; i++) {
    const ch = inner[i]!;
    if (quote) {
      if (ch === "\\" && i + 1 < nodeStart) {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}" && depth > 0) depth -= 1;
  }
  return depth > 0;
}

type HoistableNode = { start: number; end: number; name: string; text: string };

function findHoistableJsx(inner: string): HoistableNode[] {
  const nodes: HoistableNode[] = [];
  const scan = new RegExp(HOISTABLE_OPEN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = scan.exec(inner)) !== null) {
    if (!isLikelyJsxTagAt(inner, match.index)) continue;
    if (isInsideComment(inner, match.index)) continue;
    if (isInsideJsxExpression(inner, match.index)) continue;
    const name = match[1]!;
    const openEnd = findOpeningTagEnd(inner, match.index);
    if (openEnd === null) continue;
    let end = openEnd;
    if (!isSelfClosingOpen(inner, match.index, openEnd)) {
      const closeStart = findMatchingClose(inner, openEnd, name);
      if (closeStart === null) continue;
      end = closeStart + `</${name}>`.length;
    }
    nodes.push({
      start: match.index,
      end,
      name,
      text: inner.slice(match.index, end).trim(),
    });
    scan.lastIndex = end;
  }
  return nodes;
}

/**
 * Move <script>, next/script <Script>, and <Analytics /> from inside
 * ThemeProvider to siblings after </ThemeProvider>. Safe no-op when those
 * nodes already sit outside the provider (or there is no provider).
 */
function hoistScriptishOutOfThemeProvider(
  content: string,
): { content: string; description: string } | null {
  const openIdx = findLiveThemeProviderOpen(content);
  if (openIdx < 0) return null;
  const openEnd = findOpeningTagEnd(content, openIdx);
  if (openEnd === null || isSelfClosingOpen(content, openIdx, openEnd)) return null;
  const closeStart = findMatchingClose(content, openEnd, "ThemeProvider");
  if (closeStart === null) return null;

  const inner = content.slice(openEnd, closeStart);
  const nodes = findHoistableJsx(inner);
  if (nodes.length === 0) return null;

  let nextInner = inner;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const before = nextInner.slice(0, node.start);
    const after = nextInner.slice(node.end);
    nextInner = before.replace(/[ \t]+$/, "") + after.replace(/^\r?\n/, "\n");
  }
  nextInner = nextInner.replace(/\n[ \t]*\n[ \t]*$/, "\n");

  const lineStart = content.lastIndexOf("\n", closeStart - 1) + 1;
  const indent = content.slice(lineStart, closeStart);
  const closeEnd = closeStart + THEME_PROVIDER_CLOSE.length;
  const hoisted = nodes.map((node) => `${indent}${node.text}`).join("\n");
  const kinds = [...new Set(nodes.map((node) => node.name))];

  return {
    content:
      content.slice(0, openEnd) +
      nextInner +
      content.slice(closeStart, closeEnd) +
      "\n" +
      hoisted +
      content.slice(closeEnd),
    description: `Moved ${kinds.join(" + ")} out of ThemeProvider in root layout so React does not render a <script> inside a client component`,
  };
}

/**
 * The exact wrap shape the pre-2026-08-01 fixer injected around a nested
 * `{children}` (attrs are the fixer's own — a hand-written provider with
 * other attrs never matches). Whitespace is matched loosely because
 * follow-up generations may re-indent the block.
 */
const LEGACY_MIDTREE_WRAP_RE =
  /<ThemeProvider attribute="class" defaultTheme="system" enableSystem>\s*\{children\}\s*<\/ThemeProvider>/;

function providerIsDirectChildOfBody(content: string): boolean {
  return /<body\b[^>]*>\s*<ThemeProvider\b/.test(content);
}

/**
 * Heal pass for layouts that already carry the old mid-tree injection
 * (persisted by earlier generations — 36 of 60 prod versions in the 14 days
 * before the fix). Strips the legacy wrap back to `{children}` and re-wraps
 * at body level, so an affected site is repaired on its next generation.
 * When a body-level provider already exists (e.g. a follow-up added one
 * without removing the old inner wrap — Bugbot on #709), stripping the inner
 * wrap IS the whole fix; re-wrapping would double-nest the provider.
 */
function relocateLegacyMidTreeProvider(
  content: string,
): { content: string; description: string } | null {
  const legacyMatch = LEGACY_MIDTREE_WRAP_RE.exec(content);
  if (!legacyMatch) return null;
  // The match is itself the body-level provider (new-style output for a body
  // whose only content is {children}) — correct placement, nothing to heal.
  if (/<body\b[^>]*>\s*$/.test(content.slice(0, legacyMatch.index))) return null;

  const stripped = content.replace(LEGACY_MIDTREE_WRAP_RE, "{children}");
  if (providerIsDirectChildOfBody(stripped)) {
    return {
      content: stripped,
      description:
        "Removed legacy nested ThemeProvider wrap in root layout (a body-level provider already exists)",
    };
  }
  const rewrapped = wrapBodyContentWithProvider(
    stripped,
    "ThemeProvider",
    'attribute="class" defaultTheme="system" enableSystem',
  );
  if (rewrapped === null) return null;
  return {
    content: rewrapped,
    description:
      "Relocated previously injected ThemeProvider from a nested wrapper to the <body> level in root layout",
  };
}

export function fixLayoutProviders(files: CodeFile[]): {
  files: CodeFile[];
  fixes: FixEntry[];
} {
  const layout = files.find((f) => isRootLayout(f.path));
  if (!layout) return { files, fixes: [] };

  let content = layout.content;
  const fixes: FixEntry[] = [];

  // --- ThemeProvider: heal legacy mid-tree injection ---
  const relocated = relocateLegacyMidTreeProvider(content);
  if (relocated !== null) {
    content = relocated.content;
    fixes.push({
      fixer: "layout-provider-fixer",
      category: "mechanical",
      description: relocated.description,
      file: layout.path,
    });
  }

  // --- ThemeProvider ---
  const needsTheme =
    !hasThemeProvider(content) &&
    (THEME_SIGNAL_RE.test(content) || projectUsesTheme(files)) &&
    depsInclude(files, "next-themes");

  if (needsTheme) {
    const wrapped = wrapBodyContentWithProvider(
      content,
      "ThemeProvider",
      'attribute="class" defaultTheme="system" enableSystem',
    );
    if (wrapped !== null) {
      content = addImport(wrapped, THEME_PROVIDER_IMPORT);
      fixes.push({
        fixer: "layout-provider-fixer",
        category: "mechanical",
        description:
          "Injected ThemeProvider from next-themes around the <body> content in root layout",
        file: layout.path,
      });
    }
  }

  // --- Toaster ---
  const needsToaster =
    !hasToaster(content) && projectUsesToasts(files);

  if (needsToaster) {
    content = addImport(content, TOASTER_IMPORT);
    content = insertSiblingBeforeClosingBody(content, "<Toaster />");
    fixes.push({
      fixer: "layout-provider-fixer",
      category: "mechanical",
      description: "Injected <Toaster /> from sonner before closing body in root layout",
      file: layout.path,
    });
  }

  // --- Script/Analytics inside ThemeProvider (client boundary) ---
  const hoisted = hoistScriptishOutOfThemeProvider(content);
  if (hoisted !== null) {
    content = hoisted.content;
    fixes.push({
      fixer: "layout-provider-fixer",
      category: "mechanical",
      description: hoisted.description,
      file: layout.path,
    });
  }

  if (fixes.length === 0) return { files, fixes: [] };

  const updated = files.map((f) =>
    f.path === layout.path ? { ...f, content } : f,
  );
  return { files: updated, fixes };
}
