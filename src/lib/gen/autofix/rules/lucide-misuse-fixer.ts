/**
 * Lucide-misuse fixer — single home for the cases where the model imports a
 * lucide-react identifier but uses it as a same-named component from another
 * canonical module.
 *
 *   • `Link`  from `lucide-react` used as `<Link href="...">` → next/link
 *   • `Image` from `lucide-react` used as `<Image src="..."/>` → next/image
 *   • shadcn∩lucide collisions (`Badge`, `Calendar`, `Table`, …) imported
 *     from `lucide-react` but used as the shadcn/ui component (children or
 *     `variant=`/`asChild` props) → `@/components/ui/<subpath>`
 *
 * Previously the next/* cases lived in two near-identical files
 * (`lucide-link-fixer.ts` + `lucide-image-fixer.ts`) which kept drifting
 * apart in subtle ways — same regex shape, different rename behaviour.
 *
 * The shadcn-collision case was added after prod chat 1c34592c v3: a
 * follow-up rewrote `import { Badge } from "@/components/ui/badge"` to
 * `import { Badge } from "lucide-react"`. Every validator accepted it
 * (Badge IS a real lucide glyph), but at runtime `<Badge>` rendered as an
 * `<svg>` whose `<span>`/text children are invalid inside svg → hydration
 * mismatch that regenerated the whole tree on the client.
 *
 * The exported function names (`fixLucideLinkMisuse`, `fixLucideImageMisuse`)
 * are preserved so `pipeline.ts` and existing call sites do not change.
 */
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";

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

// ─────────────────────────────────────────────────────────────────────────────
// shadcn ∩ lucide collisions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names that are BOTH a lucide glyph and a shadcn/ui component (derived from
 * the two canonical data sets so it never drifts): currently Badge, Calendar,
 * Command, Form, Sheet, Sidebar, Table.
 */
export const SHADCN_LUCIDE_COLLISION_NAMES: readonly string[] = Object.keys(
  SHADCN_COMPONENTS,
).filter((name) => LUCIDE_ICONS.has(name));

/**
 * Props that only make sense on the shadcn component, never on an svg glyph.
 * `size` is deliberately NOT here — lucide icons take a numeric `size` prop.
 * `asChild` matches with or without `=` (boolean shorthand).
 */
const SHADCN_PROP_MARKER_SRC = String.raw`\b(?:variant\s*=|asChild\b)`;

/**
 * True when `symbol` is used as the shadcn component rather than as a lucide
 * icon: a paired tag with children (`<Badge>…</Badge>` — lucide glyphs never
 * take children) or a shadcn-only prop (`variant=`/`asChild`).
 */
export function hasShadcnComponentUsage(code: string, symbol: string): boolean {
  if (new RegExp(`</${symbol}\\s*>`).test(code)) return true;
  return new RegExp(`<${symbol}\\b[^>]*${SHADCN_PROP_MARKER_SRC}`).test(code);
}

/**
 * Props that are normal on a lucide glyph. A self-closing usage whose valued
 * props all live here (and that has at least one of them) is icon usage.
 */
const ICONISH_PROPS = new Set([
  "className",
  "size",
  "strokeWidth",
  "absoluteStrokeWidth",
  "color",
  "style",
  "key",
  "aria-hidden",
  "aria-label",
  "role",
  "focusable",
]);

/**
 * Usage-based disambiguation for a shadcn∩lucide collision name (M#badge1):
 *
 *   - "shadcn"    — children or `variant=`/`asChild` (glyphs take neither)
 *   - "lucide"    — every self-closing usage carries ONLY icon-ish props
 *                   (className/size/…), with at least one present. A bare
 *                   `<Calendar />` stays ambiguous: prop-less self-closing is
 *                   plausible for several shadcn components too.
 *   - "ambiguous" — anything else (incl. non-JSX value usage) → leave for
 *                   the LLM fixer.
 */
