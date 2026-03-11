import type { ScaffoldManifest } from "./types";
import { buildFileContext } from "../context/file-context-builder";

const CREATIVE_THEME_KEYWORDS = [
  "retro", "vintage", "western", "cowboy", "vilda västern", "steampunk",
  "cyberpunk", "futuristic", "futuristisk", "neon", "grunge", "gothic",
  "art deco", "art nouveau", "brutalist", "brutalistisk", "psychedelic",
  "vaporwave", "synthwave", "pixel", "8-bit", "glitch", "noir", "film noir",
  "comic", "manga", "anime", "fantasy", "medieval", "medeltida", "pirate",
  "space", "rymd", "underwater", "tropical", "tropisk", "arctic", "arktisk",
  "jungle", "desert", "öken", "industrial", "industriell", "warehouse",
  "saloon", "barn", "rustic", "rustik", "bohemian", "boho", "hippie",
  "punk", "rave", "disco", "70-tal", "80-tal", "90-tal", "y2k",
];

export type ScaffoldSerializeMode = "structural" | "inspirational";

/**
 * Detect whether the prompt describes a creative/unique theme that should
 * use inspirational (lightweight) scaffold injection instead of full files.
 */
export function detectScaffoldMode(prompt: string, styleKeywords?: string[]): ScaffoldSerializeMode {
  const lower = prompt.toLowerCase();
  const kwHits = CREATIVE_THEME_KEYWORDS.filter((kw) => lower.includes(kw));
  if (kwHits.length >= 1) return "inspirational";
  if (styleKeywords && styleKeywords.length > 0) {
    const styleLower = styleKeywords.map((s) => s.toLowerCase());
    const styleHits = CREATIVE_THEME_KEYWORDS.filter((kw) =>
      styleLower.some((s) => s.includes(kw)),
    );
    if (styleHits.length >= 1) return "inspirational";
  }
  return "structural";
}

export function serializeScaffoldForPrompt(
  scaffold: ScaffoldManifest,
  mode: ScaffoldSerializeMode = "structural",
): string {
  const hints = scaffold.promptHints.length > 0
    ? `\n\nScaffold hints:\n${scaffold.promptHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  if (mode === "inspirational") {
    const filePaths = scaffold.files.map((f) => `- ${f.path}`).join("\n");
    const globalsCss = scaffold.files.find((f) => f.path.endsWith("globals.css"));
    const themeBlock = globalsCss
      ? `\n\n## Scaffold Theme Reference (adapt freely)\n\n\`\`\`css file="${globalsCss.path}"\n${globalsCss.content}\n\`\`\``
      : "";

    return `## Scaffold: ${scaffold.label} (inspirational mode)\n\n${scaffold.description}\n\nThe user's request describes a unique visual identity. Use the scaffold's file structure as a flexible starting point, but **create the visual design, layout, and page structure from scratch** based on the user's vision. You are not bound by the scaffold's existing layout, component patterns, or number of pages. If the user wants multiple pages, create them freely.\n\nScaffold file paths (create these files with your own implementation):\n${filePaths}${themeBlock}\n\n**IMPORTANT — Color adaptation:** The scaffold's \`@theme inline\` uses deliberately neutral gray tokens (hue 0, no color). You MUST replace them with a vivid, on-theme palette derived from the user's request. Always emit a complete \`app/globals.css\` with adapted colors. If the output still looks gray/neutral, you forgot to adapt the colors.${hints}`;
  }

  const ctx = buildFileContext({
    files: scaffold.files.map((f) => ({ path: f.path, content: f.content, language: inferLang(f.path) })),
    maxChars: 4000,
    includeContents: true,
    maxFilesWithContent: 4,
  });

  const fileBlocks = renderScaffoldFiles(scaffold);

  return `## Scaffold: ${scaffold.label}\n\n${scaffold.description}\n\nTreat these scaffold files as a flexible starting point — not a rigid template. Adapt structure, pages, and components freely to match what the user actually asked for. If the user wants two pages, create two pages even if the scaffold only has one. Only return files you need to CREATE or MODIFY. Files you omit are kept as-is.\n\n**IMPORTANT — Color adaptation:** The scaffold's \`app/globals.css\` contains deliberately neutral gray placeholder tokens (hue 0). You MUST replace them with a vivid, on-theme palette that fits the user's request. Always emit \`app/globals.css\` with adapted \`@theme inline\` color tokens. Gray/neutral output means you forgot.\n\n${ctx.summary}\n\n## Scaffold Files\n\n${fileBlocks}${hints}`;
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
