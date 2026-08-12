/**
 * Delta-brief phase for clear-redesign follow-ups. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { OPENCLAW } from "@/lib/config";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import type { CanonicalModelId } from "@/lib/models/catalog";
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
import {
  isOpenClawPreparedPromptStructured,
  OPENCLAW_PREPARED_PROMPT_SOURCE,
} from "@/lib/openclaw/prepared-prompt";
import { shouldIgnorePersistedScaffoldForMatch } from "@/lib/providers/own-engine/follow-up-clarification";
import { debugLog } from "@/lib/utils/debug";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

export interface ClearRedesignDeltaBriefPhaseResult {
  /** Generated delta-brief (also written back to `parsedMeta.brief`), or null. */
  brief: Record<string, unknown> | null;
  /**
   * `"structured_prompt"` when the delta-brief LLM pass was deliberately
   * skipped because the prompt already carried brief structure. Named after
   * what the server VERIFIED, not after who claimed to have sent it — the
   * request tag is an unauthenticated hint (see `prepared-prompt.ts`), so
   * naming the outcome after it would put a provenance claim in the telemetry
   * that nothing checked. Additive field on the existing
   * `comm.request.followup` timeline event.
   */
  skipReason: "structured_prompt" | null;
}

/**
 * Delta-brief: generate a fresh brief for clear-redesign follow-ups
 * so the Kod-LLM gets structured design context instead of raw text only.
 *
 * Returns the generated delta-brief (also written back to
 * `parsedMeta.brief` — 5-4/F1) or `null` when skipped/failed.
 *
 * Prepared-prompt fast lane (opt-in, `OPENCLAW.editEnabled` as the rollout
 * switch): the pass is skipped when the prompt ALREADY carries brief structure
 * — verified here, server-side, by the deterministic
 * `isOpenClawPreparedPromptStructured` check. The prepared prompt is then the
 * brief/spec input downstream (orchestration keeps the non-style snapshot
 * fallback for continuity — same lane as a failed delta-brief, minus the LLM
 * round).
 *
 * The request's `promptSource` tag only decides whether to LOOK: it is
 * client-controlled and proves nothing (see `prepared-prompt.ts` → trust
 * model). Everything that could be abused is guarded by the two checks the
 * client cannot influence — the structure check, and `followUpIntentMessage
 * === message` (a contract-gate retry classifies a DIFFERENT message than the
 * one the tag was set for, so the tag must not carry over to it).
 *
 * Every other step of the follow-up turn (intent classification, freeze,
 * versioning, credits, verification) is unchanged, and any failed condition
 * falls open to today's LLM path.
 */
export async function runClearRedesignDeltaBriefPhase(params: {
  chatId: string;
  engineChat: ChatWithMessages;
  followUpIntent: FollowUpIntentMode;
  hasFollowUpBase: boolean;
  followUpIntentMessage: string;
  /** The raw message of the CURRENT turn (may differ from
   * `followUpIntentMessage` on contract-gate retries). */
  message: string;
  /** Top-level `promptSource` from the request body, or null. */
  requestPromptSource: string | null;
  metaScaffoldMode: ScaffoldMode;
  metaScaffoldId: string | null;
  metaBuildIntent: string | null;
  metaPromptAssistModel: string | null;
  resolvedModelTier: CanonicalModelId;
  resolvedImageGenerations: boolean;
  req: Request;
  /** Mutated in place: a generated delta-brief is routed into orchestration. */
  parsedMeta: ParsedChatRequestMeta;
}): Promise<ClearRedesignDeltaBriefPhaseResult> {
  const {
    chatId,
    engineChat,
    followUpIntent,
    hasFollowUpBase,
    followUpIntentMessage,
    message,
    requestPromptSource,
    metaScaffoldMode,
    metaScaffoldId,
    metaBuildIntent,
    metaPromptAssistModel,
    resolvedModelTier,
    resolvedImageGenerations,
    req,
    parsedMeta,
  } = params;
  let metaBrief: Record<string, unknown> | null = null;
  if (followUpIntent === "clear-redesign" && hasFollowUpBase) {
    // OpenClaw prepared-prompt fast lane. The tag only counts when the brief
    // target is the message that was actually sent this turn — on a
    // contract-gate retry `followUpIntentMessage` is the ORIGINAL gated
    // request (not what the tag was set for), so that case falls open.
    if (requestPromptSource === OPENCLAW_PREPARED_PROMPT_SOURCE) {
      if (
        OPENCLAW.editEnabled &&
        followUpIntentMessage === message &&
        isOpenClawPreparedPromptStructured(followUpIntentMessage)
      ) {
        // Same outcome owner as the generated/failed logs below — the skip is
        // recorded with its reason instead of a silent no-call.
        debugLog("orchestration", "Delta-brief skipped or failed for clear-redesign follow-up", {
          chatId,
          durationMs: 0,
          reason: "structured_prompt",
          promptLength: followUpIntentMessage.length,
        });
        return { brief: null, skipReason: "structured_prompt" };
      }
      // Edit gate off, indirect message or unstructured prompt → fail open
      // to the normal delta-brief LLM pass below.
    }
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
      modelTier: resolvedModelTier,
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
        reason: "generation_failed",
      });
    }
  }
  return { brief: metaBrief, skipReason: null };
}
