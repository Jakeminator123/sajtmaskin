import type { ScaffoldManifest } from "./types";
import { buildFileContext } from "../context/file-context-builder";

export function serializeScaffoldForPrompt(scaffold: ScaffoldManifest): string {
  const ctx = buildFileContext({
    files: scaffold.files.map((f) => ({ path: f.path, content: f.content, language: inferLang(f.path) })),
    maxChars: 2400,
  });

  const fileBlocks = renderScaffoldFiles(scaffold);
  const hints = scaffold.promptHints.length > 0
    ? `\n\nScaffold hints:\n${scaffold.promptHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  return `## Scaffold: ${scaffold.label}\n\n${scaffold.description}\n\nTreat these scaffold files as the current starter project. Modify them when they already fit the request instead of rewriting everything from scratch. Only return files you need to CREATE or MODIFY. Files you omit are kept as-is.\n\n**IMPORTANT — Color adaptation:** The scaffold's \`app/globals.css\` contains neutral placeholder colors. You MUST update the \`@theme inline\` color tokens (--color-primary, --color-secondary, --color-accent, etc.) to match the user's requested color palette or the site's subject matter. Never leave the default neutral/gray theme unchanged.\n\n${ctx.summary}\n\n## Scaffold Files\n\n${fileBlocks}${hints}`;
}

function inferLang(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "text";
}

function renderScaffoldFiles(scaffold: ScaffoldManifest, maxChars = 14000): string {
  const blocks: string[] = [];
  let usedChars = 0;

  for (const file of scaffold.files) {
    const block = `\`\`\`${inferLang(file.path)} file="${file.path}"\n${file.content}\n\`\`\``;
    if (usedChars + block.length > maxChars) {
      if (usedChars === 0) {
        const truncated = file.content.substring(0, maxChars - 200);
        blocks.push(`\`\`\`${inferLang(file.path)} file="${file.path}"\n${truncated}\n// ... truncated\n\`\`\``);
        usedChars = maxChars;
      }
      blocks.push(`_Additional scaffold files omitted for length: ${scaffold.files.length - blocks.length}_`);
      break;
    }

    blocks.push(block);
    usedChars += block.length;
  }

  return blocks.join("\n\n");
}
