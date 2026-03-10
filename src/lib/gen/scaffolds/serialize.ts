import type { ScaffoldManifest } from "./types";
import { buildFileContext } from "../context/file-context-builder";

export function serializeScaffoldForPrompt(scaffold: ScaffoldManifest): string {
  const ctx = buildFileContext({
    files: scaffold.files.map((f) => ({ path: f.path, content: f.content, language: inferLang(f.path) })),
    maxChars: 8000,
  });

  const hints = scaffold.promptHints.length > 0
    ? `\n\nScaffold hints:\n${scaffold.promptHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  return `## Scaffold: ${scaffold.label}\n\n${scaffold.description}\n\nModify this starter to match the user's request. Only return files you need to CREATE or MODIFY. Files you omit are kept as-is.\n\n${ctx.summary}${hints}`;
}

function inferLang(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "text";
}
