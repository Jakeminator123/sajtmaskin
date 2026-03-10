import type { CodeFile } from "@/lib/gen/parser";
import { fixFontImport } from "@/lib/gen/autofix/rules/font-import-fixer";

type RepairEntry = {
  fixer: string;
  description: string;
  file: string;
};

const LUCIDE_IMPORT_RE =
  /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["'];?/m;
const NEXT_LINK_IMPORT_RE = /import\s+Link\s+from\s+["']next\/link["'];?/;
const HREF_LINK_USAGE_RE = /<Link\b[^>]*\bhref=/;

function insertImportAfterDirectives(code: string, importLine: string): string {
  const directiveRe = /^("use client"|'use client'|"use server"|'use server');?\s*$/gm;
  let lastDirectiveEnd = 0;

  for (const match of code.matchAll(directiveRe)) {
    lastDirectiveEnd = match.index! + match[0].length;
  }

  if (lastDirectiveEnd > 0) {
    const before = code.slice(0, lastDirectiveEnd).trimEnd();
    const after = code.slice(lastDirectiveEnd).replace(/^\s*/, "\n\n");
    return `${before}\n\n${importLine}${after}`;
  }

  return `${importLine}\n${code}`;
}

function fixLucideLinkImport(code: string, filePath: string): {
  code: string;
  fixed: boolean;
  fixes: RepairEntry[];
} {
  if (!HREF_LINK_USAGE_RE.test(code)) {
    return { code, fixed: false, fixes: [] };
  }

  const importMatch = code.match(LUCIDE_IMPORT_RE);
  if (!importMatch) {
    return { code, fixed: false, fixes: [] };
  }

  const names = importMatch[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.includes("Link")) {
    return { code, fixed: false, fixes: [] };
  }

  const remaining = names.filter((name) => name !== "Link");
  const nextLucideImport = remaining.length > 0
    ? `import { ${remaining.join(", ")} } from "lucide-react";`
    : "";

  let nextCode = code.replace(importMatch[0], nextLucideImport);
  if (!NEXT_LINK_IMPORT_RE.test(nextCode)) {
    nextCode = insertImportAfterDirectives(nextCode, 'import Link from "next/link";');
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    fixes: nextCode !== code
      ? [{
          fixer: "link-import-fixer",
          description: "Replaced lucide-react Link import with next/link",
          file: filePath,
        }]
      : [],
  };
}

export function repairGeneratedFiles(files: CodeFile[]): {
  files: CodeFile[];
  fixes: RepairEntry[];
} {
  const fixes: RepairEntry[] = [];

  const repairedFiles = files.map((file) => {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) {
      return file;
    }

    let content = file.content;

    const fontResult = fixFontImport(content, file.path);
    if (fontResult.fixed) {
      content = fontResult.code;
      fixes.push(
        ...fontResult.fixes.map((fix) => ({
          fixer: fix.fixer,
          description: fix.description,
          file: fix.file ?? file.path,
        })),
      );
    }

    const linkResult = fixLucideLinkImport(content, file.path);
    if (linkResult.fixed) {
      content = linkResult.code;
      fixes.push(...linkResult.fixes);
    }

    return content === file.content ? file : { ...file, content };
  });

  return { files: repairedFiles, fixes };
}
