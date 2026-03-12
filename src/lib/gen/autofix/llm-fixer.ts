import { streamText } from "ai";

import { AUTOFIX_MAX_OUTPUT_TOKENS } from "../defaults";
import { getOpenAIModel } from "../models";
import { parseCodeProject, type CodeFile } from "../parser";
import { FIXER_SYSTEM_PROMPT, buildFixerUserPrompt } from "./fixer-prompt";

export interface FixerResult {
  fixedContent: string;
  fixedFiles: string[];
  success: boolean;
  durationMs: number;
}

const DEFAULT_FIXER_MODEL = "gpt-4.1-mini";
export async function runLlmFixer(
  content: string,
  errors: string[],
  options?: { model?: string; maxTokens?: number },
): Promise<FixerResult> {
  const start = performance.now();

  try {
    const userPrompt = buildFixerUserPrompt(content, errors);
    const model = getOpenAIModel(options?.model ?? DEFAULT_FIXER_MODEL);

    const result = streamText({
      model,
      system: FIXER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: options?.maxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS,
    });

    const fixedText = await result.text;
    const fixedProject = parseCodeProject(fixedText);

    if (fixedProject.files.length === 0) {
      return {
        fixedContent: content,
        fixedFiles: [],
        success: false,
        durationMs: performance.now() - start,
      };
    }

    const mergedContent = mergeFixedFiles(content, fixedProject.files);
    const fixedPaths = fixedProject.files.map((f) => f.path);

    return {
      fixedContent: mergedContent,
      fixedFiles: fixedPaths,
      success: true,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    console.error(
      "[llm-fixer] failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      fixedContent: content,
      fixedFiles: [],
      success: false,
      durationMs: performance.now() - start,
    };
  }
}

function mergeFixedFiles(originalContent: string, fixedFiles: CodeFile[]): string {
  const originalProject = parseCodeProject(originalContent);
  const fixedByPath = new Map(fixedFiles.map((f) => [f.path, f]));
  let result = originalContent;

  for (const orig of originalProject.files) {
    const replacement = fixedByPath.get(orig.path);
    if (!replacement || replacement.content === orig.content) continue;

    const escapedPath = orig.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fenceRe = new RegExp(
      "(```\\w+\\s+file=\"" + escapedPath + "\"[^\\n]*\\n)" +
        "([\\s\\S]*?)" +
        "(\\n```)",
    );
    const match = result.match(fenceRe);
    if (match) {
      result = result.replace(fenceRe, `$1${replacement.content}$3`);
    } else {
      result = result.replace(orig.content, replacement.content);
    }
  }

  return result;
}
