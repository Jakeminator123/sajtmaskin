import { streamText } from "ai";

import { AUTOFIX_MAX_OUTPUT_TOKENS } from "../defaults";
import { getOpenAIModel } from "../models";
import { parseCodeProject, type CodeFile } from "../parser";
import { FIXER_SYSTEM_PROMPT, buildFixerUserPrompt } from "./fixer-prompt";
import { canonicalModelIdToOwnModelId } from "@/lib/models/catalog";

export interface FixerResult {
  fixedContent: string;
  fixedFiles: string[];
  missingFiles: string[];
  partial: boolean;
  success: boolean;
  durationMs: number;
}

const DEFAULT_FIXER_MODEL = canonicalModelIdToOwnModelId("pro");
export async function runLlmFixer(
  content: string,
  errors: string[],
  options?: {
    model?: string;
    maxTokens?: number;
    requiredFiles?: string[];
    abortSignal?: AbortSignal;
  },
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
      abortSignal: options?.abortSignal,
    });

    const fixedText = await result.text;
    const fixedProject = parseCodeProject(fixedText);

    if (fixedProject.files.length === 0) {
      return {
        fixedContent: content,
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: false,
        durationMs: performance.now() - start,
      };
    }

    const mergedContent = mergeFixedFiles(content, fixedProject.files);
    const fixedPaths = [...new Set(fixedProject.files.map((f) => f.path.trim()).filter(Boolean))];
    const requiredFiles = [
      ...new Set((options?.requiredFiles ?? []).map((f) => f.trim()).filter(Boolean)),
    ];
    const fixedPathSet = new Set(fixedPaths);
    const missingFiles =
      requiredFiles.length === 0
        ? []
        : requiredFiles.filter((filePath) => !fixedPathSet.has(filePath));
    const allRequiredFilesAddressed =
      requiredFiles.length === 0 || missingFiles.length === 0;
    const success = fixedPaths.length > 0 && allRequiredFilesAddressed;
    const partial = fixedPaths.length > 0 && !allRequiredFilesAddressed;

    return {
      fixedContent: mergedContent,
      fixedFiles: fixedPaths,
      missingFiles,
      partial,
      success,
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
      missingFiles: [],
      partial: false,
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
      const occurrences = result.split(orig.content).length - 1;
      if (occurrences === 1) {
        result = result.replace(orig.content, replacement.content);
      } else {
        console.warn(
          `[llm-fixer] mergeFixedFiles: skip ambiguous replace for "${orig.path}" (${occurrences} occurrences of same content)`,
        );
      }
    }
  }

  const originalPaths = new Set(originalProject.files.map((f) => f.path));
  for (const fixed of fixedFiles) {
    if (!originalPaths.has(fixed.path)) {
      const lang = fixed.language || "tsx";
      result += `\n\n\`\`\`${lang} file="${fixed.path}"\n${fixed.content}\n\`\`\``;
    }
  }

  return result;
}
