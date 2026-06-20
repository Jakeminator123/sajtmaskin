import type { AutoFixEntry } from "../pipeline";
import {
  GOOGLE_FONT_IMPORT_NAMES,
  getGoogleFontSupportedWeights,
  isVariableGoogleFont,
  resolveGoogleFontImportName,
} from "@/lib/gen/data/google-font-registry";
import { getVariantById } from "@/lib/gen/scaffold-variants/registry";
import type { ScaffoldId } from "@/lib/gen/scaffolds/types";

const FONT_USAGE_RE = /\bconst\s+\w+\s*=\s*(\w+)\s*\(\s*\{/g;
const FONT_CONST_CALL_RE =
  /\bconst\s+\w+\s*=\s*(\w+)\s*\(\s*\{[\s\S]*?\}\s*\)/g;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;

// TODO(#4): bandage — preview-host serves `_next/static/media/*` woff2 files
// for Geist/Geist_Mono with a 404 when basePath is set. Until that pipeline
// bug is fixed in `preview-host/src/runtime.js`, force-rewrite Geist usages
// to Inter/JetBrains_Mono so generated layouts render without missing
// glyphs. Drop this map once preview-host serves the assets correctly.
const PREVIEW_FONT_REPLACEMENTS: Record<string, string> = {
  Geist: "Inter",
  Geist_Mono: "JetBrains_Mono",
};

export interface VariantFontContext {
  scaffoldId?: string | null;
  variantId?: string | null;
}

interface ResolvedVariantFontPair {
  heading: string;
  body: string;
}

function applyPreviewFontReplacement(name: string): string {
  return PREVIEW_FONT_REPLACEMENTS[name] ?? name;
}

/**
 * Resolve the first `fontPairings` entry of the locked variant into
 * concrete `next/font/google` import names. Returns `null` when the
 * variant is unknown, has no font pairings, or maps to a font we cannot
 * materialize (display name not in the registry).
 *
 * Geist/Geist_Mono are remapped to the preview-host workaround pair so
 * the generated layout renders without missing-glyph 404s. Drop this
 * remap once `preview-host/src/runtime.js` serves the woff2 assets
 * correctly under basePath (TODO #4).
 */
function resolveVariantFontPair(
  context: VariantFontContext | undefined,
): ResolvedVariantFontPair | null {
  if (!context?.scaffoldId || !context?.variantId) return null;
  const variant = getVariantById(
    context.scaffoldId as ScaffoldId,
    context.variantId,
  );
  if (!variant) return null;
  const first = variant.fontPairings?.[0];
  if (!first) return null;
  const heading = resolveGoogleFontImportName(first.heading);
  const body = resolveGoogleFontImportName(first.body);
  if (!heading || !body) return null;
  return {
    heading: applyPreviewFontReplacement(heading),
    body: applyPreviewFontReplacement(body),
  };
}

function applyPreviewFontReplacements(
  code: string,
  filePath: string,
): { code: string; fixes: AutoFixEntry[] } {
  let next = code;
  const fixes: AutoFixEntry[] = [];
  for (const [from, to] of Object.entries(PREVIEW_FONT_REPLACEMENTS)) {
    const wordRe = new RegExp(`\\b${from}\\b`, "g");
    if (!wordRe.test(next)) continue;
    next = next.replace(new RegExp(`\\b${from}\\b`, "g"), to);
    fixes.push({
      fixer: "font-import-fixer",
      description: `Replaced ${from} with ${to} (preview-host can't serve Geist woff2 — see TODO #4)`,
      file: filePath,
    });
  }
  return { code: next, fixes };
}

function pickDefaultWeight(weights: readonly string[]): string {
  if (weights.includes("400")) return "400";
  return weights[0] ?? "400";
}

function injectMissingNonVariableFontWeights(
  code: string,
  filePath: string,
): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];

  const next = code.replace(FONT_CONST_CALL_RE, (match, fontName: string) => {
    if (!GOOGLE_FONT_IMPORT_NAMES.has(fontName)) return match;
    if (isVariableGoogleFont(fontName)) return match;

    const supportedWeights = getGoogleFontSupportedWeights(fontName);
    if (!supportedWeights || supportedWeights.length === 0) return match;

    const openBrace = match.indexOf("{");
    const closeBrace = match.lastIndexOf("}");
    if (openBrace === -1 || closeBrace <= openBrace) return match;

    const objectBody = match.slice(openBrace + 1, closeBrace);
    if (/\bweight\s*:/.test(objectBody)) return match;

    const weight = pickDefaultWeight(supportedWeights);
    const insertion = objectBody.trim().length === 0
      ? ` weight: "${weight}"`
      : ` weight: "${weight}",`;

    fixes.push({
      fixer: "font-import-fixer",
      description: `Added missing weight \"${weight}\" for non-variable font ${fontName}`,
      file: filePath,
    });

    return `${match.slice(0, openBrace + 1)}${insertion}${match.slice(openBrace + 1)}`;
  });

  return { code: next, fixes };
}

