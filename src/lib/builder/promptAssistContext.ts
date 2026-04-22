/**
 * Prompt Assist Context — code-context summariser for follow-up chat turns.
 *
 * The spec-first chain (`WebsiteSpec` / `SajtmaskinSpec` / `processPromptWithSpec` /
 * `briefToSpec` / `promptToSpec`) lived in this file historically but is retired —
 * Deep Brief (`src/lib/builder/site-brief-generation.ts`) is the only pre-generation
 * expansion step today.
 */

export type ContextFile = { name: string; content?: string | null };

const CONTEXT_MAX_FILES = 60;
const CONTEXT_MAX_FILE_LINES = 120;
const CONTEXT_MAX_FILE_CHARS = 4_200;
const CONTEXT_MAX_TOTAL_CHARS = 22_000;

function scoreContextFile(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes("app/page")) return 0;
  if (lower.includes("app/layout")) return 1;
  if (lower.includes("app/")) return 2;
  if (lower.includes("components/")) return 3;
  if (lower.endsWith(".tsx") || lower.endsWith(".ts")) return 4;
  return 5;
}

function summarizeFileContent(content: string): string {
  const lines = content.split(/\r?\n/).slice(0, CONTEXT_MAX_FILE_LINES);
  let snippet = lines.join("\n").trim();
  if (snippet.length > CONTEXT_MAX_FILE_CHARS) {
    snippet = `${snippet.slice(0, CONTEXT_MAX_FILE_CHARS)}…`;
  }
  return snippet;
}

export function buildPromptAssistContext(files: ContextFile[]): string {
  if (!files?.length) return "";

  const fileNames = files.map((file) => file.name).filter(Boolean);
  const listLines = [
    "Files:",
    ...fileNames.slice(0, 20).map((name) => `- ${name}`),
  ];
  if (fileNames.length > 20) {
    listLines.push(`- ... (${fileNames.length - 20} more)`);
  }

  const withContent = files
    .filter((file) => typeof file.content === "string" && file.content?.trim())
    .sort((a, b) => scoreContextFile(a.name) - scoreContextFile(b.name))
    .slice(0, CONTEXT_MAX_FILES);

  let totalChars = 0;
  const snippetLines: string[] = [];
  for (const file of withContent) {
    const snippet = summarizeFileContent(file.content ?? "");
    if (!snippet) continue;
    totalChars += snippet.length;
    if (totalChars > CONTEXT_MAX_TOTAL_CHARS) break;
    snippetLines.push(`File: ${file.name}\n${snippet}`);
  }

  const sections = [listLines.join("\n")];
  if (snippetLines.length) {
    sections.push(`Snippets:\n${snippetLines.join("\n\n")}`);
  }

  return sections.join("\n\n");
}
