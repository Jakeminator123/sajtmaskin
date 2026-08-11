import { streamText } from "ai";

import { AUTOFIX_MAX_OUTPUT_TOKENS } from "../defaults";
import type { ReasoningEffort, ReasoningMode } from "../engine";
import { toAnthropicEffort } from "../engine";
import { getOpenAIModel, isAnthropicModel } from "../models";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "../parser";
import {
  FIXER_SYSTEM_PROMPT,
  buildFixerUserPrompt,
  type RecurringFailurePattern,
} from "./fixer-prompt";
import { canonicalModelIdToOwnModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { recordLlmUsage } from "@/lib/observability/llm-usage";

export interface FixerResult {
  fixedContent: string;
  fixedFiles: string[];
  missingFiles: string[];
  /**
   * Files that the LLM returned but with strong signals of truncation /
   * partial output (length shrink > 50%, ellipsis-tail, unbalanced braces).
   * These are excluded from the merge to avoid corrupting the project.
   * Same class of bug as the historic "ButtonProps" + "missing }" cases.
   */
  incompleteFiles: Array<{ path: string; reason: string }>;
  partial: boolean;
  success: boolean;
  /**
   * True om körningen avbröts via AbortSignal/timeout. Skiljs från andra
   * fel så att anroparen kan eskalera direkt till repair-loop istället
   * för att vänta på server-verify.
   */
  aborted?: boolean;
  durationMs: number;
}

/**
 * Detect partial / truncated files in LLM repair output BEFORE merging
 * them into the project. esbuild syntax-pass runs after merge, which is
 * too late — a truncated file with a missing `}` corrupts downstream
 * compilation while server-repair logs report "0 syntax errors remain".
 */
function validateCompleteFiles(
  originalByPath: Map<string, string>,
  fixedFiles: CodeFile[],
): { incomplete: Array<{ path: string; reason: string }> } {
  const incomplete: Array<{ path: string; reason: string }> = [];
  const tailPlaceholder =
    /(\/\/\s*\.{3}|\/\*\s*(rest|remaining|unchanged|truncated)[^*]*\*\/|\.{3}\s*$|\/\/\s*rest\s+(of\s+)?(the\s+)?(code|file)\s+(unchanged|here)|\/\/\s*\(.*?unchanged.*?\))/i;

  for (const fixed of fixedFiles) {
    const path = fixed.path.trim();
    if (!path) continue;
    const orig = originalByPath.get(path);

    // Reject substantial shrink; LLMs often skip "boring" middle parts.
    if (orig && fixed.content.length < orig.length * 0.5 && orig.length > 200) {
      incomplete.push({
        path,
        reason: `shrink_below_50pct (orig=${orig.length}, fixed=${fixed.content.length})`,
      });
      continue;
    }

    // Reject ellipsis / "rest unchanged" tail markers.
    const tail = fixed.content.trimEnd().slice(-160);
    if (tailPlaceholder.test(tail)) {
      incomplete.push({ path, reason: "ellipsis_or_rest_unchanged_tail" });
      continue;
    }

    // Naive delimiter balance check. False positives possible inside
    // strings/regex but catches the common "missing }" truncation.
    if (!balancedDelimiters(fixed.content)) {
      incomplete.push({ path, reason: "unbalanced_delimiters" });
      continue;
    }
  }
  return { incomplete };
}

function balancedDelimiters(src: string): boolean {
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "`") inBacktick = false;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      continue;
    }
    if (c === "`") {
      inBacktick = true;
      continue;
    }
    if (c === "{") brace++;
    else if (c === "}") brace--;
    else if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "[") bracket++;
    else if (c === "]") bracket--;
    if (brace < 0 || paren < 0 || bracket < 0) return false;
  }
  return brace === 0 && paren === 0 && bracket === 0;
}

type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };
type ProviderOptionsRecord = Record<string, JsonObject>;

