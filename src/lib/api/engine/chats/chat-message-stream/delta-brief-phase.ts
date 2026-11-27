/**
 * Delta-brief phase for clear-redesign follow-ups. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import { resolveBuildIntentForMethod } from "@/lib/builder/build-intent";
import { siteBriefSchema, tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { OPENCLAW } from "@/lib/config";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import type { CanonicalModelId } from "@/lib/models/catalog";
import {
  buildFollowUpContract,
  extractBriefSummaryFromSnapshot,
  formatPriorDesignContext,
} from "@/lib/gen/orchestration-snapshot";
import {
  enforceFollowUpScaffoldFreeze,
  resolveFollowUpFrozenBuildIntent,
} from "@/lib/gen/orchestrate/follow-up-freeze";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { matchScaffold, scaffoldForExplicitIntent } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { SCAFFOLD_OFF_BASELINE_ID, type ScaffoldMode } from "@/lib/gen/scaffolds/types";
import {
  OPENCLAW_PREPARED_PROMPT_SOURCE,
} from "@/lib/openclaw/prepared-prompt";
import { shouldIgnorePersistedScaffoldForMatch } from "@/lib/providers/own-engine/follow-up-clarification";
import { debugLog } from "@/lib/utils/debug";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

export interface ClearRedesignDeltaBriefPhaseResult {
  /** Generated or validated current-message brief, also written to `parsedMeta.brief`. */
  brief: Record<string, unknown> | null;
  /**
   * `"structured_prompt"` when the delta-brief LLM pass was deliberately
   * skipped because the current prompt carried a schema-valid JSON brief. Named after
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
 * switch): a schema-valid JSON brief embedded in the current prompt is reused
 * and written to parsedMeta.brief. Markdown headings and lists still take the
 * normal delta-brief path so styles, pages and capabilities reach their typed
 * orchestration owners.
 *
 * The request's `promptSource` tag only decides whether to LOOK: it is
 * client-controlled and proves nothing (see `prepared-prompt.ts` → trust
 * model). The brief must pass the canonical schema and belong to the exact
 * message being classified. Contract-gate retries with another message take
 * the normal delta-brief path.
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
  /**
   * True when the chat started from a verbatim repo import (v0-template /
   * ZIP / GitHub — `edit_kind="imported_repo"` in the version history). The
   * delta-brief itself still runs on clear-redesign (an explicit rebuild
   * signal), but the scaffold/variant pre-match is SKIPPED: an imported repo
   * has no scaffold (`scaffold_id` null), so the keyword `matchScaffold`
   * fallback would seed the brief with a Sajtmaskin scaffold's variant hints
   * — the wrong stack for a repo that owns its own structure and versions.
   */
  importedRepoMode: boolean;
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
    importedRepoMode,
    requestPromptSource,
    metaScaffoldMode,
    metaScaffoldId,
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
        followUpIntentMessage === message
      ) {
        const preparedBrief = parsePreparedSiteBrief(followUpIntentMessage);
        if (preparedBrief) {
          parsedMeta.brief = preparedBrief;
          debugLog("orchestration", "Delta-brief reused for clear-redesign follow-up", {
            chatId,
            durationMs: 0,
            reason: "structured_prompt",
            promptLength: followUpIntentMessage.length,
          });
          return { brief: preparedBrief, skipReason: "structured_prompt" };
        }
      }
      // Edit gate off, indirect message or unstructured prompt → fail open
      // to the normal delta-brief LLM pass below.
    }
    // Imported repos never get scaffold/variant hints in the delta-brief:
    // the repo IS the project (scaffoldMode is forced "off" downstream), and
    // the keyword `matchScaffold` fallback below would otherwise inject a
    // Sajtmaskin scaffold's stack hints into a brief for a repo with its own
    // structure and package versions.
    const persistedScaffoldIdForDelta = importedRepoMode ? null : engineChat.scaffold_id;
    const deltaIgnoreScaffold = shouldIgnorePersistedScaffoldForMatch({
      hasPreviousFiles: true,
      followUpIntent,
      message: followUpIntentMessage,
      scaffoldMode: metaScaffoldMode,
      scaffoldId: metaScaffoldId,
    });
    const buildIntent = parsedMeta.buildIntent;
    const deltaContract = buildFollowUpContract({
      snapshot: engineChat.orchestration_snapshot as Record<string, unknown> | null,
      persistedScaffoldId: persistedScaffoldIdForDelta,
    });
    const deltaPreMatchScaffoldRaw = importedRepoMode
      ? null
      : metaScaffoldMode === "manual" && metaScaffoldId
        ? getScaffoldById(metaScaffoldId)
        : persistedScaffoldIdForDelta && !deltaIgnoreScaffold
          ? getScaffoldById(persistedScaffoldIdForDelta)
          : metaScaffoldMode === "off"
            ? buildIntent === "template" ? null : getScaffoldById(SCAFFOLD_OFF_BASELINE_ID)
            : matchScaffold(followUpIntentMessage, buildIntent);
    const methodFixesIntent =
      resolveBuildIntentForMethod(parsedMeta.buildMethod, "website") ===
      resolveBuildIntentForMethod(parsedMeta.buildMethod, "app");
    const deltaFreeze = enforceFollowUpScaffoldFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: deltaIgnoreScaffold,
      contractScaffoldId: importedRepoMode ? null : deltaContract.scaffoldId,
      resolvedScaffoldId: deltaPreMatchScaffoldRaw?.id ?? null,
    });
    const frozenScaffold = deltaFreeze.clamped && deltaFreeze.scaffoldId
      ? getScaffoldById(deltaFreeze.scaffoldId) ?? deltaPreMatchScaffoldRaw
      : deltaPreMatchScaffoldRaw;
    const frozenBuildIntent = resolveFollowUpFrozenBuildIntent({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: deltaIgnoreScaffold,
      contractScaffoldId: importedRepoMode ? null : deltaContract.scaffoldId,
      resolvedScaffoldId: frozenScaffold?.id ?? null,
      contractBuildIntent: deltaContract.buildIntent,
      allowedBuildIntents: frozenScaffold?.allowedBuildIntents ?? [],
    });
    const deltaPreMatchScaffold =
      frozenBuildIntent || parsedMeta.buildIntentExplicit || methodFixesIntent || metaScaffoldMode === "manual"
        ? scaffoldForExplicitIntent(frozenScaffold, frozenBuildIntent ?? buildIntent)
        : frozenScaffold;
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

/** Parse current-message decisions, without treating stale meta/snapshot as a fresh brief. */
function parsePreparedSiteBrief(message: string): Record<string, unknown> | null {
  const trimmed = message.trim();
  let json = trimmed;
  if (!json.startsWith("{")) {
    const blocks = Array.from(trimmed.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gim));
    if (blocks.length !== 1) return null;
    json = blocks[0][1];
  }
  try {
    const parsed = siteBriefSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
