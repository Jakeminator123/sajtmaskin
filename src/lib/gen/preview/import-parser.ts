import type { ImportBinding, ParsedImport } from "./types";

export function stripNextImports(code: string): string {
  let result = code;

  result = result.replace(
    /import\s+[A-Za-z_$][\w$]*\s+from\s+['"]next\/image['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+[A-Za-z_$][\w$]*\s+from\s+['"]next\/link['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+\{[^}]*\}\s+from\s+['"]next\/navigation['"]\s*;?/g,
    "",
  );

  result = result.replace(
    /import\s+\{[^}]*\}\s+from\s+['"]next\/font[^'"]*['"]\s*;?/g,
    "",
  );

  result = result.replace(/^['"]use client['"]\s*;?\s*$/gm, "");
  result = result.replace(/^['"]use server['"]\s*;?\s*$/gm, "");

  result = result.replace(
    /import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?/g,
    "",
  );

  return result;
}

export function resolveDefaultExportName(code: string): string | null {
  const fnMatch = code.match(/export\s+default\s+(?:async\s+)?function\s+(\w+)/);
  if (fnMatch) return fnMatch[1];

  const classMatch = code.match(/export\s+default\s+class\s+(\w+)/);
  if (classMatch) return classMatch[1];

  const varMatch = code.match(/export\s+default\s+(\w+)\s*;?/);
  if (varMatch) return varMatch[1];

  if (code.includes("export default")) return null;
  return null;
}

export function parseNamedImports(input: string): ImportBinding[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const withoutType = part.replace(/^type\s+/, "").trim();
      if (!withoutType) return [];
      const aliasMatch = withoutType.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliasMatch) {
        return [{ imported: aliasMatch[1], local: aliasMatch[2] }];
      }
      return [{ imported: withoutType, local: withoutType }];
    });
}

export function parseImports(code: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const importRe = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
  for (const match of code.matchAll(importRe)) {
    const clause = match[1]?.trim() ?? "";
    const source = match[2]?.trim() ?? "";
    if (!clause || !source || clause.startsWith("type ")) continue;

    let defaultImport: string | null = null;
    let namespaceImport: string | null = null;
    let namedImports: ImportBinding[] = [];

    const normalizedClause = clause.replace(/\s+/g, " ").trim();
    const braceIndex = normalizedClause.indexOf("{");
    const namespaceIndex = normalizedClause.indexOf("* as ");

    if (braceIndex >= 0) {
      const before = normalizedClause.slice(0, braceIndex).replace(/,$/, "").trim();
      if (before) defaultImport = before;
      const namedPart = normalizedClause.slice(braceIndex + 1, normalizedClause.lastIndexOf("}"));
      namedImports = parseNamedImports(namedPart);
    } else if (namespaceIndex >= 0) {
      const before = normalizedClause.slice(0, namespaceIndex).replace(/,$/, "").trim();
      if (before) defaultImport = before;
      namespaceImport = normalizedClause.slice(namespaceIndex + 5).trim();
    } else {
      defaultImport = normalizedClause;
    }

    imports.push({
      source,
      defaultImport: defaultImport && !defaultImport.startsWith("type ") ? defaultImport : null,
      namespaceImport,
      namedImports,
    });
  }
  return imports;
}

export function stripImportStatements(code: string): string {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];
  let insideImport = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!insideImport && trimmed.startsWith("import ")) {
      insideImport = true;
      const completesOnSameLine =
        /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed) ||
        /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed);
      if (completesOnSameLine) {
        insideImport = false;
      }
      continue;
    }

    if (insideImport) {
      if (/from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
        insideImport = false;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

export function rewriteModuleExports(code: string, fallbackName: string): {
  code: string;
  defaultExportName: string | null;
} {
  let result = code;
  let defaultExportName = resolveDefaultExportName(result);

  if (!defaultExportName && /export\s+default\s+(?:async\s+)?function\s*\(/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(
      /export\s+default\s+(async\s+)?function\s*\(/,
      (_match, asyncKw: string | undefined) => `${asyncKw ?? ""}function ${fallbackName}(`,
    );
  }

  if (!defaultExportName && /export\s+default\s+class\s*\{/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(/export\s+default\s+class\s*\{/, `class ${fallbackName} {`);
  }

  if (defaultExportName) {
    result = result.replace(/export\s+default\s+async\s+function\s+([A-Za-z_$][\w$]*)/g, "async function $1");
    result = result.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, "function $1");
    result = result.replace(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/g, "class $1");
    result = result.replace(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g, "$1;");
  } else if (/export\s+default\s+/.test(result)) {
    defaultExportName = fallbackName;
    result = result.replace(/export\s+default\s+/, `const ${fallbackName} = `);
  }

  result = result.replace(/export\s+async\s+function\s+/g, "async function ");
  result = result.replace(/export\s+function\s+/g, "function ");
  result = result.replace(/export\s+(const|let|var|class)\s+/g, "$1 ");
  result = result.replace(/export\s+(type|interface|enum)\s+/g, "$1 ");
  result = result.replace(/export\s*\{[^}]+\}\s*;?/g, "");

  return { code: result, defaultExportName };
}
