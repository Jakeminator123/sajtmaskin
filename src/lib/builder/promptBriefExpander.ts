/**
 * Brief-backed prompt expansion for **initial** site builds.
 *
 * When the user sends a short, dry message but `meta.brief` already carries
 * wizard / deep-brief context, we merge them into one richer user prompt
 * before `prepareGenerationContext` — without replacing Deep Brief (client)
 * or prompt orchestration (length strategy).
 */

import { generateText } from "ai";
import {
  createDirectModel,
  getAnthropicAssistThinkingOptions,
  getOpenAIAssistReasoningOptions,
  getTemperatureConfig,
} from "@/lib/builder/gateway-policy";
import type { PromptStrategy } from "@/lib/builder/promptOrchestration";
import {
  BRIEF_EXPAND_MAX_USER_CHARS,
  BRIEF_EXPAND_MIN_BRIEF_SIGNAL_CHARS,
  MAX_CHAT_MESSAGE_CHARS,
} from "@/lib/builder/promptLimits";
import { POLISH_MODEL } from "@/lib/gen/defaults";
import { debugLog, warnLog } from "@/lib/utils/debug";

const EXPAND_MAX_OUTPUT_TOKENS = 3_200;

const BRIEF_EXPAND_SYSTEM = `Du är en prompt-expander för Sajtmaskins kodgenerator.

Din uppgift: slå ihop användarens korta fria meddelande med den strukturerade briefen (JSON nedan).
Skriv ETT sammanhängande bygginstruktionsblock på svenska som kodgeneratorn kan följa direkt.

Regler:
- Bevara användarens konkreta önskemål och ordalydelse där det är rimligt.
- Fyll i stämning, målgrupp, tonalitet, sidor/sektioner och måste-ha-krav från briefen när användaren varit vag.
- Upprepa INTE hela JSON verbatim; översätt till naturlig beskrivning.
- Lägg inte till nya produktlöften eller varumärken som inte finns i briefen eller användartexten.
- Ingen inledning ("Här är..."), ingen avslutande fråga — bara den utökade byggbeskrivningen.
- Om briefen och användartexten motsäger varandra: prioritera användarens senaste korta text och notera konflikten kort i samma block.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Recursive sum of string lengths inside brief JSON (bounded depth).
 */
export function measureBriefSignalStrength(
  value: unknown,
  depth = 0,
  maxDepth = 6,
): number {
  if (depth > maxDepth) return 0;
  if (typeof value === "string") return value.trim().length;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (acc, v) => acc + measureBriefSignalStrength(v, depth + 1, maxDepth),
      0,
    );
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (acc, v) => acc + measureBriefSignalStrength(v, depth + 1, maxDepth),
      0,
    );
  }
  return 0;
}

export function briefQualifiesForExpansion(brief: Record<string, unknown> | null): boolean {
  if (!brief || Object.keys(brief).length === 0) return false;
  return measureBriefSignalStrength(brief) >= BRIEF_EXPAND_MIN_BRIEF_SIGNAL_CHARS;
}

export function shouldAttemptBriefExpansion(params: {
  message: string;
  brief: Record<string, unknown> | null;
  strategy: PromptStrategy;
  promptSourcePreservePayload?: boolean;
  /** True = first build in this chat / new site turn (no prior generated files). */
  initialBuildTurn: boolean;
  meta?: Record<string, unknown> | null;
}): boolean {
  const {
    message,
    brief,
    strategy,
    promptSourcePreservePayload,
    initialBuildTurn,
    meta,
  } = params;

  if (!initialBuildTurn) return false;
  if (strategy !== "direct") return false;
  if (promptSourcePreservePayload) return false;

  if (meta && meta.promptBriefExpand === false) return false;
  if (meta && meta.promptAssistDeep === true) return false;

  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length > BRIEF_EXPAND_MAX_USER_CHARS) return false;

  return briefQualifiesForExpansion(brief);
}

export type MaybeExpandBriefParams = {
  message: string;
  brief: Record<string, unknown> | null;
  strategy: PromptStrategy;
  promptSourcePreservePayload?: boolean;
  initialBuildTurn: boolean;
  buildIntent?: string | null;
  abortSignal?: AbortSignal;
  meta?: Record<string, unknown> | null;
};

/**
 * Returns an enriched message when expansion runs; otherwise the original message.
 * Failures are non-fatal — callers always get a usable string back.
 */
export async function maybeExpandShortPromptWithBrief(
  params: MaybeExpandBriefParams,
): Promise<{ message: string; wasExpanded: boolean }> {
  const { message, brief, strategy, buildIntent, abortSignal, meta } = params;

  if (
    !shouldAttemptBriefExpansion({
      message,
      brief,
      strategy,
      promptSourcePreservePayload: params.promptSourcePreservePayload,
      initialBuildTurn: params.initialBuildTurn,
      meta: meta ?? null,
    })
  ) {
    return { message, wasExpanded: false };
  }

  const briefJson = JSON.stringify(brief, null, 2);
  const userPayload = [
    buildIntent ? `Byggintent (metadata): ${buildIntent}` : null,
    "## Användarens korta meddelande",
    message.trim(),
    "",
    "## Brief (JSON)",
    briefJson,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const model = createDirectModel(POLISH_MODEL);
    const reasoning = POLISH_MODEL.startsWith("anthropic/")
      ? getAnthropicAssistThinkingOptions()
      : getOpenAIAssistReasoningOptions(POLISH_MODEL);

    const result = await generateText({
      model,
      system: BRIEF_EXPAND_SYSTEM,
      prompt: userPayload,
      maxOutputTokens: EXPAND_MAX_OUTPUT_TOKENS,
      abortSignal,
      maxRetries: 1,
      ...getTemperatureConfig(POLISH_MODEL, 0.2),
      ...reasoning,
    });

    const expanded = result.text?.trim() ?? "";
    if (!expanded || expanded.length < message.trim().length) {
      warnLog("prompt", "Brief expand produced empty or shorter text; keeping original", {
        originalLen: message.trim().length,
        expandedLen: expanded.length,
      });
      return { message, wasExpanded: false };
    }

    const capped =
      expanded.length > MAX_CHAT_MESSAGE_CHARS
        ? expanded.slice(0, MAX_CHAT_MESSAGE_CHARS)
        : expanded;

    debugLog("prompt", "Brief expand applied", {
      originalLen: message.trim().length,
      expandedLen: capped.length,
      model: POLISH_MODEL,
    });

    return { message: capped, wasExpanded: true };
  } catch (error) {
    warnLog("prompt", "Brief expand failed (non-fatal)", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { message, wasExpanded: false };
  }
}
