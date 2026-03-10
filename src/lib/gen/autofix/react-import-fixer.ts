const REACT_DOT_RE = /\bReact\./;
const REACT_IMPORT_RE = /\bimport\s+(?:React|\*\s+as\s+React)\b/;
const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

export function fixReactImport(
  code: string,
): { code: string; fixed: boolean } {
  if (!REACT_DOT_RE.test(code)) {
    return { code, fixed: false };
  }

  if (REACT_IMPORT_RE.test(code)) {
    return { code, fixed: false };
  }

  const importLine = 'import React from "react";\n';

  const match = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (match) {
    const after = match[0].length;
    return {
      code: code.slice(0, after) + importLine + code.slice(after),
      fixed: true,
    };
  }

  return { code: importLine + code, fixed: true };
}
