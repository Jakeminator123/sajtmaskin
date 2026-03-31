const METADATA_USAGE_RE = /\bMetadata\b/;
const METADATA_ROUTE_USAGE_RE = /\bMetadataRoute\b/;
const METADATA_IMPORT_RE = /import\s+(?:type\s+)?\{[^}]*\bMetadata\b[^}]*\}\s+from\s+["']next["']/;
const METADATA_ROUTE_IMPORT_RE = /import\s+(?:type\s+)?\{[^}]*\bMetadataRoute\b[^}]*\}\s+from\s+["']next["']/;
const ANY_NEXT_TYPE_IMPORT_RE = /import\s+type\s+\{([^}]*)\}\s+from\s+["']next["']/;
const ANY_NEXT_IMPORT_RE = /import\s+\{([^}]*)\}\s+from\s+["']next["']/;
const CN_USAGE_RE = /\bcn\s*\(/;
const CN_IMPORT_RE = /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*["']@\/lib\/utils["']/;
const CN_UTILS_IMPORT_LINE_RE = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/utils["'];?\s*\n?/g;
const CN_LOCAL_DECL_RE =
  /\b(?:export\s+)?(?:async\s+)?function\s+cn\b|\b(?:export\s+)?(?:const|let|var)\s+cn\b|\b(?:export\s+)?class\s+cn\b/;

function isLibUtilsFile(filePath?: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized === "lib/utils.ts" || normalized === "lib/utils.tsx";
}

function hasLocalCnDeclaration(code: string): boolean {
  return CN_LOCAL_DECL_RE.test(code);
}

function isPageOrLayoutFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /(?:^|\/)(?:page|layout|robots|sitemap)\.(tsx|ts|jsx|js)$/.test(normalized);
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

export function fixMissingMetadataRouteImport(
  code: string,
  filePath: string,
): { code: string; fixed: boolean } {
  if (!METADATA_ROUTE_USAGE_RE.test(code)) return { code, fixed: false };
  if (METADATA_ROUTE_IMPORT_RE.test(code)) return { code, fixed: false };

  let result = code;
  const existingTypeImport = result.match(ANY_NEXT_TYPE_IMPORT_RE);
  if (existingTypeImport) {
    const current = existingTypeImport[1];
    if (!current.includes("MetadataRoute")) {
      result = result.replace(
        existingTypeImport[0],
        `import type { ${current.trim()}, MetadataRoute } from "next"`,
      );
      return { code: result, fixed: true };
    }
  }

  const insertPoint = result.indexOf("\n") + 1;
  result =
    result.slice(0, insertPoint) +
    'import type { MetadataRoute } from "next";\n' +
    result.slice(insertPoint);

  return { code: result, fixed: true };
}

export function fixMissingCnImport(
  code: string,
  filePath?: string,
): { code: string; fixed: boolean } {
  if (!CN_USAGE_RE.test(code)) return { code, fixed: false };
  if (CN_IMPORT_RE.test(code)) return { code, fixed: false };
  if (isLibUtilsFile(filePath) || hasLocalCnDeclaration(code)) {
    return { code, fixed: false };
  }

  const insertPoint = code.indexOf("\n") + 1;
  const result =
    code.slice(0, insertPoint) +
    'import { cn } from "@/lib/utils";\n' +
    code.slice(insertPoint);

  return { code: result, fixed: true };
}

export function fixCnImportConflict(
  code: string,
  filePath?: string,
): { code: string; fixed: boolean } {
  if (!CN_IMPORT_RE.test(code)) return { code, fixed: false };
  if (!isLibUtilsFile(filePath) && !hasLocalCnDeclaration(code)) {
    return { code, fixed: false };
  }

  const result = code
    .replace(CN_UTILS_IMPORT_LINE_RE, (_full, specifiers: string) => {
      const remaining = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => {
          const aliasParts = part.replace(/^type\s+/, "").split(/\s+as\s+/i);
          const localName = aliasParts[aliasParts.length - 1]?.trim();
          return localName !== "cn";
        });

      if (remaining.length === 0) {
        return "";
      }

      return `import { ${remaining.join(", ")} } from "@/lib/utils";\n`;
    })
    .replace(/\n{3,}/g, "\n\n");

  return { code: result, fixed: result !== code };
}