const BASELINE_INTER_IMPORT_RE = /import\s+\{\s*Inter\s*\}\s+from\s+["']next\/font\/google["'];?/;
const BASELINE_INTER_CONST_RE =
  /const\s+inter\s*=\s*Inter\s*\(\s*\{[^}]*\}\s*\)\s*;?/;
const BODY_INTER_VARIABLE_BARE_RE = /className=\{inter\.variable\}/g;
const BODY_INTER_VARIABLE_TEMPLATE_RE = /\$\{inter\.variable\}/g;

/**
 * One-shot materialization of the variant's first `fontPairings` into a
 * baseline scaffold layout that ships a single `Inter` font (the
 * convention used by every scaffold under `src/lib/gen/scaffolds/`).
 *
 * Conservative by design — only triggers on the recognised baseline
 * pattern. If the LLM (or a previous pass) already swapped the imports
 * the function is a no-op so we never clobber user-shaped layouts.
 *
 * Heading variable is `--font-display` and body variable is `--font-sans`
 * regardless of the font category. Two same-category fonts (e.g.
 * `Manrope` + `Inter` for `corporate-grid`) therefore live on distinct
 * CSS variables and can be referenced separately in scaffold CSS.
 */
function materializeVariantFontPair(
  code: string,
  filePath: string,
  pair: ResolvedVariantFontPair,
): { code: string; fixed: boolean; fixes: AutoFixEntry[] } {
  if (pair.heading === "Inter" && pair.body === "Inter") {
    return { code, fixed: false, fixes: [] };
  }
  if (
    !BASELINE_INTER_IMPORT_RE.test(code) ||
    !BASELINE_INTER_CONST_RE.test(code)
  ) {
    return { code, fixed: false, fixes: [] };
  }

  const samePair = pair.heading === pair.body;
  const importNames = samePair ? [pair.body] : [pair.heading, pair.body];
  const importLine = `import { ${importNames.join(", ")} } from "next/font/google";`;

  const constBlock = samePair
    ? `const fontSans = ${pair.body}({ subsets: ["latin"], variable: "--font-sans", display: "swap" });`
    : [
        `const fontDisplay = ${pair.heading}({ subsets: ["latin"], variable: "--font-display", display: "swap" });`,
        `const fontSans = ${pair.body}({ subsets: ["latin"], variable: "--font-sans", display: "swap" });`,
      ].join("\n");

  const bareBodyReplacement = samePair
    ? "className={fontSans.variable}"
    : "className={`${fontDisplay.variable} ${fontSans.variable}`}";
  const templateBodyReplacement = samePair
    ? "${fontSans.variable}"
    : "${fontDisplay.variable} ${fontSans.variable}";

  let next = code;
  next = next.replace(BASELINE_INTER_IMPORT_RE, importLine);
  next = next.replace(BASELINE_INTER_CONST_RE, constBlock);
  next = next.replace(BODY_INTER_VARIABLE_BARE_RE, bareBodyReplacement);
  next = next.replace(BODY_INTER_VARIABLE_TEMPLATE_RE, templateBodyReplacement);

  if (next === code) {
    return { code, fixed: false, fixes: [] };
  }

  const description = samePair
    ? `Materialized variant font (${pair.body}) into ${filePath}`
    : `Materialized variant font pair (heading=${pair.heading}, body=${pair.body}) into ${filePath}`;

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "variant-font-materializer",
        description,
        file: filePath,
      },
    ],
  };
}

