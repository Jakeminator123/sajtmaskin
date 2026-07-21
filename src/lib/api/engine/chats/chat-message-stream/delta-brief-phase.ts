/**
 * Delta-brief phase for clear-redesign follow-ups. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import {
  extractBriefSummaryFromSnapshot,
  formatPriorDesignContext,
} from "@/lib/gen/orchestration-snapshot";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import { shouldIgnorePersistedScaffoldForMatch } from "@/lib/providers/own-engine/follow-up-clarification";
import { debugLog } from "@/lib/utils/debug";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

/**
 * Delta-brief: generate a fresh brief for clear-redesign follow-ups
 * so the Kod-LLM gets structured design context instead of raw text only.
 *
 * Returns the generated delta-brief (also written back to
 * `parsedMeta.brief` — 5-4/F1) or `null` when skipped/failed.
 */
export async function runClearRedesignDeltaBriefPhase(params: {
  chatId: string;
  engineChat: ChatWithMessages;
  followUpIntent: FollowUpIntentMode;
  hasFollowUpBase: boolean;
  followUpIntentMessage: string;
  metaScaffoldMode: ScaffoldMode;
  metaScaffoldId: string | null;
  metaBuildIntent: string | null;
  metaPromptAssistModel: string | null;
  resolvedImageGenerations: boolean;
  req: Request;
  /** Mutated in place: a generated delta-brief is routed into orchestration. */
  parsedMeta: ParsedChatRequestMeta;
}): Promise<Record<string, unknown> | null> {
  const {
    chatId,
    engineChat,
    followUpIntent,
    hasFollowUpBase,
    followUpIntentMessage,
    metaScaffoldMode,
    metaScaffoldId,
    metaBuildIntent,
    metaPromptAssistModel,
    resolvedImageGenerations,
    req,
    parsedMeta,
  } = params;
  let metaBrief: Record<string, unknown> | null = null;
  if (followUpIntent === "clear-redesign" && hasFollowUpBase) {
    const persistedScaffoldIdForDelta = engineChat.scaffold_id;
    const deltaIgnoreScaffold = shouldIgnorePersistedScaffoldForMatch({
      hasPreviousFiles: true,
      followUpIntent,
      message: followUpIntentMessage,
      scaffoldMode: metaScaffoldMode,
      scaffoldId: metaScaffoldId,
    });
    const deltaPreMatchScaffold = persistedScaffoldIdForDelta && !deltaIgnoreScaffold
      ? getScaffoldById(persistedScaffoldIdForDelta)
      : matchScaffold(followUpIntentMessage, (metaBuildIntent as BuildIntent | null));
    // Keyword-only pre-match for delta hint (~1ms). Final embedding-driven
    // pick happens in resolveOrchestrationBase later. See create-chat-stream-post.ts.
    const deltaPreMatchVariant = deltaPreMatchScaffold
      ? pickScaffoldVariant({
          prompt: followUpIntentMessage,
          scaffoldId: deltaPreMatchScaffold.id,
        })
      : null;
    const deltaVariantHints = buildVariantHintsForBrief(
      deltaPreMatchScaffold,
      deltaPreMatchVariant,
    );
    const deltaVariantHintsText = deltaVariantHints
      ? formatVariantHintsForPrompt(deltaVariantHints)
      : undefined;

    const snapshotBriefSummary = extractBriefSummaryFromSnapshot(
      engineChat.orchestration_snapshot as Record<string, unknown> | null,
    );
    const priorContext = snapshotBriefSummary
      ? formatPriorDesignContext(snapshotBriefSummary, { intent: "clear-redesign" })
      : undefined;

    const deltaBriefStartedAt = Date.now();
    const deltaBriefResult = await tryGenerateServerAutoBrief({
      prompt: followUpIntentMessage,
      assistModelHint: metaPromptAssistModel,
      imageGenerations: resolvedImageGenerations,
      signal: req.signal,
      variantHints: deltaVariantHintsText,
      priorDesignContext: priorContext,
    });
    if (deltaBriefResult) {
      metaBrief = deltaBriefResult.brief;
      // 5-4 (F1): route the freshly generated delta-brief into orchestration.
      // Without this write-back the fresh delta was computed and logged,
      // then ignored by orchestration. Neutral follow-ups never reach this
      // branch, so `metaBrief` stays null and they keep using the
      // snapshot fallback; clear-redesign failures now use a non-style
      // fallback in buildFollowUpOrchestrationInput.
      parsedMeta.brief = metaBrief;
      debugLog("orchestration", "Delta-brief generated for clear-redesign follow-up", {
        chatId,
        durationMs: Date.now() - deltaBriefStartedAt,
        modelUsed: deltaBriefResult.modelUsed,
        hasPriorContext: Boolean(priorContext),
      });
    } else {
      debugLog("orchestration", "Delta-brief skipped or failed for clear-redesign follow-up", {
        chatId,
        durationMs: Date.now() - deltaBriefStartedAt,
      });
    }
  }
  return metaBrief;
}
