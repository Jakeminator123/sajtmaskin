const METADATA_USAGE_RE = /\bMetadata\b/;
const METADATA_IMPORT_RE = /import\s+(?:type\s+)?\{[^}]*\bMetadata\b[^}]*\}\s+from\s+["']next["']/;
const ANY_NEXT_TYPE_IMPORT_RE = /import\s+type\s+\{([^}]*)\}\s+from\s+["']next["']/;
const ANY_NEXT_IMPORT_RE = /import\s+\{([^}]*)\}\s+from\s+["']next["']/;

function isPageOrLayoutFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /(?:^|\/)(?:page|layout)\.(tsx|ts|jsx|js)$/.test(normalized);
}

export function fixMissingMetadataImport(
  code: string,
  filePath: string,
): { code: string; fixed: boolean } {
  if (!isPageOrLayoutFile(filePath)) return { code, fixed: false };
  if (!METADATA_USAGE_RE.test(code)) return { code, fixed: false };
  if (METADATA_IMPORT_RE.test(code)) return { code, fixed: false };

  let result = code;

  const existingTypeImport = result.match(ANY_NEXT_TYPE_IMPORT_RE);
  if (existingTypeImport) {
    const current = existingTypeImport[1];
    if (!current.includes("Metadata")) {
      result = result.replace(
        existingTypeImport[0],
        `import type { ${current.trim()}, Metadata } from "next"`,
      );
      return { code: result, fixed: true };
    }
  }

  const existingImport = result.match(ANY_NEXT_IMPORT_RE);
  if (existingImport) {
    const current = existingImport[1];
    if (!current.includes("Metadata")) {
      result = result.replace(
        existingImport[0],
        `import { ${current.trim()}, type Metadata } from "next"`,
      );
      return { code: result, fixed: true };
    }
  }

  const insertPoint = result.indexOf("\n") + 1;
  result =
    result.slice(0, insertPoint) +
    'import type { Metadata } from "next";\n' +
    result.slice(insertPoint);

  return { code: result, fixed: true };
}
