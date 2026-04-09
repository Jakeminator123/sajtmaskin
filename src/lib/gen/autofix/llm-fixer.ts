import { streamText } from "ai";

import { AUTOFIX_MAX_OUTPUT_TOKENS } from "../defaults";
import { getOpenAIModel } from "../models";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "../parser";
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
  if (originalProject.files.length === 0) {
    return fixedFiles.length > 0 ? serializeCodeProject(fixedFiles) : originalContent;
  }

  const fixedByPath = new Map(
    fixedFiles
      .map((file) => ({ ...file, path: file.path.trim() }))
      .filter((file) => file.path.length > 0)
      .map((file) => [file.path, file]),
  );

  const mergedFiles: CodeFile[] = [];
  for (const orig of originalProject.files) {
    const replacement = fixedByPath.get(orig.path);
    if (!replacement) {
      mergedFiles.push(orig);
      continue;
    }
    mergedFiles.push({
      ...orig,
      ...replacement,
      path: orig.path,
      language: replacement.language || orig.language,
    });
    fixedByPath.delete(orig.path);
  }

  for (const remaining of fixedByPath.values()) {
    mergedFiles.push(remaining);
  }

  return serializeCodeProject(mergedFiles);
}