export function classifyShadcnLucideCollisionUsage(
  code: string,
  symbol: string,
): "shadcn" | "lucide" | "ambiguous" {
  if (hasShadcnComponentUsage(code, symbol)) return "shadcn";
  const selfClosingRe = new RegExp(`<${symbol}\\b([^>]*?)/>`, "g");
  let sawUsage = false;
  let sawIconishProp = false;
  for (const match of code.matchAll(selfClosingRe)) {
    sawUsage = true;
    const props = match[1] ?? "";
    for (const propMatch of props.matchAll(/([A-Za-z_][\w-]*)\s*=/g)) {
      if (!ICONISH_PROPS.has(propMatch[1])) return "ambiguous";
      sawIconishProp = true;
    }
  }
  return sawUsage && sawIconishProp ? "lucide" : "ambiguous";
}

function shadcnNamedImportRe(symbol: string, modulePath: string): RegExp {
  const escapedModule = modulePath.replace(/[/.]/g, "\\$&");
  return new RegExp(
    `^(\\s*import\\s*\\{)([^}]*)(\\}\\s*from\\s*["']${escapedModule}["'])`,
    "m",
  );
}

function applyShadcnCollisionFix(
  code: string,
  symbol: string,
): { code: string; fixed: boolean } {
  const importMatch = code.match(lucideImportRe(symbol));
  if (!importMatch) return { code, fixed: false };
  if (!hasShadcnComponentUsage(code, symbol)) return { code, fixed: false };

  const before = importMatch[1] ?? "";
  const after = importMatch[3] ?? "";
  const otherImports = [before, after]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let result = code;

  // Icon-only usages (self-closing WITHOUT a shadcn-only prop) keep the lucide
  // glyph under an alias, mirroring the Link handling above.
  const iconOnlyRe = new RegExp(
    `<${symbol}\\b(?![^>]*${SHADCN_PROP_MARKER_SRC})([^>]*?)\\/>`,
    "g",
  );
  const hasIconOnlyUsage = new RegExp(iconOnlyRe.source).test(code);
  if (hasIconOnlyUsage) {
    const aliasName = `${symbol}Icon`;
    const aliasTaken =
      otherImports.some((n) => n === aliasName || n.startsWith(`${symbol} as`)) ||
      new RegExp(`\\b${aliasName}\\b`).test(code);
    const lucideAlias = aliasTaken ? `Lucide${symbol}` : aliasName;
    const newImports = [...otherImports, `${symbol} as ${lucideAlias}`];
    result = result.replace(
      importMatch[0],
      `import { ${newImports.join(", ")} } from "lucide-react"`,
    );
    result = result.replace(iconOnlyRe, `<${lucideAlias}$1/>`);
  } else {
    result = rewriteWithoutSymbol(result, importMatch[0], otherImports);
  }

  const modulePath = `@/components/ui/${SHADCN_COMPONENTS[symbol]}`;
  const namedRe = shadcnNamedImportRe(symbol, modulePath);
  const existing = result.match(namedRe);
  if (existing) {
    const specs = (existing[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!specs.includes(symbol)) {
      result = result.replace(
        namedRe,
        `$1 ${[...specs, symbol].join(", ")} $3`,
      );
    }
  } else {
    const insertPoint = result.indexOf("\n") + 1;
    result =
      result.slice(0, insertPoint) +
      `import { ${symbol} } from "${modulePath}";\n` +
      result.slice(insertPoint);
  }

  return { code: result, fixed: result !== code };
}

/**
 * When a shadcn∩lucide collision name is imported from lucide-react but used
 * as the shadcn component (children or `variant=`/`asChild`), rewrite the
 * import to the shadcn path. Icon-only usages in the same file keep the glyph
 * as `<XIcon/>`. Icon-only files are left untouched.
 */
export function fixLucideShadcnCollisionMisuse(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean; fixedNames: string[] } {
  let current = code;
  const fixedNames: string[] = [];
  for (const symbol of SHADCN_LUCIDE_COLLISION_NAMES) {
    const result = applyShadcnCollisionFix(current, symbol);
    if (result.fixed) {
      current = result.code;
      fixedNames.push(symbol);
    }
  }
  return { code: current, fixed: fixedNames.length > 0, fixedNames };
}
