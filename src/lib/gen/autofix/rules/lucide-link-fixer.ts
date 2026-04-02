const LUCIDE_LINK_IMPORT_RE =
  /import\s*\{([^}]*)\b(Link)\b([^}]*)\}\s*from\s*["']lucide-react["'];?/;

const NEXT_LINK_USAGE_RE = /<Link\b[^>]*\bhref\s*=/;

/**
 * When `Link` is imported from lucide-react but used as `<Link href="...">`,
 * the author almost certainly meant `next/link`. This fixer:
 *  1. Renames the lucide import to `LinkIcon` (or removes it if it's the only import).
 *  2. Adds `import Link from "next/link"` if missing.
 *  3. Replaces icon-only usages (`<Link />` / `<Link className=.../>` without href)
 *     with `<LinkIcon .../>` so they keep pointing at the lucide icon.
 */
export function fixLucideLinkMisuse(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean } {
  const importMatch = code.match(LUCIDE_LINK_IMPORT_RE);
  if (!importMatch) return { code, fixed: false };

  if (!NEXT_LINK_USAGE_RE.test(code)) return { code, fixed: false };

  const before = importMatch[1] ?? "";
  const after = importMatch[3] ?? "";
  const otherImports = [before, after]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let result = code;

  const alreadyHasLinkIcon = otherImports.some((n) => n === "LinkIcon" || n.startsWith("Link as"));
  const lucideAlias = alreadyHasLinkIcon ? "LucideLink" : "LinkIcon";

  const iconOnlyUsage = /<Link\b(?![^>]*\bhref\b)[^>]*\/>/g;
  const hasIconOnlyUsage = iconOnlyUsage.test(code);

  if (hasIconOnlyUsage) {
    const newImports = [...otherImports, `Link as ${lucideAlias}`];
    result = result.replace(
      importMatch[0],
      `import { ${newImports.join(", ")} } from "lucide-react"`,
    );
    result = result.replace(/<Link\b(?![^>]*\bhref\b)([^>]*)\/?>/g, `<${lucideAlias}$1/>`);
  } else if (otherImports.length > 0) {
    result = result.replace(
      importMatch[0],
      `import { ${otherImports.join(", ")} } from "lucide-react"`,
    );
  } else {
    result = result.replace(importMatch[0], "");
  }

  if (!/import\s+Link\s+from\s+["']next\/link["']/.test(result)) {
    const insertPoint = result.indexOf("\n") + 1;
    result =
      result.slice(0, insertPoint) +
      'import Link from "next/link";\n' +
      result.slice(insertPoint);
  }

  return { code: result, fixed: result !== code };
}
