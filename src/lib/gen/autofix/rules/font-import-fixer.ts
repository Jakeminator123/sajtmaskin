import type { AutoFixEntry } from "../pipeline";
import { GOOGLE_FONT_IMPORT_NAMES } from "@/lib/gen/data/google-font-registry";

const FONT_USAGE_RE = /\bconst\s+\w+\s*=\s*(\w+)\s*\(\s*\{/g;
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

export function fixFontImport(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: AutoFixEntry[] } {
  if (!filePath.includes("layout")) {
    return { code, fixed: false, fixes: [] };
  }

  const replaced = applyPreviewFontReplacements(code, filePath);
  let workingCode = replaced.code;
  const aggregatedFixes: AutoFixEntry[] = [...replaced.fixes];

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
  code = workingCode;

  if (FONT_IMPORT_RE.test(code)) {
    const importMatch = code.match(/import\s+\{([^}]*)\}\s+from\s+["']next\/font\/google["']/);
    if (importMatch) {
      const imported = new Set(
        importMatch[1].split(",").map((s) => s.trim()).filter(Boolean),
      );
      const missing = [...usedFonts].filter((f) => !imported.has(f));
      if (missing.length === 0) {
        return { code, fixed: false, fixes: [] };
      }
      const allImports = [...imported, ...missing].join(", ");
      const newImport = `import { ${allImports} } from "next/font/google"`;
      const fixedCode = code.replace(
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

  if (aggregatedFixes.length > 0 && FONT_IMPORT_RE.test(code)) {
    return { code, fixed: true, fixes: aggregatedFixes };
  }

  const fontList = [...usedFonts].join(", ");
  const importLine = `import { ${fontList} } from "next/font/google";\n`;
  const fixedCode = importLine + code;

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
