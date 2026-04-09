import { validateFilePath, sanitizeFilePath } from "./security/path-validator";

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
    const rawPath = match[2].trim();
    const fileContent = match[3];

    if (!rawPath || !fileContent.trim()) continue;

    const validation = validateFilePath(rawPath);
    let path: string | null = null;
    if (validation.valid) {
      path = rawPath;
    } else {
      const sanitized = sanitizeFilePath(rawPath);
      if (!sanitized || sanitized === "unnamed-file.txt") continue;
      const again = validateFilePath(sanitized);
      if (!again.valid) continue;
      path = sanitized;
    }
    if (!path) continue;

    if (seen.has(path)) continue;
    seen.add(path);

    files.push({ path, content: fileContent, language });
  }

  return { files };
}

function inferFenceLanguage(file: Pick<CodeFile, "path" | "language">): string {
  if (file.language?.trim()) return file.language.trim();
  if (file.path.endsWith(".tsx")) return "tsx";
  if (file.path.endsWith(".ts")) return "ts";
  if (file.path.endsWith(".jsx")) return "jsx";
  if (file.path.endsWith(".js")) return "js";
  if (file.path.endsWith(".css")) return "css";
  if (file.path.endsWith(".json")) return "json";
  return "txt";
}

export function serializeCodeProject(files: CodeFile[]): string {
  return files
    .map((file) => {
      const language = inferFenceLanguage(file);
      return `\`\`\`${language} file="${file.path}"\n${file.content}\n\`\`\``;
    })
    .join("\n\n");
}
