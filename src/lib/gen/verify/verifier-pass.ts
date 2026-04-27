/**
 * Read-only LLM review after syntax validation (telemetry / quality signal).
 * Model comes from phaseRouting.verifier for the active tier (manifest).
 */
import { z } from "zod";
import { generateObject } from "ai";
import { parseCodeProject } from "@/lib/gen/parser";
import { toAnthropicEffort } from "@/lib/gen/engine";
import { getOpenAIModel, isAnthropicModel } from "@/lib/gen/models";
import { resolvePostGenerationVerifierConfig } from "@/lib/gen/verify/post-generation-config";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
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
});

export type VerifierFindings = z.infer<typeof VerifierFindingsSchema>;

export const EMPTY_VERIFIER_FINDINGS: VerifierFindings = {
  blocking: [],
  quality: [],
};

/**
 * Finding ids that we always want surfaced as `blocking` even if the model
 * placed them in `quality`. Keeps the contract stable when prompt drifts.
 */
const FORCE_BLOCKING_IDS = new Set<string>([
  "navigation-placeholder-actions",
  "footer-dead-links",
]);

/**
 * Promote known production-quality issues from `quality` to `blocking` so they
 * cannot silently slip through when the LLM mis-classifies them.
 */
export function promoteForcedBlockingFindings(findings: VerifierFindings): VerifierFindings {
  if (findings.quality.length === 0) return findings;
  const promoted: typeof findings.blocking = [];
  const remainingQuality: typeof findings.quality = [];
  for (const item of findings.quality) {
    if (FORCE_BLOCKING_IDS.has(item.id)) {
      promoted.push(item);
    } else {
      remainingQuality.push(item);
    }
  }
  if (promoted.length === 0) return findings;
  return {
    blocking: [...findings.blocking, ...promoted],
    quality: remainingQuality,
  };
}

type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };
type ProviderOptionsRecord = Record<string, JsonObject>;

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
  const thinkingConfig = resolvePhaseThinking(opts.resolvedTier, "verifier");

  const snippet = buildVerifierPromptSnippet(codeProjectContent, cfg.snippetCharsPerFile);
  if (!snippet.trim()) {
    return EMPTY_VERIFIER_FINDINGS;
  }

  const system = `You are a read-only QA reviewer for a generated Next.js site (CodeProject).
Return structured findings only. Do not output code fixes.
- blocking: issues that likely break build, types, imports, or critical runtime (wrong paths, missing exports, obvious TS errors). Put file paths inside detail when relevant.
- quality: important but non-blocking (a11y gaps, weak SEO, fragile patterns).

The following production-quality issues MUST be reported as blocking (not quality), because they break the user-facing contract of a marketing/SaaS site even when the build succeeds:
- CTA / primary buttons or links that have no real destination (no \`href\`, \`href="#"\`, empty \`href\`, or no \`onClick\`). Use the id "navigation-placeholder-actions" and list the file + element labels in detail.
- Footer links pointing to \`href="#"\` or empty href. Use the id "footer-dead-links" and list the file in detail.
Use those exact ids so downstream tooling can recognise them.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let providerOptions: ProviderOptionsRecord | undefined;
  if (thinkingConfig.thinking) {
    providerOptions = isAnthropicModel(modelId)
      ? {
          anthropic: {
            thinking: { type: "adaptive" as const },
            effort: toAnthropicEffort(thinkingConfig.reasoningEffort),
          },
        }
      : {
          openai: { reasoningEffort: thinkingConfig.reasoningEffort },
        };
  }

  try {
    const result = await generateObject({
      model: getOpenAIModel(modelId),
      schema: VerifierFindingsSchema,
      system,
      prompt: `Review this generated project (snippets may be truncated):\n\n${snippet}`,
      maxOutputTokens: cfg.maxOutputTokens,
      abortSignal: controller.signal,
      ...(providerOptions ? { providerOptions } : {}),
    });
    return promoteForcedBlockingFindings(result.object);
  } catch (err) {
    console.warn("[verifier-pass] Non-fatal error, skipping:", err);
    return EMPTY_VERIFIER_FINDINGS;
  } finally {
    clearTimeout(timeoutId);
  }
}