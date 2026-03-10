import { parseCodeProject } from "@/lib/gen/parser";

interface PromptInjectionResult {
  safe: boolean;
  indicators: string[];
}

const SYSTEM_PROMPT_LEAKS: RegExp[] = [
  /You are sajtmaskin/i,
  /\bSTATIC_CORE\b/,
  /CodeProject format/i,
];

const INSTRUCTION_OVERRIDES: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /\bSystem:\s/,
  /\bNew instructions:/i,
  /you\s+are\s+now\s+a/i,
  /forget\s+(all\s+)?your\s+instructions/i,
];

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("{/*")
  );
}

export function checkPromptInjection(content: string): PromptInjectionResult {
  const indicators: string[] = [];
  const project = parseCodeProject(content);

  for (const file of project.files) {
    const lines = file.content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      for (const re of SYSTEM_PROMPT_LEAKS) {
        if (re.test(line)) {
          indicators.push(`[${file.path}:${i + 1}] system prompt leak: ${re.source}`);
        }
      }

      for (const re of INSTRUCTION_OVERRIDES) {
        if (re.test(line)) {
          indicators.push(`[${file.path}:${i + 1}] instruction override: ${re.source}`);
        }
      }
    }
  }

  return { safe: indicators.length === 0, indicators };
}
