import type { CodeFile } from "./types";
import { normalizeRoutePath } from "./utils";
import { findPageFile, findCssFiles, findComponentFiles } from "./file-resolution";
import { normalizePreviewCss, buildPreviewBaseCss } from "./css";
import { buildPreviewScript } from "./script-builder";

export function buildPreviewHtml(files: CodeFile[], routePath?: string | null): string | null {
  const normalizedRoute = normalizeRoutePath(routePath);
  const pageFile = findPageFile(files, normalizedRoute);
  if (!pageFile) return null;

  const cssFiles = findCssFiles(files);
  const componentFiles = findComponentFiles(files, pageFile.path);
  const customCss = normalizePreviewCss(
    cssFiles
      .map((f) => f.content)
      .join("\n"),
  );
  const baseCss = buildPreviewBaseCss();
  const previewScript = buildPreviewScript(pageFile, componentFiles, normalizedRoute);

  const allContent = [pageFile, ...componentFiles, ...cssFiles].map((f) => f.content).join("\n");
  const wantsDark = /className=["'][^"']*\bdark\b/.test(allContent) || /class=["'][^"']*\bdark\b/.test(allContent);
  const htmlClass = wantsDark ? ' class="dark"' : "";

  return `<!DOCTYPE html>
<html lang="sv"${htmlClass}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Preview</title>
  <script>
    (() => {
      const originalWarn = console.warn.bind(console);
      const tailwindBrowserWarning = "cdn.tailwindcss.com should not be used in production";
      console.warn = (...args) => {
        const joined = args
          .map((arg) => (typeof arg === "string" ? arg : ""))
          .join(" ");
        if (joined.includes(tailwindBrowserWarning)) return;
        originalWarn(...args);
      };
      window.__restorePreviewWarn = () => {
        console.warn = originalWarn;
      };
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    window.__restorePreviewWarn?.();
    delete window.__restorePreviewWarn;
    if (typeof tailwind !== 'undefined') {
      tailwind.config = { darkMode: 'class' };
    }
  </script>
  <style>
    ${baseCss}
    ${customCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script>
    ${previewScript}
  <\/script>
</body>
</html>`;
}

/**
 * Prepares files for @vercel/sandbox consumption.
 * Converts CodeFile[] to the Record<string, string> format the sandbox API expects.
 */
export function buildSandboxFiles(files: CodeFile[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of files) {
    result[file.path] = file.content;
  }
  return result;
}

/**
 * Creates a preview URL for a given chatId + versionId.
 * Points to the /api/preview-render endpoint which serves the HTML.
 */
export function buildPreviewUrl(
  chatId: string,
  versionId: string,
  projectId?: string | null,
  routePath?: string | null,
): string {
  const params = new URLSearchParams({
    chatId,
    versionId,
  });
  if (projectId) {
    params.set("projectId", projectId);
  }
  const normalizedRoute = normalizeRoutePath(routePath);
  if (normalizedRoute !== "/") {
    params.set("route", normalizedRoute);
  }
  return `/api/preview-render?${params.toString()}`;
}

export type { CodeFile, ImportBinding, ParsedImport, PreparedModule, PreviewValidationIssue } from "./types";
export { isPreviewBuiltinImportSource, PREVIEW_BUILTIN_SOURCES } from "./constants";
export { normalizeFilePath, normalizeRoutePath, routeFromPageFile, resolveLocalImportPath } from "./utils";
export { findPageFile, findCssFiles, findComponentFiles, buildCodeFileMap } from "./file-resolution";
export { parseImports, stripNextImports } from "./import-parser";
export { buildPreviewBaseCss, normalizePreviewCss } from "./css";
export { prepareModules } from "./transpile";
export { buildPreviewPrelude } from "./shims";
export { buildPreviewScript, collectPreviewValidationIssues } from "./script-builder";