export function fixFontImport(
  code: string,
  filePath: string,
  variantContext?: VariantFontContext,
): { code: string; fixed: boolean; fixes: AutoFixEntry[] } {
  if (!filePath.includes("layout")) {
    return { code, fixed: false, fixes: [] };
  }

  let workingCode = code;
  const aggregatedFixes: AutoFixEntry[] = [];

  // 1. Variant font materialization (one-shot on the baseline `Inter`
  // scaffold layouts). Runs BEFORE preview-host Geist replacement so we
  // never accidentally overwrite an LLM-shaped pair we just materialized.
  const variantPair = resolveVariantFontPair(variantContext);
  if (variantPair) {
    const materialized = materializeVariantFontPair(
      workingCode,
      filePath,
      variantPair,
    );
    if (materialized.fixed) {
      workingCode = materialized.code;
      aggregatedFixes.push(...materialized.fixes);
    }
  }

  // 2. Preview-host Geist workaround: rewrite remaining Geist/Geist_Mono
  // references the LLM might emit even after variant materialization.
  const replaced = applyPreviewFontReplacements(workingCode, filePath);
  workingCode = replaced.code;
  aggregatedFixes.push(...replaced.fixes);

  const withWeights = injectMissingNonVariableFontWeights(workingCode, filePath);
  workingCode = withWeights.code;
  aggregatedFixes.push(...withWeights.fixes);

  const usedFonts = new Set<string>();
  for (const match of workingCode.matchAll(FONT_USAGE_RE)) {
    const fontName = match[1];
    if (GOOGLE_FONT_IMPORT_NAMES.has(fontName)) {
      usedFonts.add(fontName);
    }
  }

  if (usedFonts.size === 0) {
    if (aggregatedFixes.length > 0) {
      return { code: workingCode, fixed: true, fixes: aggregatedFixes };
    }
    return { code, fixed: false, fixes: [] };
  }

  if (FONT_IMPORT_RE.test(workingCode)) {
    const importMatch = workingCode.match(
      /import\s+\{([^}]*)\}\s+from\s+["']next\/font\/google["']/,
    );
    if (importMatch) {
      const imported = new Set(
        importMatch[1].split(",").map((s) => s.trim()).filter(Boolean),
      );
      const missing = [...usedFonts].filter((f) => !imported.has(f));
      if (missing.length === 0) {
        if (aggregatedFixes.length > 0) {
          return { code: workingCode, fixed: true, fixes: aggregatedFixes };
        }
        return { code, fixed: false, fixes: [] };
      }
      const allImports = [...imported, ...missing].join(", ");
      const newImport = `import { ${allImports} } from "next/font/google"`;
      const fixedCode = workingCode.replace(
        /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/,
        newImport,
      );
      return {
        code: fixedCode,
        fixed: true,
        fixes: [
          ...aggregatedFixes,
          ...missing.map((f) => ({
            fixer: "font-import-fixer",
            description: `Added ${f} to next/font/google import`,
            file: filePath,
          })),
        ],
      };
    }
  }

  if (aggregatedFixes.length > 0 && FONT_IMPORT_RE.test(workingCode)) {
    return { code: workingCode, fixed: true, fixes: aggregatedFixes };
  }

  const fontList = [...usedFonts].join(", ");
  const importLine = `import { ${fontList} } from "next/font/google";\n`;
  const fixedCode = importLine + workingCode;

  return {
    code: fixedCode,
    fixed: true,
    fixes: [
      ...aggregatedFixes,
      {
        fixer: "font-import-fixer",
        description: `Added missing next/font/google import for: ${fontList}`,
        file: filePath,
      },
    ],
  };
}
