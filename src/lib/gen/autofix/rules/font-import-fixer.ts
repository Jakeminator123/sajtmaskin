import type { AutoFixEntry } from "../pipeline";

const GOOGLE_FONTS = new Set([
  "Inter", "Roboto", "Open_Sans", "Lato", "Montserrat",
  "Poppins", "Raleway", "Nunito", "Playfair_Display", "Merriweather",
  "Source_Sans_3", "Oswald", "Quicksand", "Ubuntu", "Rubik", "Work_Sans",
  "Noto_Sans", "DM_Sans", "Outfit", "Space_Grotesk", "Sora", "Manrope",
  "Plus_Jakarta_Sans", "Figtree", "Bricolage_Grotesque", "Instrument_Sans",
]);

const UNAVAILABLE_FONT_REPLACEMENTS: Record<string, string> = {
  Geist: "Inter",
  Geist_Mono: "Source_Code_Pro",
};

const FONT_USAGE_RE = /\bconst\s+\w+\s*=\s*(\w+)\s*\(\s*\{/g;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;
const LOCAL_FONT_GEIST_RE = /import\s+\w+\s+from\s+["']next\/font\/local["'];?\n?/g;
const GEIST_LOCAL_FONT_BLOCK_RE = /const\s+(?:geist\w*|fontSans|fontMono)\s*=\s*\w+\(\{\s*src:\s*["'][^"']*geist[^"']*["'][^}]*\}\);?\n?/gi;

function replaceUnavailableFonts(
  code: string,
): { code: string; replaced: [string, string][]; } {
  let result = code;
  const replaced: [string, string][] = [];
  for (const [bad, good] of Object.entries(UNAVAILABLE_FONT_REPLACEMENTS)) {
    const importRe = new RegExp(`\\b${bad}\\b`, "g");
    if (importRe.test(result)) {
      result = result.replace(importRe, good);
      replaced.push([bad, good]);
    }
  }
  return { code: result, replaced };
}

export function fixFontImport(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: AutoFixEntry[] } {
  if (!filePath.includes("layout")) {
    return { code, fixed: false, fixes: [] };
  }

  const fixes: AutoFixEntry[] = [];
  let workingCode = code;

  if (/next\/font\/local/.test(workingCode) && /geist/i.test(workingCode)) {
    const before = workingCode;
    workingCode = workingCode.replace(GEIST_LOCAL_FONT_BLOCK_RE, "");
    if (workingCode === before) {
      workingCode = workingCode.replace(LOCAL_FONT_GEIST_RE, "");
    } else {
      workingCode = workingCode.replace(LOCAL_FONT_GEIST_RE, "");
    }
    if (workingCode !== before) {
      if (!workingCode.includes("next/font/google")) {
        workingCode = `import { Inter } from "next/font/google";\n` + workingCode;
      }
      if (!/\bconst\s+\w+\s*=\s*Inter\b/.test(workingCode)) {
        const insertAfter = workingCode.indexOf("next/font/google");
        const lineEnd = workingCode.indexOf("\n", insertAfter);
        if (lineEnd !== -1) {
          workingCode = workingCode.slice(0, lineEnd + 1) +
            `const inter = Inter({ subsets: ["latin"] });\n` +
            workingCode.slice(lineEnd + 1);
        }
      }
      fixes.push({
        fixer: "font-import-fixer",
        description: "Replaced next/font/local Geist with next/font/google Inter (Geist .woff2 files not available on preview host)",
        file: filePath,
      });
    }
  }

  const fontReplacement = replaceUnavailableFonts(workingCode);
  if (fontReplacement.replaced.length > 0) {
    workingCode = fontReplacement.code;
    for (const [bad, good] of fontReplacement.replaced) {
      fixes.push({
        fixer: "font-import-fixer",
        description: `Replaced unavailable font ${bad} with ${good}`,
        file: filePath,
      });
    }
  }

  const usedFonts = new Set<string>();
  for (const match of workingCode.matchAll(FONT_USAGE_RE)) {
    const fontName = match[1];
    if (GOOGLE_FONTS.has(fontName)) {
      usedFonts.add(fontName);
    }
  }

  if (usedFonts.size === 0) {
    return { code: workingCode, fixed: fixes.length > 0, fixes };
  }

  if (FONT_IMPORT_RE.test(workingCode)) {
    const importMatch = workingCode.match(/import\s+\{([^}]*)\}\s+from\s+["']next\/font\/google["']/);
    if (importMatch) {
      const imported = new Set(
        importMatch[1].split(",").map((s) => s.trim()).filter(Boolean),
      );
      const missing = [...usedFonts].filter((f) => !imported.has(f));
      if (missing.length === 0) {
        return { code: workingCode, fixed: fixes.length > 0, fixes };
      }
      const allImports = [...imported, ...missing].join(", ");
      const newImport = `import { ${allImports} } from "next/font/google"`;
      workingCode = workingCode.replace(
        /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/,
        newImport,
      );
      for (const f of missing) {
        fixes.push({
          fixer: "font-import-fixer",
          description: `Added ${f} to next/font/google import`,
          file: filePath,
        });
      }
      return { code: workingCode, fixed: true, fixes };
    }
  }

  const fontList = [...usedFonts].join(", ");
  const importLine = `import { ${fontList} } from "next/font/google";\n`;
  workingCode = importLine + workingCode;
  fixes.push({
    fixer: "font-import-fixer",
    description: `Added missing next/font/google import for: ${fontList}`,
    file: filePath,
  });

  return { code: workingCode, fixed: true, fixes };
}
