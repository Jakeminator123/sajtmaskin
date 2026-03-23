import type { CodeFile } from "@/lib/gen/parser";

const LAYOUT_SUFFIXES = ["app/layout.tsx", "src/app/layout.tsx"] as const;

const METADATA_BLOCK_RE =
  /\bexport\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/;
const METADATA_CONST_RE = /\bexport\s+const\s+metadata\b/;
const TITLE_FIELD_RE = /\btitle\s*:/;

const DEFAULT_TITLE = "Webbplats";
const DEFAULT_DESCRIPTION = "Skapad med Sajtmaskin.";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function findLayoutIndex(files: CodeFile[]): number {
  for (let i = 0; i < files.length; i++) {
    const p = normalizePath(files[i].path);
    if (LAYOUT_SUFFIXES.some((s) => p === s || p.endsWith(`/${s}`))) {
      return i;
    }
  }
  return -1;
}

function pickLayoutPath(files: CodeFile[]): string {
  const hasSrcApp = files.some((f) => normalizePath(f.path).includes("src/app/"));
  return hasSrcApp ? "src/app/layout.tsx" : "app/layout.tsx";
}

function hasGlobalsCss(files: CodeFile[], layoutPath: string): boolean {
  const dir = layoutPath.includes("src/app") ? "src/app/globals.css" : "app/globals.css";
  return files.some((f) => {
    const p = normalizePath(f.path);
    return p === dir || p.endsWith(`/${dir}`);
  });
}

/**
 * Ensures root layout has `export const metadata` with title + description so
 * SEO preflight and readiness do not block on missing-metadata / missing-title.
 * Skips when root layout is a client component or uses only generateMetadata (ambiguous).
 */
export function applyCriticalSeoBaseline(files: CodeFile[]): { files: CodeFile[]; fixes: string[] } {
  const fixes: string[] = [];
  const next = files.map((f) => ({ ...f }));

  const layoutIndex = findLayoutIndex(next);
  if (layoutIndex >= 0) {
    const layoutPath = normalizePath(next[layoutIndex].path);
    let content = next[layoutIndex].content;
    const useClient = /^\s*["']use client["']/.test(content);

    const hasMetadataExport = METADATA_BLOCK_RE.test(content);
    const hasGenerateMetadata = /\bexport\s+async\s+function\s+generateMetadata\b/.test(content);
    const hasTitle = hasMetadataExport && TITLE_FIELD_RE.test(content);

    if (useClient) {
      return { files: next, fixes };
    }

    if (hasGenerateMetadata && !METADATA_CONST_RE.test(content)) {
      return { files: next, fixes };
    }

    if (METADATA_CONST_RE.test(content) && !hasTitle) {
      const updated = content.replace(
        /export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*\{/,
        (m) => `${m}\n  title: ${JSON.stringify(DEFAULT_TITLE)},`,
      );
      if (updated !== content) {
        fixes.push(`${layoutPath}: la till metadata.title (SEO-baseline)`);
        next[layoutIndex] = { ...next[layoutIndex], content: updated };
      }
      return { files: next, fixes };
    }

    if (!hasMetadataExport) {
      const block = `\nexport const metadata = {\n  title: ${JSON.stringify(DEFAULT_TITLE)},\n  description: ${JSON.stringify(DEFAULT_DESCRIPTION)},\n};\n`;
      const lines = content.split(/\r?\n/);
      let insertAt = 0;
      while (insertAt < lines.length && /^\s*import\b/.test(lines[insertAt])) {
        insertAt += 1;
      }
      const injected = [...lines.slice(0, insertAt), block.trimEnd(), ...lines.slice(insertAt)].join("\n");
      fixes.push(`${layoutPath}: lade till metadata-export (SEO-baseline)`);
      next[layoutIndex] = { ...next[layoutIndex], content: injected };
    }

    return { files: next, fixes };
  }

  const newPath = pickLayoutPath(next);
  const importGlobals = hasGlobalsCss(next, newPath);
  const parts = [
    `import type { Metadata } from "next";`,
    importGlobals ? `import "./globals.css";` : null,
    ``,
    `export const metadata: Metadata = {`,
    `  title: ${JSON.stringify(DEFAULT_TITLE)},`,
    `  description: ${JSON.stringify(DEFAULT_DESCRIPTION)},`,
    `};`,
    ``,
    `export default function RootLayout({ children }: { children: React.ReactNode }) {`,
    `  return (`,
    `    <html lang="sv">`,
    `      <body>{children}</body>`,
    `    </html>`,
    `  );`,
    `}`,
    ``,
  ].filter((line): line is string => line !== null);

  fixes.push(`${newPath}: skapade root layout med metadata (SEO-baseline)`);
  next.push({
    path: newPath,
    content: parts.join("\n"),
    language: "tsx",
  });

  return { files: next, fixes };
}
