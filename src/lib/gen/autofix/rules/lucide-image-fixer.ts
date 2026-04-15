const LUCIDE_IMAGE_IMPORT_RE =
  /import\s*\{([^}]*)\b(Image)\b([^}]*)\}\s*from\s*["']lucide-react["'];?/;

const NEXT_IMAGE_USAGE_RE = /<Image\b[^>]*\b(?:src|fill)\b/;

export function fixLucideImageMisuse(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean } {
  const importMatch = code.match(LUCIDE_IMAGE_IMPORT_RE);
  if (!importMatch) return { code, fixed: false };

  if (!NEXT_IMAGE_USAGE_RE.test(code)) return { code, fixed: false };

  const before = importMatch[1] ?? "";
  const after = importMatch[3] ?? "";
  const otherImports = [before, after]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let result = code;

  if (otherImports.length > 0) {
    result = result.replace(
      importMatch[0],
      `import { ${otherImports.join(", ")} } from "lucide-react"`,
    );
  } else {
    result = result.replace(importMatch[0], "");
  }

  if (!/import\s+Image\s+from\s+["']next\/image["']/.test(result)) {
    const insertPoint = result.indexOf("\n") + 1;
    result =
      result.slice(0, insertPoint) +
      'import Image from "next/image";\n' +
      result.slice(insertPoint);
  }

  return { code: result, fixed: result !== code };
}
