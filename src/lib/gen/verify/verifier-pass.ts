/**
 * Read-only LLM review after syntax validation; drives targeted polish scope.
 * Model comes from phaseRouting.verifier for the active tier (manifest).
 */
import { z } from "zod";
import { generateObject } from "ai";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { getOpenAIModel } from "@/lib/gen/models";
import { resolvePostGenerationVerifierConfig } from "@/lib/gen/verify/post-generation-config";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";

/** OpenAI structured-output strict mode requires no optional object keys — keep paths inside `detail`. */
const VerifierFindingsSchema = z.object({
  blocking: z.array(
    z.object({
      id: z.string(),
      detail: z.string(),
    }),
  ),
  quality: z.array(
    z.object({
      id: z.string(),
      detail: z.string(),
    }),
  ),
  /** Exact project paths suitable for copy/placeholder polish */
  polishCandidates: z.array(z.string()),
});

export type VerifierFindings = z.infer<typeof VerifierFindingsSchema>;

export const EMPTY_VERIFIER_FINDINGS: VerifierFindings = {
  blocking: [],
  quality: [],
  polishCandidates: [],
};

export function isVerifierPassEnabled(): boolean {
  const v = process.env.SAJTMASKIN_VERIFIER_PASS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function buildVerifierPromptSnippet(codeProjectContent: string, charsPerFile: number): string {
  const { files } = parseCodeProject(codeProjectContent);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.path || f.content == null) continue;
    const c =
      f.content.length > charsPerFile
        ? `${f.content.slice(0, charsPerFile)}\n…[truncated]`
        : f.content;
    parts.push(`--- FILE: ${f.path} ---\n${c}`);
  }
  return parts.join("\n\n");
}

export async function runVerifierPass(
  codeProjectContent: string,
  opts: { resolvedTier: CanonicalModelId },
): Promise<VerifierFindings> {
  if (!isVerifierPassEnabled()) {
    return EMPTY_VERIFIER_FINDINGS;
  }
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasKey) {
    return EMPTY_VERIFIER_FINDINGS;
  }

  const cfg = resolvePostGenerationVerifierConfig();
  const modelId = resolvePhaseModel(opts.resolvedTier, "verifier").modelId;

  const snippet = buildVerifierPromptSnippet(codeProjectContent, cfg.snippetCharsPerFile);
  if (!snippet.trim()) {
    return EMPTY_VERIFIER_FINDINGS;
  }

  const system = `You are a read-only QA reviewer for a generated Next.js site (CodeProject).
Return structured findings only. Do not output code fixes.
- blocking: issues that likely break build, types, imports, or critical runtime (wrong paths, missing exports, obvious TS errors). Put file paths inside detail when relevant. Flag \`as const\` on arrays assigned to Next.js Metadata fields (keywords, authors) — this causes "readonly not assignable to mutable" TS errors.
- quality: important but non-blocking (a11y gaps, weak SEO, fragile patterns, English text on a Swedish site, emojis in copy, missing Swedish characters å/ä/ö, poor heading hierarchy).
- polishCandidates: file paths only (exact paths as in FILE headers) that need copy/placeholder/CTA polish. Prefer page.tsx, layout.tsx, landing sections. Max 20 paths; use [] if none.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const result = await generateObject({
      model: getOpenAIModel(modelId),
      schema: VerifierFindingsSchema,
      system,
      prompt: `Review this generated project (snippets may be truncated):\n\n${snippet}`,
      maxOutputTokens: cfg.maxOutputTokens,
      abortSignal: controller.signal,
    });
    return result.object;
  } catch (err) {
    console.warn("[verifier-pass] Non-fatal error, skipping:", err);
    return EMPTY_VERIFIER_FINDINGS;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function scorePathForPolishHeuristic(path: string): number {
  let s = 0;
  if (/page\.tsx$/i.test(path)) s += 5;
  if (/layout\.tsx$/i.test(path)) s += 3;
  if (path.includes("/app/")) s += 2;
  if (/\.tsx$/i.test(path)) s += 1;
  if (/components/i.test(path)) s += 1;
  return s;
}

export function pickUnscopedPolishPaths(files: CodeFile[], maxFiles: number): string[] {
  const scored = files
    .filter((f) => f.path && f.content != null)
    .map((f) => ({ path: f.path, score: scorePathForPolishHeuristic(f.path) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, maxFiles)).map((x) => x.path);
}

/** Build a CodeProject markdown string containing only the given paths (falls back to full if no match). */
export function extractCodeProjectSubsetForPaths(fullContent: string, paths: string[]): string {
  if (paths.length === 0) return fullContent;
  const set = new Set(paths);
  const { files } = parseCodeProject(fullContent);
  const selected = files.filter((f) => set.has(f.path));
  if (selected.length === 0) return fullContent;
  return selected
    .map((f) => {
      const lang = f.language || "tsx";
      return `\`\`\`${lang} file="${f.path}"\n${f.content}\n\`\`\``;
    })
    .join("\n\n");
}
