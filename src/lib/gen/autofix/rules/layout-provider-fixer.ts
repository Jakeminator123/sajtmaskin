import type { CodeFile } from "@/lib/gen/parser";
import type { FixEntry } from "../types";

// ---------------------------------------------------------------------------
// Detects missing provider wrapping in root layout and injects it.
//
// Currently handles:
//  1. ThemeProvider (next-themes) — when theme signals are present
//  2. Toaster (sonner) — when toast usage is detected elsewhere
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

  if (fixes.length === 0) return { files, fixes: [] };

  const updated = files.map((f) =>
    f.path === layout.path ? { ...f, content } : f,
  );
  return { files: updated, fixes };
}
