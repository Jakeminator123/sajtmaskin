/**
 * Backoffice 2.0 fas 6 — small-LLM follow-up intent classifier.
 *
 * Self-contained `generateObject` classifier that maps a follow-up message
 * onto a single {@link FollowUpIntentMode} label. It is ONLY reached when
 * `config/ai_models/manifest.json` `matching.followUpIntent` is explicitly set
 * to `"small-llm"` (see {@link classifyFollowUpIntentWithStrategy}). The caller
 * always wraps this in a try/catch and falls back to the deterministic keyword
 * classifier, so any throw here (missing API key, timeout, schema mismatch,
 * provider error) is fail-safe.
 *
 * Model is manifest-controlled via the `match_classifier` workload
 * (`defaultModel`, a small/cheap model). Tokens are kept minimal and the call
 * is bounded by a short timeout.
 */
import { z } from "zod";
import { generateObject } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import {
  FOLLOW_UP_INTENT_MODES,
  type FollowUpIntentMode,
} from "@/lib/gen/follow-up-intent-types";

const MATCH_CLASSIFIER_WORKLOAD_ID = "match_classifier";
/** Used only if the manifest workload is missing a defaultModel. */
const FALLBACK_MODEL = "openai/gpt-5-mini";
const DEFAULT_TIMEOUT_MS = 4000;
/** Follow-ups are short; cap input so a pasted wall of text stays cheap. */
const MAX_PROMPT_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 2000;

// Mirrors FollowUpIntentMode in src/lib/gen/follow-up-intent-types.ts. The
// runtime guard below cross-checks the parsed label against the canonical set
// so a drift between this enum and the shared type fails safe (throws → caller
// falls back) instead of returning a bogus mode.
const FollowUpIntentLlmSchema = z.object({
  intent: z.enum([
    "clear-refine",
    "clear-redesign",
    "ambiguous-redesign",
    "ambiguous-followup",
    "capability-add",
    "capability-modify",
    "neutral",
  ]),
});

const SYSTEM_PROMPT = [
  "You classify a single follow-up message about an already-generated website into exactly one intent label.",
  "Return only the label, nothing else. Labels:",
  '- "clear-refine": explicit small edit to the current site (change text/color, move an element, swap an image). Keep the current design.',
  '- "clear-redesign": user wants a redesign / rebrand / restyle / start over / a clearly different visual direction.',
  '- "ambiguous-redesign": mentions building a new site but without an explicit redesign verb — unclear if it is a refine or a full redesign.',
  '- "ambiguous-followup": vague request with no concrete target ("make it better", "improve it").',
  '- "capability-add": asks to ADD a feature/section that is a distinct capability (contact form, booking, 3D scene, payments, gallery).',
  '- "capability-modify": references an existing on-page element/feature and asks to change/transform it ("turn the dot into a coffee cup", "ändra den befintliga scenen").',
  '- "neutral": no classifiable signal.',
  "If multiple could apply, pick the most specific one. Prefer capability-modify over capability-add when the user points at something that already exists.",
].join("\n");

export interface LlmClassifyFollowUpIntentOptions {
  timeoutMs?: number;
  /** Override the manifest workload model (mainly for tests/tuning). */
  model?: string;
}

/**
 * Classify a follow-up message via the small-LLM. Throws on any failure so the
 * caller can fall back to the deterministic classifier (fail-safe contract).
 */
export async function llmClassifyFollowUpIntent(
  message: string,
  opts: LlmClassifyFollowUpIntentOptions = {},
): Promise<FollowUpIntentMode> {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return "neutral";

  const modelId =
    opts.model ??
    getWorkloadDefaultModelFromManifest(MATCH_CLASSIFIER_WORKLOAD_ID) ??
    FALLBACK_MODEL;

  // Throws when the required API key is missing → fail-safe fallback.
  const model = createDirectModel(modelId);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const result = await generateObject({
      model,
      schema: FollowUpIntentLlmSchema,
      system: SYSTEM_PROMPT,
      prompt: trimmed.slice(0, MAX_PROMPT_CHARS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Read-only classification; the deterministic fallback already covers
      // failures, so don't burn latency retrying non-transient errors.
      maxRetries: 1,
      abortSignal: controller.signal,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });

    const intent = result.object.intent;
    if (!FOLLOW_UP_INTENT_MODES.has(intent)) {
      throw new Error(`[match_classifier] unexpected intent label: ${intent}`);
    }
    return intent;
  } finally {
    clearTimeout(timeoutId);
  }
}
