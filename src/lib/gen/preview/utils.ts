import path from "node:path";
import { LOCAL_IMPORT_EXTENSIONS } from "./constants";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

export function normalizeRoutePath(routePath?: string | null): string {
  const raw = (routePath ?? "").trim();
  if (!raw) return "/";

  let pathname = raw;
  try {
    pathname = new URL(raw, "https://preview.local").pathname;
  } catch {
    pathname = raw.split(/[?#]/, 1)[0] || raw;
  }

  pathname = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return pathname || "/";
}

export function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function inferPreviewUiComponentName(source: string): string {
  const normalized = source.replace(/\\/g, "/").trim();
  const leaf = normalized.split("/").pop() ?? "";
  return toPascalCase(leaf.replace(/\.(tsx|ts|jsx|js)$/, "")) || "div";
}

export function routeFromPageFile(filePath: string): string | null {
  let normalized = normalizeFilePath(filePath);
  if (normalized.startsWith("src/")) normalized = normalized.slice(4);

  const appMatch = normalized.match(/^app\/(.+)\/page\.(tsx|jsx|ts|js)$/);
  if (appMatch) {
    const parts = appMatch[1]
      .split("/")
      .filter((segment) => segment !== "page")
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
    return parts.length > 0 ? `/${parts.join("/")}` : "/";
  }

  if (/^app\/page\.(tsx|jsx|ts|js)$/.test(normalized)) {
    return "/";
  }

  if (/^pages\/index\.(tsx|jsx|ts|js)$/.test(normalized)) {
    return "/";
  }

  const pagesMatch = normalized.match(/^pages\/(.+)\.(tsx|jsx|ts|js)$/);
  if (pagesMatch) {
    const parts = pagesMatch[1].split("/").filter((segment) => segment !== "index");
    return parts.length > 0 ? `/${parts.join("/")}` : "/";
  }

  return null;
}

export function escapeInlineScript(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1");
}

export function resolveLocalImportPath(fileMap: Map<string, unknown>, importerPath: string, source: string): string | null {
  const normalizedSource = source.trim();
  if (!normalizedSource.startsWith("@/") && !normalizedSource.startsWith("./") && !normalizedSource.startsWith("../")) {
    return null;
  }

  const normalizedImporterPath = normalizeFilePath(importerPath);
  const rawPath = normalizedSource.startsWith("@/")
    ? normalizeFilePath(normalizedSource.slice(2))
    : normalizeFilePath(
        path.posix.normalize(path.posix.join(path.posix.dirname(normalizedImporterPath), normalizedSource)),
      );

  const basePaths = normalizedSource.startsWith("@/")
    ? Array.from(new Set([rawPath, normalizeFilePath(`src/${rawPath}`)]))
    : [rawPath];
  const candidates = basePaths.flatMap((basePath) => [
    basePath,
    ...LOCAL_IMPORT_EXTENSIONS.map((ext) => `${basePath}${ext}`),
    ...LOCAL_IMPORT_EXTENSIONS.map((ext) => `${basePath}/index${ext}`),
  ]);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeFilePath(candidate);
    if (fileMap.has(normalizedCandidate)) return normalizedCandidate;
  }

  return null;
}
