import type { AutoFixEntry } from "../pipeline";

const GOOGLE_FONTS = new Set([
  "Inter", "Geist", "Geist_Mono", "Roboto", "Open_Sans", "Lato", "Montserrat",
  "Poppins", "Raleway", "Nunito", "Playfair_Display", "Merriweather",
  "Source_Sans_3", "Oswald", "Quicksand", "Ubuntu", "Rubik", "Work_Sans",
  "Noto_Sans", "DM_Sans", "Outfit", "Space_Grotesk", "Sora", "Manrope",
  "Plus_Jakarta_Sans", "Figtree", "Bricolage_Grotesque", "Instrument_Sans",
]);

const FONT_USAGE_RE = /\bconst\s+\w+\s*=\s*(\w+)\s*\(\s*\{/g;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;

export function fixFontImport(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: AutoFixEntry[] } {
  if (!filePath.includes("layout")) {
    return { code, fixed: false, fixes: [] };
  }

  const usedFonts = new Set<string>();
  for (const match of code.matchAll(FONT_USAGE_RE)) {
    const fontName = match[1];
    if (GOOGLE_FONTS.has(fontName)) {
      usedFonts.add(fontName);
    }
  }

  if (usedFonts.size === 0) {
    return { code, fixed: false, fixes: [] };
  }

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
        fixes: missing.map((f) => ({
          fixer: "font-import-fixer",
          description: `Added ${f} to next/font/google import`,
          file: filePath,
        })),
      };
    }
  }

  const fontList = [...usedFonts].join(", ");
  const importLine = `import { ${fontList} } from "next/font/google";\n`;
  const fixedCode = importLine + code;

  return {
    code: fixedCode,
    fixed: true,
    fixes: [{
      fixer: "font-import-fixer",
      description: `Added missing next/font/google import for: ${fontList}`,
      file: filePath,
    }],
  };
}
