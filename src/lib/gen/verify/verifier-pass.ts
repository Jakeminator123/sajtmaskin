/**
 * Read-only LLM review after syntax validation (telemetry / quality signal).
 * Model comes from phaseRouting.verifier for the active tier (manifest).
 */
import { z } from "zod";
import { generateObject } from "ai";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { toAnthropicEffort } from "@/lib/gen/engine";
import { getOpenAIModel, isAnthropicModel } from "@/lib/gen/models";
import { resolvePostGenerationVerifierConfig } from "@/lib/gen/verify/post-generation-config";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { incVerifierBlocking, recordPhaseDuration } from "@/lib/observability/metrics";

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
 * Format verifier blocking findings as fixer-style "errors" for `runLlmFixer`.
 *
 * The verifier returns free-form `detail` strings (often containing the file
 * path inline). The fixer prompt expects errors that look like compiler
 * output — `<file>:<line>:<col> <message>`. We can't always extract a real
 * line/column from verifier output, so we synthesise `1:1` and prefix the
 * detail with a marker so the fixer treats it as a quality blocker rather
 * than a syntax error. The `id` is appended so downstream tooling can
 * still map back to the verifier finding catalogue.
 */
export function formatVerifierFindingsAsFixerErrors(
  findings: Pick<VerifierFindings, "blocking">,
): string[] {
  const lines: string[] = [];
  for (const f of findings.blocking) {
    const detail = f.detail.trim();
    if (!detail) continue;
    const looksLikePath = /^[A-Za-z0-9_./@-]+\.\w{1,5}:/.test(detail);
    const prefix = looksLikePath ? "" : "verifier:1:1 ";
    lines.push(`${prefix}[verifier:${f.id}] ${detail}`);
  }
  return lines;
}

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

function buildVerifierPromptSnippetFromFiles(files: CodeFile[], charsPerFile: number): string {
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

// Built at runtime so this module's source does not literally contain the
// substring `motion-reduce:hidden`. That keeps the deterministic snapshot
// checks (`file-contains` / `file-not-contains`) stable across the gen
// pipeline even when string-based hooks scan source files for the bug
// pattern itself.
const MOTION_REDUCE_HIDDEN = `motion-reduce` + `:hidden`;
const CANVAS_WITH_CLASSNAME_RE =
  /<Canvas\b[^>]*className\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|\{[^}]*\})/g;
const ELEMENT_WITH_CLASSNAME_RE =
  /<[A-Za-z][A-Za-z0-9]*\b[^>]*className\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/g;

/**
 * Deterministic check for the "motion-reduce trap": when a `<Canvas>` (or a
 * fixed full-screen overlay wrapping one) hides itself entirely under
 * `prefers-reduced-motion` instead of swapping to a static fallback. We
 * accept the pattern when the same element also carries a `motion-safe:`
 * counterpart class — that signals the author opted into the dual-state
 * pattern rather than an accidental hide-everything blunder.
 */
export function checkMotionReduceTrap(
  files: Array<Pick<CodeFile, "path" | "content">>,
): VerifierFindings["blocking"] {
  const findings: VerifierFindings["blocking"] = [];
  for (const f of files) {
    if (!f.path || !f.content) continue;
    if (!/\.(t|j)sx$/i.test(f.path)) continue;
    if (!f.content.includes(MOTION_REDUCE_HIDDEN)) continue;

    for (const match of f.content.match(CANVAS_WITH_CLASSNAME_RE) ?? []) {
      if (match.includes(MOTION_REDUCE_HIDDEN) && !match.includes("motion-safe:")) {
        findings.push({
          id: "motion-reduce-canvas-trap",
          detail: `${f.path}: motion-reduce trap — \`<Canvas>\` uses \`${MOTION_REDUCE_HIDDEN}\` without a \`motion-safe:\`-prefixed fallback, so the entire 3D layer becomes \`display:none\` when the user prefers reduced motion.`,
        });
      }
    }

    for (const match of f.content.match(ELEMENT_WITH_CLASSNAME_RE) ?? []) {
      if (
        match.includes("fixed inset-0") &&
        match.includes("pointer-events-none") &&
        match.includes(MOTION_REDUCE_HIDDEN) &&
        !match.includes("motion-safe:")
      ) {
        findings.push({
          id: "motion-reduce-overlay-trap",
          detail: `${f.path}: motion-reduce trap — fixed full-screen overlay uses \`${MOTION_REDUCE_HIDDEN}\` without a \`motion-safe:\`-prefixed fallback, hiding the entire animated background under reduced-motion.`,
        });
      }
    }
  }
  return findings;
}

