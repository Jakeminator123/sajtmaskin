/**
 * Lucide-misuse fixer — single home for the two cases where the model
 * imports a lucide-react identifier but uses it as the next/* component
 * with the same name.
 *
 *   • `Link`  from `lucide-react` used as `<Link href="...">` → next/link
 *   • `Image` from `lucide-react` used as `<Image src="..."/>` → next/image
 *
 * Previously these lived in two near-identical files
 * (`lucide-link-fixer.ts` + `lucide-image-fixer.ts`) which kept drifting
 * apart in subtle ways — same regex shape, different rename behaviour.
 * Consolidating them removes ~60 lines of duplicated logic and makes
 * future "lucide-X also clashes with next/X" additions trivial (`Form`,
 * `Script`, `Head`, …).
 *
 * Both exported function names (`fixLucideLinkMisuse`,
 * `fixLucideImageMisuse`) are preserved so `pipeline.ts` and existing
 * call sites do not need to change beyond the import path.
 */

type LucideMisuseConfig = {
  /** lucide identifier that collides with a next/* component. */
  symbol: "Link" | "Image";
  /** Regex that detects "this is being used as the next/* component, not as an icon". */
  nextUsageRe: RegExp;
  /** Module to add the next/* default import from. */
  nextModule: string;
  /**
   * If true, the fixer also rewrites icon-only usages (`<X />` / `<X className=.../>`)
   * to a renamed alias (`XIcon`) so the lucide icon keeps working. Only used for
   * `Link` — `Image` icon-only usages are vanishingly rare and the safer
   * default is to just drop the lucide import.
   */
  keepIconAlias: boolean;
};

const LUCIDE_LINK_CONFIG: LucideMisuseConfig = {
  symbol: "Link",
  nextUsageRe: /<Link\b[^>]*\bhref\s*=/,
  nextModule: "next/link",
  keepIconAlias: true,
};

const LUCIDE_IMAGE_CONFIG: LucideMisuseConfig = {
  symbol: "Image",
  nextUsageRe: /<Image\b[^>]*\b(?:src|fill)\b/,
  nextModule: "next/image",
  keepIconAlias: false,
};

function lucideImportRe(symbol: string): RegExp {
  return new RegExp(
    `import\\s*\\{([^}]*)\\b(${symbol})\\b([^}]*)\\}\\s*from\\s*["']lucide-react["'];?`,
  );
}

function nextDefaultImportRe(symbol: string, modulePath: string): RegExp {
  const escapedModule = modulePath.replace(/\//g, "\\/");
  return new RegExp(`import\\s+${symbol}\\s+from\\s+["']${escapedModule}["']`);
}

function applyLucideMisuseFix(code: string, config: LucideMisuseConfig): {
  code: string;
  fixed: boolean;
} {
  const importMatch = code.match(lucideImportRe(config.symbol));
  if (!importMatch) return { code, fixed: false };
  if (!config.nextUsageRe.test(code)) return { code, fixed: false };

  const before = importMatch[1] ?? "";
  const after = importMatch[3] ?? "";
  const otherImports = [before, after]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let result = code;

  if (config.keepIconAlias) {
    const aliasName = `${config.symbol}Icon`;
    const alreadyHasAlias = otherImports.some(
      (n) => n === aliasName || n.startsWith(`${config.symbol} as`),
    );
    const lucideAlias = alreadyHasAlias ? `Lucide${config.symbol}` : aliasName;
    const iconOnlyPattern = new RegExp(
      `<${config.symbol}\\b(?![^>]*\\bhref\\b)[^>]*\\/>`,
    );
    const hasIconOnlyUsage = iconOnlyPattern.test(code);

    if (hasIconOnlyUsage) {
      const newImports = [...otherImports, `${config.symbol} as ${lucideAlias}`];
      result = result.replace(
        importMatch[0],
        `import { ${newImports.join(", ")} } from "lucide-react"`,
      );
      result = result.replace(
        new RegExp(
          `<${config.symbol}\\b(?![^>]*\\bhref\\b)([^>]*?)\\/>`,
          "g",
        ),
        `<${lucideAlias}$1/>`,
      );
      result = result.replace(
        new RegExp(
          `<${config.symbol}\\b(?![^>]*\\bhref\\b)([^>]*?)>([^]*?)<\\/${config.symbol}>`,
          "g",
        ),
        `<${lucideAlias}$1>$2</${lucideAlias}>`,
      );
    } else {
      result = rewriteWithoutSymbol(result, importMatch[0], otherImports);
    }
  } else {
    result = rewriteWithoutSymbol(result, importMatch[0], otherImports);
  }

  if (!nextDefaultImportRe(config.symbol, config.nextModule).test(result)) {
    const insertPoint = result.indexOf("\n") + 1;
    result =
      result.slice(0, insertPoint) +
      `import ${config.symbol} from "${config.nextModule}";\n` +
      result.slice(insertPoint);
  }

  return { code: result, fixed: result !== code };
}

function rewriteWithoutSymbol(
  code: string,
  fullImport: string,
  otherImports: string[],
): string {
  if (otherImports.length > 0) {
    return code.replace(
      fullImport,
      `import { ${otherImports.join(", ")} } from "lucide-react"`,
    );
  }
  return code.replace(fullImport, "");
}

/**
 * When `Link` is imported from lucide-react but used as `<Link href="...">`,
 * the author almost certainly meant `next/link`. Renames icon-only usages
 * to `<LinkIcon />` so the lucide icon keeps working, and adds
 * `import Link from "next/link"` if missing.
 */
export function fixLucideLinkMisuse(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean } {
  return applyLucideMisuseFix(code, LUCIDE_LINK_CONFIG);
}

/**
 * When `Image` is imported from lucide-react but used as `<Image src=…/>`
 * or `<Image fill … />`, the author meant `next/image`. Strips the
 * lucide import and adds the next/image default import. Icon-only
 * `<Image />` usages are rare enough that we don't bother renaming
 * them — if you actually wanted the lucide icon, name it differently.
 */
export function fixLucideImageMisuse(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean } {
  return applyLucideMisuseFix(code, LUCIDE_IMAGE_CONFIG);
}
