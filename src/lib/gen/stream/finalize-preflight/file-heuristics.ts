import type { CodeFile } from "@/lib/gen/parser";

/**
 * Remove literal route files when a dynamic-segment counterpart exists.
 * E.g. `app/product/id/page.tsx` is removed if `app/product/[id]/page.tsx` exists.
 */
export function removeLiteralRouteDuplicates(files: CodeFile[]): CodeFile[] {
  const appPaths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const toRemove = new Set<string>();

  for (const filePath of appPaths) {
    const match = filePath.match(/^((?:src\/)?app\/.+)\/(\w+)\/(page|layout)\.(tsx|jsx|ts|js)$/);
    if (!match) continue;
    const [, parentPath, segment, fileType, ext] = match;
    const dynamicPath = `${parentPath}/[${segment}]/${fileType}.${ext}`;
    if (appPaths.has(dynamicPath)) {
      toRemove.add(filePath);
    }
  }

  if (toRemove.size === 0) return files;
  return files.filter((f) => !toRemove.has(f.path.replace(/\\/g, "/")));
}

export function inferCodeFenceLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "txt";
}

/** Heuristic: main app page renders nothing meaningful (no AST — fast preflight). */
export function looksLikeEmptyPage(content: string): boolean {
  const body = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  if (/return\s+null\s*;/i.test(body)) return true;
  if (/return\s*\(\s*<>\s*<\/>\s*\)/i.test(body)) return true;
  if (/return\s*\(\s*<div\s*\/>\s*\)/i.test(body)) return true;
  const pascalJsx = body.match(/<[A-Z][A-Za-z0-9]*[\s>]/g);
  if (pascalJsx && pascalJsx.length > 0) return false;
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const textish = stripped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Intrinsic-only pages: need some visible copy, not just wrappers
  return textish.length < 3;
}

export function resolveAppPagePath(files: Array<{ path: string }>): string | null {
  const normalized = files.map((f) => f.path.replace(/\\/g, "/"));
  const exact = normalized.find((p) => p === "app/page.tsx" || p.endsWith("/app/page.tsx"));
  return exact ?? null;
}

export function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Paths whose content is byte-identical with the base version. Inherited
 * content is not this round's degenerate output, so the degeneracy cap must
 * never stub it (prod chat 4d6b5546).
 */
export function collectBaseIdenticalPaths(
  files: ReadonlyArray<{ path: string; content: string }>,
  previousContentByPath: ReadonlyMap<string, string>,
): Set<string> {
  const paths = new Set<string>();
  if (previousContentByPath.size === 0) return paths;
  for (const file of files) {
    if (previousContentByPath.get(file.path) === file.content) {
      paths.add(file.path);
    }
  }
  return paths;
}