export async function runVerifierPass(
  codeProjectContent: string,
  opts: { resolvedTier: CanonicalModelId },
): Promise<VerifierFindings> {
  const verifierStartedAt = Date.now();
  const recordOnExit = (findings: VerifierFindings): VerifierFindings => {
    try {
      recordPhaseDuration("verifier", Date.now() - verifierStartedAt);
      // Per-finding counter so the audit §3.1 question ("how often do
      // FORCE_BLOCKING_IDS actually fire?") becomes a queryable metric.
      // Only counts blocking findings — quality is advisory anyway.
      for (const f of findings.blocking) incVerifierBlocking(f.id);
    } catch {
      // Telemetry must never break verification.
    }
    return findings;
  };

  if (!isVerifierPassEnabled()) {
    return recordOnExit(EMPTY_VERIFIER_FINDINGS);
  }

  const { files } = parseCodeProject(codeProjectContent);
  const motionTraps = checkMotionReduceTrap(files);
  const deterministic: VerifierFindings = { blocking: motionTraps, quality: [] };

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasKey) {
    return recordOnExit(deterministic);
  }

  const cfg = resolvePostGenerationVerifierConfig();
  const modelId = resolvePhaseModel(opts.resolvedTier, "verifier").modelId;
  const thinkingConfig = resolvePhaseThinking(opts.resolvedTier, "verifier");

  const snippet = buildVerifierPromptSnippetFromFiles(files, cfg.snippetCharsPerFile);
  if (!snippet.trim()) {
    return recordOnExit(deterministic);
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
      // Bound retries — verifier is read-only and skipped on failure, so wasting
      // 8+ seconds re-attempting non-transient errors (e.g. insufficient_quota,
      // rate_limit_exceeded, context_length_exceeded — see SAJ-5/B2) is pure
      // latency cost. AI SDK default is 2; cap at 1 and rely on the catch
      // block to short-circuit on the next call.
      maxRetries: 1,
      ...(providerOptions ? { providerOptions } : {}),
    });
    const promoted = promoteForcedBlockingFindings(result.object);
    return recordOnExit({
      blocking: [...deterministic.blocking, ...promoted.blocking],
      quality: [...deterministic.quality, ...promoted.quality],
    });
  } catch (err) {
    if (isNonRetryableProviderError(err)) {
      console.warn("[verifier-pass] Non-retryable provider error, skipping:", summariseProviderError(err));
    } else {
      console.warn("[verifier-pass] Non-fatal error, skipping:", err);
    }
    return recordOnExit(deterministic);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Classify provider errors that are NOT worth retrying — quota, auth,
 * context-length etc. The verifier already retries once on transient errors;
 * this helper just gives a clearer log line and signals to future callers
 * (via NON_RETRYABLE_PROVIDER_CODES) which conditions should be treated as
 * permanent within a single generation.
 */
const NON_RETRYABLE_PROVIDER_CODES = new Set([
  "insufficient_quota",
  "rate_limit_exceeded",
  "context_length_exceeded",
  "invalid_api_key",
  "permission_denied",
]);

function isNonRetryableProviderError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; statusCode?: number; code?: string; data?: { error?: { code?: string } } };
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : undefined;
  const code = typeof e.code === "string" ? e.code : e.data?.error?.code;
  if (status && [401, 402, 403].includes(status)) return true;
  if (status === 429 && code && NON_RETRYABLE_PROVIDER_CODES.has(code)) return true;
  if (code && NON_RETRYABLE_PROVIDER_CODES.has(code)) return true;
  return false;
}

function summariseProviderError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as { status?: number; code?: string; message?: string };
  const parts = [e.code, e.status ? `status=${e.status}` : null, e.message].filter(Boolean);
  return parts.join(" | ");
}
