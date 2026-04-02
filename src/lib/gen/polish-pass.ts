/**
 * Optional second-pass LLM refinement focused on copy quality, placeholder
 * removal, CTA clarity, and visual hierarchy. Runs behind feature flag
 * SAJTMASKIN_POLISH_PASS=1.
 *
 * Budget and timeout come from manifest `postGenerationPasses`; polish scope can be
 * limited to verifier `polishCandidates` or heuristically capped file paths.
 */
import { generateText } from "ai";
import { getOpenAIModel, DEFAULT_MODEL } from "./models";
import { parseFilesFromContent } from "./version-manager";
import { parseCodeProject } from "./parser";
import { resolvePostGenerationPolishConfig } from "./post-generation-config";
import {
  extractCodeProjectSubsetForPaths,
  pickUnscopedPolishPaths,
} from "./verifier-pass";

export function isPolishPassEnabled(): boolean {
  const v = process.env.SAJTMASKIN_POLISH_PASS?.trim().toLowerCase();
  return v === "1" || v === "true";
}

const POLISH_SYSTEM = `You are a senior copy editor and UI polish reviewer for Next.js websites.

Your ONLY job is to improve the provided CodeProject files. You must:
1. Replace ALL remaining bracket placeholders ([Company Name], [Butiksnamn], etc.) with realistic, contextually appropriate content.
2. Improve headlines, subheadings, and body copy to sound professional and specific — not generic marketing filler.
3. Ensure every CTA button has clear, action-oriented text (not "Click here" or "Learn more").
4. Fix any obvious visual hierarchy issues (e.g. missing spacing classes, inconsistent heading sizes).
5. Keep the exact same file structure and component architecture — do NOT add or remove files.

Return the improved files in the same CodeProject format. Only include files you actually changed.
Do NOT add comments explaining your changes. Just output the improved code.`;

export type PolishPassOptions = {
  model?: string;
  abortSignal?: AbortSignal;
  /** From verifier phase — limits which fences are sent to the model */
  polishTargetPaths?: string[];
  maxFilesWhenUnscoped?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

function resolvePolishPayload(
  content: string,
  opts: PolishPassOptions,
): { promptPayload: string; usedScopedPaths: boolean } {
  const manifestDefaults = resolvePostGenerationPolishConfig();
  const maxFiles = opts.maxFilesWhenUnscoped ?? manifestDefaults.maxFilesWhenUnscoped;
  const { files } = parseCodeProject(content);

  if (opts.polishTargetPaths && opts.polishTargetPaths.length > 0) {
    const pathSet = new Set(opts.polishTargetPaths);
    const matchedPaths = files.filter((file) => pathSet.has(file.path)).map((file) => file.path);
    if (matchedPaths.length > 0) {
      return {
        promptPayload: extractCodeProjectSubsetForPaths(content, matchedPaths),
        usedScopedPaths: true,
      };
    }
  }

  if (files.length <= maxFiles) {
    return { promptPayload: content, usedScopedPaths: false };
  }
  const picked = pickUnscopedPolishPaths(files, maxFiles);
  const sub = extractCodeProjectSubsetForPaths(content, picked);
  return { promptPayload: sub.length > 400 ? sub : content, usedScopedPaths: picked.length < files.length };
}

export async function runPolishPass(
  content: string,
  opts: PolishPassOptions = {},
): Promise<{ polishedContent: string; filesChanged: number; applied: boolean }> {
  if (!isPolishPassEnabled()) {
    return { polishedContent: content, filesChanged: 0, applied: false };
  }

  const manifestDefaults = resolvePostGenerationPolishConfig();
  const maxOutputTokens = opts.maxOutputTokens ?? manifestDefaults.maxOutputTokens;
  const timeoutMs = opts.timeoutMs ?? manifestDefaults.timeoutMs;

  const model = getOpenAIModel(opts.model ?? DEFAULT_MODEL);
  const { promptPayload } = resolvePolishPayload(content, {
    ...opts,
    maxFilesWhenUnscoped: opts.maxFilesWhenUnscoped ?? manifestDefaults.maxFilesWhenUnscoped,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = opts.abortSignal
    ? AbortSignal.any([opts.abortSignal, controller.signal])
    : controller.signal;

  try {
    const result = await generateText({
      model,
      system: POLISH_SYSTEM,
      prompt: `Review and polish the following generated website code:\n\n${promptPayload}`,
      maxOutputTokens,
      abortSignal: combinedSignal,
    });

    clearTimeout(timeoutId);

    const polishedText = result.text?.trim();
    if (!polishedText || polishedText.length < 100) {
      return { polishedContent: content, filesChanged: 0, applied: false };
    }

    try {
      const polishedFiles = JSON.parse(parseFilesFromContent(polishedText));
      if (!Array.isArray(polishedFiles) || polishedFiles.length === 0) {
        return { polishedContent: content, filesChanged: 0, applied: false };
      }
    } catch {
      return { polishedContent: content, filesChanged: 0, applied: false };
    }

    const merged = mergePolishIntoOriginal(content, polishedText);

    return {
      polishedContent: merged,
      filesChanged: countChangedFiles(content, merged),
      applied: true,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[polish-pass] Non-fatal error, skipping polish:", err);
    return { polishedContent: content, filesChanged: 0, applied: false };
  }
}

function mergePolishIntoOriginal(
  original: string,
  polished: string,
): string {
  let merged = original;

  try {
    const polishedParsed = JSON.parse(parseFilesFromContent(polished)) as Array<{
      path: string;
      content: string;
    }>;
    if (!Array.isArray(polishedParsed)) return original;

    for (const pf of polishedParsed) {
      if (!pf.path || !pf.content) continue;

      const escapedPath = pf.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fenceRe = new RegExp(
        "(```\\w+\\s+file=\"" + escapedPath + "\"[^\\n]*\\n)" +
          "([\\s\\S]*?)" +
          "(\\n```)",
      );
      const match = merged.match(fenceRe);
      if (match) {
        merged = merged.replace(fenceRe, `$1${pf.content}$3`);
      }
    }
  } catch {
    return original;
  }

  return merged;
}

function countChangedFiles(original: string, merged: string): number {
  if (original === merged) return 0;
  try {
    const origParsed = JSON.parse(parseFilesFromContent(original)) as Array<{ path: string; content: string }>;
    const mergedParsed = JSON.parse(parseFilesFromContent(merged)) as Array<{ path: string; content: string }>;
    if (!Array.isArray(origParsed) || !Array.isArray(mergedParsed)) return 0;

    const origMap = new Map(origParsed.map((f) => [f.path, f.content]));
    let changed = 0;
    for (const f of mergedParsed) {
      const orig = origMap.get(f.path);
      if (orig && orig !== f.content) changed++;
    }
    return changed;
  } catch {
    return 0;
  }
}
