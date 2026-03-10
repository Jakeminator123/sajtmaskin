export interface CodeFile {
  path: string;
  content: string;
  language: string;
}

export interface CodeProject {
  files: CodeFile[];
}

/**
 * Matches fenced code blocks in CodeProject format:
 *
 *   ```tsx file="app/page.tsx"
 *   ... content ...
 *   ```
 *
 * Group 1: language (tsx, ts, css, json, …)
 * Group 2: file path
 * Group 3: file content (everything between opening fence and closing ```)
 *
 * `[^\n]*` after the file attribute tolerates extra attributes on the fence line.
 */
const CODE_BLOCK_RE = /```(\w+)\s+file="([^"]+)"[^\n]*\n([\s\S]*?)\n```/g;

/**
 * Parses generated content in CodeProject format into individual files.
 *
 * Extracts all ````lang file="path"``` blocks.
 * Skips blocks with empty content and deduplicates by path (first occurrence wins).
 */
export function parseCodeProject(content: string): CodeProject {
  const files: CodeFile[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(CODE_BLOCK_RE)) {
    const language = match[1];
    const path = match[2].trim();
    const fileContent = match[3];

    if (!path || !fileContent.trim()) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    files.push({ path, content: fileContent, language });
  }

  return { files };
}
