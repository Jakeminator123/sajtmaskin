/**
 * F3-continuation phases of the follow-up stream handler. Extracted verbatim
 * from `chat-message-stream-post.ts` — Phase A (provisional stage
 * inheritance), the calm reject close-out, Phase B (atomic marker consume at
 * the persistence boundary) and the approval build-round preparation.
 */
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { resolveCapabilitiesPresentInVersion } from "@/lib/gen/dossiers/version-presence";
import { readF3ApprovedFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import type { CodeFile } from "@/lib/gen/parser";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "@/lib/gen/prompt-wrapper-contract";
import {
  classifyF3ContinuationReply,
  F3_APPROVAL_NOTHING_TO_BUILD_MESSAGE,
  F3_APPROVAL_NOTHING_TO_BUILD_REASON,
  F3_REJECT_ACK_MESSAGE,
  F3_REJECT_RACE_LOST_MESSAGE,
  resolvePendingF3Continuation,
} from "@/lib/gen/stream/f3-continuation";
import { resolveChatPreferredVersionId } from "@/lib/gen/version-manager";
import {
  approvedProvidersShipConfigNotice,
  mapProviderKeysToDossierCapabilities,
} from "@/lib/integrations/tier3-build-spec";
import { devLogAppend } from "@/lib/logging/devLog";
import { wrapStreamForPromptToDoneMetric } from "@/lib/observability/prompt-to-done-stream";
import { createSSEHeaders } from "@/lib/streaming";
import { debugLog } from "@/lib/utils/debug";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import { buildF3RejectAckStream } from "./f3-ack-stream";

export interface F3ContinuationDecision {
  replyIntent: ReturnType<typeof classifyF3ContinuationReply>;
  markerMessageId: string | null;
  markerParentVersionId: string | null;
  /** Providers signaled in the tool-only round (marker payload). */
  markerSuggestedProviders: string[];
  /** Loop-breaker counter carried by the consumed marker. */
  markerToolOnlyRounds: number;
}

/**
 * P1 F3-entry (BUG-SWARM-BACKLOG "F3-flödet körde v8 i F2-lane"):
 * server-side lifecycle-stage inheritance. The F3 stage is only carried
 * by the auto-kicked "Bygg integrationer" message; when that stream
 * parks in awaiting-input (tool-only, `tool_only_empty_generation`),
 * the user's reply arrives as a plain follow-up without
 * `meta.lifecycleStage` and used to default to design/F2 — so the
 * actual SDK codegen ran with `previewPolicy: fidelity2` and the F2
 * guards stripped the integration imports (prod chat cc10e7de v8).
 * Derivation is server-authoritative: the generation stream persisted
 * an assistant F3-continuation marker (`f3-continuation.ts`).
 * Conservative exclusions: explicit client overrides win unchanged,
 * plan-mode stays F2, and technical passes (autofix/preserve-payload)
 * are not user replies.
 *
 * PHASE A (here, before the M#818-2 gate): classify the reply and set
 * the stage PROVISIONALLY for an approving reply so the env-readiness
 * gate + credit gate run against the real F3 intent. Only an
 * APPROVING reply inherits (`classifyF3ContinuationReply` — Bugbot
 * HIGH r2: quick-reply exact match or conservative approval free
 * text; fail-safe = F2). Codex P2 r3: the inherited lineage is
 * resolved with the SAME resolution as the file base and the gate
 * (chat-scoped `engineBaseVersionId`, else preferred) — never the raw
 * marker parent, so `parent_version_id` can't point at a version that
 * was never the build base.
 *
 * PHASE B (at the persistence boundary, right before the user message
 * is persisted): the atomic marker consume. Codex P1 r3: consuming
 * here — AFTER the 412/409 readiness gate, the clarification gate and
 * the credit gate — means an aborted request leaves the marker
 * pending, so the same approval still inherits F3 once the user has
 * fixed env/credits. The conditional jsonb write stays the race
 * arbiter: an unconfirmed consume downgrades the provisional stage
 * back to design before anything is persisted or generated.
 */
export async function resolveF3ContinuationPhaseA(params: {
  chatId: string;
  message: string;
  engineChat: ChatWithMessages;
  /** Mutated in place: an approving reply provisionally inherits the F3 stage. */
  parsedMeta: ParsedChatRequestMeta;
  metaPlanMode: boolean;
  metaPromptSourceKind: string | null;
  metaPromptSourcePreservePayload: boolean;
  metaPromptSourceTechnical: boolean;
  metaEngineBaseVersionId: string | null;
}): Promise<F3ContinuationDecision | null> {
  const {
    chatId,
    message,
    engineChat,
    parsedMeta,
    metaPlanMode,
    metaPromptSourceKind,
    metaPromptSourcePreservePayload,
    metaPromptSourceTechnical,
    metaEngineBaseVersionId,
  } = params;
  let f3ContinuationDecision: F3ContinuationDecision | null = null;
  if (
    parsedMeta.lifecycleStage !== "integrations" &&
    !metaPlanMode &&
    metaPromptSourceKind !== "autofix" &&
    !metaPromptSourcePreservePayload &&
    !metaPromptSourceTechnical
  ) {
    const pendingF3Continuation = resolvePendingF3Continuation(
      engineChat.messages,
    );
    if (pendingF3Continuation) {
      const f3ReplyIntent = classifyF3ContinuationReply(message);
      f3ContinuationDecision = {
        replyIntent: f3ReplyIntent,
        markerMessageId: pendingF3Continuation.messageId,
        markerParentVersionId: pendingF3Continuation.parentVersionId,
        markerSuggestedProviders: pendingF3Continuation.suggestedProviders,
        markerToolOnlyRounds: pendingF3Continuation.toolOnlyRounds,
      };
      if (f3ReplyIntent === "approve") {
        // Same resolution as `resolveFollowUpPreviousFiles` and the
        // readiness gate: chat-scoped explicit base, else preferred.
        let inheritedBaseId: string | null = null;
        if (metaEngineBaseVersionId) {
          try {
            const baseVersion = await chatRepo.getVersionById(metaEngineBaseVersionId);
            inheritedBaseId =
              baseVersion && baseVersion.chat_id === engineChat.id
                ? baseVersion.id
                : null;
          } catch {
            inheritedBaseId = null;
          }
        }
        if (!inheritedBaseId) {
          try {
            inheritedBaseId = await resolveChatPreferredVersionId(engineChat.id);
          } catch {
            inheritedBaseId = null;
          }
        }
        if (
          inheritedBaseId &&
          pendingF3Continuation.parentVersionId &&
          inheritedBaseId !== pendingF3Continuation.parentVersionId
        ) {
          devLogAppend("in-progress", {
            type: "f3.lineage_drift",
            chatId,
            markerParentVersionId: pendingF3Continuation.parentVersionId,
            resolvedBaseVersionId: inheritedBaseId,
          });
        }
        parsedMeta.lifecycleStage = "integrations";
        parsedMeta.parentVersionId = inheritedBaseId;
        debugLog(
          "orchestration",
          "F3 lifecycle stage provisionally inherited (pending marker consume)",
          {
            chatId,
            parentVersionId: parsedMeta.parentVersionId,
            markerParentVersionId: pendingF3Continuation.parentVersionId,
            engineBaseVersionId: metaEngineBaseVersionId,
          },
        );
      } else {
        devLogAppend("in-progress", {
          type: "f3.stage_not_inherited",
          chatId,
          replyIntent: f3ReplyIntent,
          reason: "reply_not_approving",
        });
      }
    }
  }
  return f3ContinuationDecision;
}

/**
 * P2 F3-loop (åtgärd 4): a REJECT-classified reply to the pending F3
 * question ends F3 calmly WITHOUT any generation. The observed prod
 * flow ran the reject as a normal F2 follow-up, which produced a
 * fully silent generation ("Model produced no text events",
 * `toolCalls: []`) and then re-asked the same question. Instead:
 * persist the reply, consume the marker (so a racing approve cannot
 * resurrect it — same #382 arbiter semantics), confirm briefly in
 * the chat and return the user to design mode. No credits are
 * prepared/charged and no LLM call runs on this path. "Annat"/
 * unrelated replies keep the existing behavior (consume + run F2).
 *
 * Returns the close-out Response for a reject reply, `null` otherwise.
 */
export async function handleF3RejectClose(params: {
  f3ContinuationDecision: F3ContinuationDecision | null;
  engineChat: ChatWithMessages;
  chatId: string;
  message: string;
  promptStartedAt: number;
  req: Request;
  attachSessionCookie: (response: Response) => Response;
}): Promise<Response | null> {
  const {
    f3ContinuationDecision,
    engineChat,
    chatId,
    message,
    promptStartedAt,
    req,
    attachSessionCookie,
  } = params;
  if (f3ContinuationDecision?.replyIntent === "reject") {
    // Codex P2 (PR #383): the ack REQUIRES a confirmed marker consume.
    // In a rapid double-submit an approval request may win the atomic
    // arbiter first — acknowledging "avvisades" while that approval
    // continues building integrations would make the chat lie. On an
    // unconfirmed consume the reject still closes calmly (the persisted
    // user reply clears the pending walk, so no new F3 inheritance),
    // but with neutral copy instead of a false "avvisades" claim.
    let rejectConsumeConfirmed = false;
    await chatRepo.addMessage(engineChat.id, "user", message);
    if (f3ContinuationDecision.markerMessageId) {
      try {
        rejectConsumeConfirmed = await chatRepo.consumeF3ContinuationMarker(
          engineChat.id,
          f3ContinuationDecision.markerMessageId,
        );
      } catch (consumeErr) {
        debugLog("orchestration", "F3 reject marker consume failed", {
          chatId,
          error:
            consumeErr instanceof Error ? consumeErr.message : String(consumeErr),
        });
      }
    }
    const rejectAckText = rejectConsumeConfirmed
      ? F3_REJECT_ACK_MESSAGE
      : F3_REJECT_RACE_LOST_MESSAGE;
    await chatRepo
      .addMessage(engineChat.id, "assistant", rejectAckText)
      .catch(() => null);
    devLogAppend("in-progress", {
      type: "f3.rejected_calm_close",
      chatId,
      markerMessageId: f3ContinuationDecision.markerMessageId,
      consumeConfirmed: rejectConsumeConfirmed,
    });
    return attachSessionCookie(
      new Response(
        wrapStreamForPromptToDoneMetric(
          buildF3RejectAckStream({ chatId, text: rejectAckText }),
          {
            kind: "followup",
            promptStartedAt,
            signal: req.signal,
            chatId,
          },
        ),
        { headers: createSSEHeaders() },
      ),
    );
  }
  return null;
}

/**
 * PHASE B — atomic F3-marker consume at the persistence boundary
 * (Codex P1 r3). Runs AFTER every blocking pre-check (stale-base 409,
 * f3_base_mismatch 409, M#818-2 readiness 412/409, follow-up
 * clarification return, credit gate) and AFTER the user reply was
 * persisted above. An abort in any of those gates therefore leaves
 * the marker pending — the same approval inherits F3 again once the
 * user has fixed env/credits. Consuming after the persist also
 * removes the "consumed but nothing persisted" window entirely: once
 * the reply row exists, the history walk clears pending regardless,
 * so this conditional write's ONLY remaining job is the concurrent
 * race arbiter. Every direct reply consumes (approve to claim the
 * continuation, reject/unrelated so a racing approve cannot resurrect
 * it); an approve whose consume is not CONFIRMED (lost race, write
 * error) downgrades the provisional stage back to design before
 * anything is persisted or generated.
 *
 * P2 F3-loop: returns true when this generation is a CONFIRMED approval
 * continuation ("Godkänn förslag" that claimed the marker). Drives
 * (a) the forced-codegen build directive below, (b) pulling the
 * integration-signal tools out of the tool set for this round, and
 * (c) the dossier-capability injection + loop-breaker counter.
 */
export async function consumeF3MarkerPhaseB(params: {
  f3ContinuationDecision: F3ContinuationDecision | null;
  engineChat: ChatWithMessages;
  chatId: string;
  /** Mutated in place: an unconfirmed approve consume downgrades to design. */
  parsedMeta: ParsedChatRequestMeta;
}): Promise<boolean> {
  const { f3ContinuationDecision, engineChat, chatId, parsedMeta } = params;
  let f3ApprovalBuildRound = false;
  if (f3ContinuationDecision) {
    let markerConsumeConfirmed = false;
    if (f3ContinuationDecision.markerMessageId) {
      try {
        markerConsumeConfirmed = await chatRepo.consumeF3ContinuationMarker(
          engineChat.id,
          f3ContinuationDecision.markerMessageId,
        );
      } catch (consumeErr) {
        debugLog("orchestration", "F3 marker consume failed — staying in F2", {
          chatId,
          error:
            consumeErr instanceof Error
              ? consumeErr.message
              : String(consumeErr),
        });
      }
    }
    if (f3ContinuationDecision.replyIntent === "approve") {
      if (markerConsumeConfirmed) {
        f3ApprovalBuildRound = true;
        devLogAppend("in-progress", {
          type: "f3.stage_inherited",
          chatId,
          replyIntent: f3ContinuationDecision.replyIntent,
          parentVersionId: parsedMeta.parentVersionId,
        });
      } else {
        parsedMeta.lifecycleStage = "design";
        parsedMeta.parentVersionId = null;
        devLogAppend("in-progress", {
          type: "f3.stage_not_inherited",
          chatId,
          replyIntent: f3ContinuationDecision.replyIntent,
          markerConsumeConfirmed,
          reason: "marker_consume_unconfirmed",
        });
      }
    }
  }
  return f3ApprovalBuildRound;
}

/**
 * P2 F3-loop (åtgärd 1): the approval round must BUILD, not
 * re-propose. Map the approved providers to dossier capabilities
 * (stripe → payments etc. via integrationRegistry + dossier
 * matching) so `selectDossiersForRequest` injects the hard-dossier
 * verbatim templates — the same mechanic the init path uses — and
 * inject an explicit end-to-end build directive with the #374
 * graceful not-configured contract (real keys must NOT be assumed;
 * placeholder env values may remain until the owner fills them in).
 *
 * Returns the honest close-out Response when the approval has nothing to
 * build, otherwise the (possibly rewrapped) `optimizedMessage` plus the
 * approved capability/provider sets for the build round.
 */
export async function prepareF3ApprovalBuildRound(params: {
  f3ApprovalBuildRound: boolean;
  f3ContinuationDecision: F3ContinuationDecision | null;
  engineChat: ChatWithMessages;
  chatId: string;
  previousFiles: CodeFile[];
  optimizedMessage: string;
  promptStartedAt: number;
  req: Request;
  attachSessionCookie: (response: Response) => Response;
}): Promise<
  | Response
  | {
      optimizedMessage: string;
      f3ApprovedDossierCapabilities: string[];
      f3EffectiveApprovedProviders: string[];
    }
> {
  const {
    f3ApprovalBuildRound,
    f3ContinuationDecision,
    engineChat,
    chatId,
    previousFiles,
    promptStartedAt,
    req,
    attachSessionCookie,
  } = params;
  let optimizedMessage = params.optimizedMessage;
  let f3ApprovedDossierCapabilities: string[] = [];
  let f3EffectiveApprovedProviders: string[] = [];
  if (f3ApprovalBuildRound && f3ContinuationDecision) {
    // Durable approval (review round 2, fix 5a): a tool-less/silent
    // marker can carry ZERO providers ("Godkänn förslag" would inject
    // nothing). Fall back to the approvals an EARLIER approval round
    // persisted on the snapshot so a retry keeps its provider→dossier
    // mapping across rounds and page refreshes.
    const persistedApproved = readF3ApprovedFromSnapshot(
      engineChat.orchestration_snapshot as Record<string, unknown> | null,
    );
    const markerProviders = f3ContinuationDecision.markerSuggestedProviders;
    f3EffectiveApprovedProviders =
      markerProviders.length > 0 ? markerProviders : persistedApproved.providers;
    try {
      f3ApprovedDossierCapabilities = mapProviderKeysToDossierCapabilities(
        f3EffectiveApprovedProviders,
      );
    } catch (mapErr) {
      debugLog("orchestration", "F3 provider→capability mapping failed", {
        chatId,
        error: mapErr instanceof Error ? mapErr.message : String(mapErr),
      });
      f3ApprovedDossierCapabilities = [];
    }
    // Once approved, always approved: earlier persisted capability
    // approvals stay in the set even when this marker names fewer.
    f3ApprovedDossierCapabilities = Array.from(
      new Set([...f3ApprovedDossierCapabilities, ...persistedApproved.capabilities]),
    );

    // Fix 5b: an approval with ZERO approvable capabilities — nothing
    // signaled, nothing persisted from earlier rounds, and no
    // integration file evidence in the base version — would run a
    // doomed silent round (the F3 scope selects nothing) and re-park
    // the user in the same dialog. Close F3 honestly instead: the
    // marker is already consumed, no generation runs, and the copy
    // names a concrete next step.
    if (
      f3EffectiveApprovedProviders.length === 0 &&
      f3ApprovedDossierCapabilities.length === 0 &&
      resolveCapabilitiesPresentInVersion(
        previousFiles.map((file) => file.path),
      ).length === 0
    ) {
      await chatRepo
        .addMessage(engineChat.id, "assistant", F3_APPROVAL_NOTHING_TO_BUILD_MESSAGE)
        .catch(() => null);
      devLogAppend("in-progress", {
        type: "f3.approval_nothing_to_build",
        chatId,
        markerMessageId: f3ContinuationDecision.markerMessageId,
        priorToolOnlyRounds: f3ContinuationDecision.markerToolOnlyRounds,
      });
      return attachSessionCookie(
        new Response(
          wrapStreamForPromptToDoneMetric(
            buildF3RejectAckStream({
              chatId,
              text: F3_APPROVAL_NOTHING_TO_BUILD_MESSAGE,
              reason: F3_APPROVAL_NOTHING_TO_BUILD_REASON,
            }),
            {
              kind: "followup",
              promptStartedAt,
              signal: req.signal,
              chatId,
            },
          ),
          { headers: createSSEHeaders() },
        ),
      );
    }

    // Persist the durable approval record (best-effort — a write failure
    // only means the NEXT round falls back to marker/file evidence).
    await chatRepo
      .appendF3ApprovedToSnapshot(
        engineChat.id,
        f3ApprovedDossierCapabilities,
        f3EffectiveApprovedProviders,
      )
      .catch(() => null);

    devLogAppend("in-progress", {
      type: "f3.approval_build_round",
      chatId,
      approvedProviders: f3EffectiveApprovedProviders,
      dossierCapabilities: f3ApprovedDossierCapabilities,
      priorToolOnlyRounds: f3ContinuationDecision.markerToolOnlyRounds,
    });
    // Codex P2 (PR #383): only reference "the dossier's config-notice
    // UI" when an injected dossier actually ships the component —
    // otherwise the model imports a file that is never emitted.
    const configNoticeShipped =
      approvedProvidersShipConfigNotice(f3EffectiveApprovedProviders);
    const fallbackInstruction = configNoticeShipped
      ? "Do NOT assume real API keys are configured. Placeholder env values may remain until the site owner fills them in — implement the graceful not-configured fallback: initialize SDK clients lazily after an env guard (never at module scope), return a calm 503 with a `*-not-configured` error code from the API route, and render the dossier's config-notice UI (the `*config-notice.tsx` component included in the provided dossier files, e.g. `components/integration-config-notice.tsx` or `components/db-config-notice.tsx`) with a disabled CTA instead of a raw error."
      : "Do NOT assume real API keys are configured. Placeholder env values may remain until the site owner fills them in — implement the graceful not-configured fallback: initialize SDK clients lazily after an env guard (never at module scope), return a calm 503 with a `*-not-configured` error code from the API route, and show a calm inline notice (plain markup you write yourself) with a disabled CTA instead of a raw error. Do NOT import any config-notice component — none is provided.";
    optimizedMessage = [
      wrapWithSection({
        heading: "## F3 Integration Build Approval",
        introLines: [
          "The user has APPROVED the integration proposal. The proposal phase is OVER.",
          f3EffectiveApprovedProviders.length > 0
            ? `Approved integration providers: ${f3EffectiveApprovedProviders.join(", ")}.`
            : "The approved proposal is described in the chat history above.",
          "Build the approved integration(s) end-to-end NOW, in this response: the user-facing UI entry points (e.g. purchase/checkout CTA on the site), the complete server API route(s), and the wiring between them. Output code files.",
          "Do NOT suggest integrations again. Do NOT ask for another confirmation. A response without code files is a failure.",
          fallbackInstruction,
          "Placeholder values in `.env.local` / `env.example` (e.g. values containing \"placeholder\") are F2 boot stubs — they are NOT evidence that an integration is configured or already built.",
        ],
      }),
      "",
      PROMPT_WRAPPER_HEADINGS.userReply,
      "",
      optimizedMessage,
    ].join("\n");
  }
  return { optimizedMessage, f3ApprovedDossierCapabilities, f3EffectiveApprovedProviders };
}
