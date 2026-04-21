import type { CodeFile } from "./types";
import { normalizeRoutePath } from "./utils";
import { findPageFile, findCssFiles, findComponentFiles } from "./file-resolution";
import { normalizePreviewCss, buildPreviewBaseCss } from "./css";
import { buildPreviewScript } from "./script-builder";
const PREVIEW_BOOT_TIMEOUT_MS = 7_000;
const TAILWIND_CDN_URL = "https://cdn.tailwindcss.com";
const REACT_UMD_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_UMD_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";

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
      const BOOT_TIMEOUT_MS = ${PREVIEW_BOOT_TIMEOUT_MS};
      const renderBootError = (message) => {
        const target = document.getElementById("root") || document.body;
        if (!target) return;
        target.innerHTML =
          '<div style="padding:2rem;font-family:system-ui;color:#ef4444">' +
          '<h2 style="margin:0 0 1rem">Preview-fel</h2>' +
          '<pre style="white-space:pre-wrap;font-size:13px;color:#a3a3a3">' +
          String(message || "Preview boot failed.") +
          "</pre></div>";
      };
      window.__previewBootReady = false;
      window.__previewBootError = (message) => {
        window.__previewBootReady = true;
        if (window.__previewBootTimer) {
          clearTimeout(window.__previewBootTimer);
          window.__previewBootTimer = null;
        }
        renderBootError(message);
      };
      window.__previewMarkReady = () => {
        window.__previewBootReady = true;
        if (window.__previewBootTimer) {
          clearTimeout(window.__previewBootTimer);
          window.__previewBootTimer = null;
        }
      };
      window.__previewBootTimer = setTimeout(() => {
        if (!window.__previewBootReady) {
          window.__previewBootError(
            "Preview runtime timed out before React boot completed. Check CDN/network access.",
          );
        }
      }, BOOT_TIMEOUT_MS);
    })();
  </script>
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
  <script src="${TAILWIND_CDN_URL}" onerror="window.__previewBootError && window.__previewBootError('Failed to load ${TAILWIND_CDN_URL}')"><\/script>
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
  <script src="${REACT_UMD_URL}" onerror="window.__previewBootError && window.__previewBootError('Failed to load ${REACT_UMD_URL}')"><\/script>
  <script src="${REACT_DOM_UMD_URL}" onerror="window.__previewBootError && window.__previewBootError('Failed to load ${REACT_DOM_UMD_URL}')"><\/script>
  <script>
    ${previewScript}
  <\/script>
</body>
</html>`;
}

