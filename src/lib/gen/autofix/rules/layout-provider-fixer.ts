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

function wrapChildrenWithProvider(
  content: string,
  providerTag: string,
  attrs: string,
): string {
  const opening = attrs ? `<${providerTag} ${attrs}>` : `<${providerTag}>`;
  const closing = `</${providerTag}>`;

  // Match the {children} token in JSX, wrap it
  const childrenRe = /(\{children\})/;
  if (childrenRe.test(content)) {
    return content.replace(
      childrenRe,
      `${opening}\n            {children}\n          ${closing}`,
    );
  }
  return content;
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

export function fixLayoutProviders(files: CodeFile[]): {
  files: CodeFile[];
  fixes: FixEntry[];
} {
  const layout = files.find((f) => isRootLayout(f.path));
  if (!layout) return { files, fixes: [] };

  let content = layout.content;
  const fixes: FixEntry[] = [];

  // --- ThemeProvider ---
  const needsTheme =
    !hasThemeProvider(content) &&
    (THEME_SIGNAL_RE.test(content) || projectUsesTheme(files)) &&
    depsInclude(files, "next-themes");

  if (needsTheme) {
    content = addImport(content, THEME_PROVIDER_IMPORT);
    content = wrapChildrenWithProvider(
      content,
      "ThemeProvider",
      'attribute="class" defaultTheme="system" enableSystem',
    );
    fixes.push({
      fixer: "layout-provider-fixer",
      category: "mechanical",
      description:
        "Injected ThemeProvider from next-themes around {children} in root layout",
      file: layout.path,
    });
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