const DEFAULT_FIXER_MODEL = canonicalModelIdToOwnModelId("pro");
export async function runLlmFixer(
  content: string,
  errors: string[],
  options?: {
    model?: string;
    thinking?: boolean;
    reasoningEffort?: ReasoningEffort;
    reasoningMode?: ReasoningMode;
    maxTokens?: number;
    requiredFiles?: string[];
    abortSignal?: AbortSignal;
    // Återkommande felmönster från tidigare runs i samma chat-session.
    // Läses typiskt via `readRecurringPatternsForChat(chatId)` i
    // `@/lib/logging/generation-log-writer`. Vi använder dem för att be
    // LLM:en att INTE upprepa fixar som redan misslyckats N gånger.
    recurringPatterns?: RecurringFailurePattern[];
  },
): Promise<FixerResult> {
  const start = performance.now();

  // Hoistat så catch-vägen kan läsa usage: ett avbrutet eller timeat fixer-anrop
  // har ändå förbrukat tokens, och det är just de körningarna som är dyrast.
  let streamResult: ReturnType<typeof streamText> | null = null;
  let usageRecorded = false;
  let resolvedModelIdForUsage: string | null = null;
  try {
    const userPrompt = buildFixerUserPrompt(content, errors, {
      requiredFiles: options?.requiredFiles,
      recurringPatterns: options?.recurringPatterns,
    });
    const model = getOpenAIModel(options?.model ?? DEFAULT_FIXER_MODEL);
    const resolvedModelId = options?.model ?? DEFAULT_FIXER_MODEL;
    const resolvedThinking = Boolean(options?.thinking);
    let providerOptions: ProviderOptionsRecord | undefined;
    if (isAnthropicModel(resolvedModelId)) {
      // Same pattern as engine.ts: Opus defaults to high effort if omitted.
      providerOptions = {
        anthropic: {
          thinking: resolvedThinking
            ? { type: "adaptive" as const }
            : { type: "disabled" as const },
          effort: toAnthropicEffort(options?.reasoningEffort ?? "medium"),
        },
      };
    } else if (resolvedThinking) {
      providerOptions = {
        openai: {
          reasoningEffort: options?.reasoningEffort ?? "medium",
          ...(options?.reasoningMode ? { reasoningMode: options.reasoningMode } : {}),
        },
      };
    } else if (resolvedModelId.startsWith("gpt-5.6-")) {
      // GPT-5.6 goes through Responses API; omitting reasoningEffort defaults to
      // medium and quietly re-enables thinking despite thinking:false in the
      // phase manifest (Premium fixer pin). Force none so latency stays bounded.
      providerOptions = {
        openai: {
          reasoningEffort: "none",
        },
      };
    }

    resolvedModelIdForUsage = resolvedModelId;
    const result = streamText({
      model,
      system: FIXER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: options?.maxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS,
      abortSignal: options?.abortSignal,
      ...(providerOptions ? { providerOptions } : {}),
    });
    streamResult = result;

    const fixedText = await result.text;
    // RepairGate kastade tidigare sin usage — den kunde vara en stor del av en
    // körnings kostnad utan att synas någonstans.
    recordLlmUsage({
      phase: "fixer",
      model: resolvedModelId,
      usage: await Promise.resolve(result.usage).catch(() => null),
      durationMs: Math.round(performance.now() - start),
    });
    usageRecorded = true;
    const fixedProject = parseCodeProject(fixedText);

    if (fixedProject.files.length === 0) {
      return {
        fixedContent: content,
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: false,
        durationMs: performance.now() - start,
      };
    }

    // Pre-merge completeness check. If the LLM returned partial files,
    // exclude them so we don't corrupt the project with truncated code.
    const originalProject = parseCodeProject(content);
    const originalByPath = new Map(originalProject.files.map((f) => [f.path.trim(), f.content]));
    const { incomplete } = validateCompleteFiles(originalByPath, fixedProject.files);
    const incompletePathSet = new Set(incomplete.map((i) => i.path));
    const acceptedFixedFiles = fixedProject.files.filter(
      (f) => !incompletePathSet.has(f.path.trim()),
    );

    if (incomplete.length > 0) {
      console.warn(
        "[llm-fixer] excluded incomplete files from merge:",
        incomplete.map((i) => `${i.path} (${i.reason})`).join(", "),
      );
      devLogAppend("in-progress", {
        type: "llm_fixer_partial_response",
        excludedFiles: incomplete,
        totalFixedFilesAttempted: fixedProject.files.length,
      });
    }

    const mergedContent = mergeFixedFiles(content, acceptedFixedFiles);
    const fixedPaths = [...new Set(acceptedFixedFiles.map((f) => f.path.trim()).filter(Boolean))];
    const requiredFiles = [
      ...new Set((options?.requiredFiles ?? []).map((f) => f.trim()).filter(Boolean)),
    ];
    const fixedPathSet = new Set(fixedPaths);
    const missingFiles =
      requiredFiles.length === 0
        ? []
        : requiredFiles.filter((filePath) => !fixedPathSet.has(filePath));
    const allRequiredFilesAddressed = requiredFiles.length === 0 || missingFiles.length === 0;
    // partial = either some required files weren't addressed, or some
    // returned files were rejected as incomplete.
    const partial = (fixedPaths.length > 0 && !allRequiredFilesAddressed) || incomplete.length > 0;
    // success requires all required files AND no incomplete-file rejections.
    const success = fixedPaths.length > 0 && allRequiredFilesAddressed && incomplete.length === 0;

    return {
      fixedContent: mergedContent,
      fixedFiles: fixedPaths,
      missingFiles,
      incompleteFiles: incomplete,
      partial,
      success,
      aborted: false,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
    const message = err instanceof Error ? err.message : String(err);
    if (!usageRecorded) {
      // Avbrott/timeout/providerfel: strömmen hann kosta tokens även om ingen
      // text kom ut. Utan den här raden underrapporteras precis de körningar
      // där reparationen föll.
      recordLlmUsage({
        phase: "fixer",
        model: resolvedModelIdForUsage,
        usage: streamResult ? await Promise.resolve(streamResult.usage).catch(() => null) : null,
        durationMs: Math.round(performance.now() - start),
        ok: false,
        errorCode: isAbort ? "llm_fixer_aborted" : "llm_fixer_failed",
      });
      usageRecorded = true;
    }
    if (isAbort) {
      console.error("[llm-fixer] aborted (AbortSignal/timeout):", message);
      const inputFiles = parseCodeProject(content).files;
      devLogAppend("in-progress", {
        type: "llm_fixer_aborted",
        durationMs: performance.now() - start,
        errorsCount: errors.length,
        requiredFilesCount: options?.requiredFiles?.length ?? 0,
        inputFileCount: inputFiles.length,
        inputCharLength: content.length,
        promptCharLength: errors.join("\n").length,
      });
    } else {
      console.error("[llm-fixer] failed:", message);
    }
    return {
      fixedContent: content,
      fixedFiles: [],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: false,
      aborted: isAbort,
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
