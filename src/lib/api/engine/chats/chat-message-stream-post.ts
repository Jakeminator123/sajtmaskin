import { generateText } from "ai";
import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import {
  withPromptToDoneMetricResponse,
  wrapStreamForPromptToDoneMetric,
} from "@/lib/observability/prompt-to-done-stream";
import { withRateLimit } from "@/lib/rateLimit";
import { getAppProjectByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend, devLogStartGeneration } from "@/lib/logging/devLog";
import { readRunStatusForChat } from "@/lib/logging/run-status-reader";
import { debugLog } from "@/lib/utils/debug";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { buildEngineStreamResponse, buildStreamErrorResponse } from "./stream-error-response";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract/clarification";
import { collectConfirmedContractAnswers } from "@/lib/gen/contract/answer-context";
import {
  detectFollowUpCapabilities,
  type FollowUpCapabilityDetection,
} from "@/lib/builder/follow-up-capability-detection";
import { isShellPageContent } from "@/lib/gen/build-spec";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import { buildFollowUpOrchestrationInput } from "./follow-up-orchestration-input";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
import { classifyRequestKind } from "@/lib/gen/request-kind";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan/review";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import {
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import { parseChatRequestMeta } from "./parse-chat-request-meta";
import { createCommitCreditsOnce } from "./credits-handler";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import {
  resolveChatPreferredVersionId,
  resolveFollowUpPreviousFiles,
} from "@/lib/gen/version-manager";
import { deriveFollowUpStateFromInputs } from "@/lib/gen/follow-up-predicate";
import { extractAppRoutePathsFromFilePaths } from "@/lib/gen/route-plan";
import {
  buildOwnEngineGenerationStreamMeta,
  buildPreGenerationContractGateParams,
} from "@/lib/own-engine/session/own-engine-build-session";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";
import {
  computePlanModePlannerPrompts,
  createPlanModePipelineStream,
  dumpPlanModePlannerPrompts,
  logPlanModeGenerationStart,
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import {
  buildAwaitingClarificationStream,
  persistFollowUpClarification,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "@/lib/providers/own-engine/follow-up-clarification";
import { classifyFollowUpIntentWithStrategy } from "@/lib/providers/own-engine/follow-up-intent-router";
import { buildFollowUpFileContextDecision } from "./follow-up-file-context";
import { buildBoundedChatHistory } from "./follow-up-history";
import {
  extractBriefSummaryFromSnapshot,
  formatPriorDesignContext,
  prependOrchestrationContinuityToFollowUp,
} from "@/lib/gen/orchestration-snapshot";
import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "@/lib/gen/prompt-wrapper-contract";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";
import { createDirectModel } from "@/lib/builder/direct-model";
import { resolveSelectedDossiersFromSnapshot } from "@/lib/gen/dossiers/snapshot-selection";
import { checkTier3ReadinessForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  approvedProvidersShipConfigNotice,
  mapProviderKeysToDossierCapabilities,
} from "@/lib/integrations/tier3-build-spec";
import {
  classifyF3ContinuationReply,
  F3_REJECT_ACK_MESSAGE,
  F3_REJECT_ACK_REASON,
  F3_REJECT_RACE_LOST_MESSAGE,
  resolvePendingF3Continuation,
} from "@/lib/gen/stream/f3-continuation";

// ── Follow-up history management ──────────────────────────────────────────

const QA_SHORTCIRCUIT_MODEL = canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);

async function generateQaShortCircuitText(params: {
  optimizedMessage: string;
  signal: AbortSignal;
}): Promise<string> {
  const result = await generateText({
    model: createDirectModel(QA_SHORTCIRCUIT_MODEL),
    abortSignal: params.signal,
    prompt:
      "Användaren har ställt en fråga om sin sajt. Svara koncist (max 4 meningar) baserat på följande kontext:\n\n" +
      params.optimizedMessage,
  });
  return result.text.trim();
}

function buildQaShortCircuitStream(params: {
  chatId: string;
  text: string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(formatSSEEvent("chatId", { id: params.chatId })));
      controller.enqueue(encoder.encode(formatSSEEvent("content", { text: params.text })));
      controller.enqueue(
        encoder.encode(formatSSEEvent("done", { chatId: params.chatId, versionId: null })),
      );
      controller.close();
    },
  });
}

/**
 * Calm F3 reject close-out (P2 F3-loop, åtgärd 4): short confirmation +
 * `done` with a dedicated reason so the client renders a normal assistant
 * message instead of the "generation ended without version" failure path.
 * No own-engine generation runs — the observed reject flow produced a
 * fully silent generation (`toolCalls: []`, no text) and then re-asked
 * the same question.
 */
function buildF3RejectAckStream(params: {
  chatId: string;
  text: string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(formatSSEEvent("chatId", { id: params.chatId })));
      controller.enqueue(encoder.encode(formatSSEEvent("content", { text: params.text })));
      controller.enqueue(
        encoder.encode(
          formatSSEEvent("done", {
            chatId: params.chatId,
            versionId: null,
            messageId: null,
            ...previewUrlField(null),
            awaitingInput: false,
            reason: F3_REJECT_ACK_REASON,
          }),
        ),
      );
      controller.close();
    },
  });
}


/** Follow-up chat stream (own-engine). Route files set `runtime` / `maxDuration`. */

export async function handleMessageStreamRequest(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
  options: { skipRateLimit?: boolean } = {},
) {
  const requestId = req.headers.get("x-vercel-id") || "unknown";
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  const runHandler = async () => {
    const promptStartedAt = Date.now();
    try {
      const { chatId } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const validationResult = sendMessageSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const {
        message,
        attachments,
        modelId,
        thinking,
        imageGenerations,
        system,
        meta,
      } =
        validationResult.data;
      const requestAttachments = normalizeRequestAttachments(attachments);
      const parsedMeta = parseChatRequestMeta(meta);
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: parsedMeta.modelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });
      const engineChat = await getEngineChatByIdForRequest(req, chatId, { sessionId });
      if (!engineChat) {
        return attachSessionCookie(
          NextResponse.json({ error: "Chat not found" }, { status: 404 }),
        );
      }

      // P0 stream-abort recovery (2026-04-26). Versionless-chat hard guard.
      // If the most recent generation/repair stream for this chat died
      // before producing a version (provider abort, transport reset,
      // server-restart, lazy-staleness), there is nothing to repair: a
      // followup_general here would route into the variant matcher with
      // priorVariantId:null and trigger a variant_lock_fallback against
      // a chat that has no scaffold-lock to lock to. Hard 409 stops the
      // race at the door — the client is expected to spawn a new chat
      // instead. Read-only check; the fallback "no log on disk" path is
      // treated as live (we err on letting through, never on blocking).
      // The try/catch is defensive against repo-stub mismatches in tests
      // and against transient DB errors — both should fail open (let the
      // followup through) rather than 500 the route.
      let existingVersionsForChat: Awaited<ReturnType<typeof chatRepo.getVersionsByChat>> = [];
      try {
        existingVersionsForChat = await chatRepo.getVersionsByChat(engineChat.id);
      } catch {
        existingVersionsForChat = [];
      }
      if (existingVersionsForChat.length === 0) {
        const runStatus = readRunStatusForChat(engineChat.id);
        if (runStatus && runStatus.status === "aborted" && !runStatus.versionId) {
          return attachSessionCookie(
            NextResponse.json(
              {
                error: "versionless_chat_aborted",
                message:
                  "Den här chatten har ingen version att reparera — generationen avbröts. Starta om i en ny chat.",
                chatStatus: {
                  status: runStatus.status,
                  statusReason: runStatus.statusReason,
                  hasVersion: false,
                  updatedAt: runStatus.updatedAt,
                },
              },
              { status: 409 },
            ),
          );
        }
      }

      const resolvedModelId = modelSelection.modelId;
        const resolvedModelTier = modelSelection.modelTier;
        const buildProfileId = getBuildProfileId(resolvedModelTier);
        const resolvedThinking =
          typeof thinking === "boolean"
            ? thinking
            : getDefaultThinkingEnabled();
        const resolvedImageGenerations =
          typeof imageGenerations === "boolean" ? imageGenerations : true;
        const metaBuildMethod = parsedMeta.buildMethod;
        const metaBuildIntent = parsedMeta.buildIntent;
        const metaPromptSourceKind = parsedMeta.promptSourceKind;
        const metaPromptSourceTechnical = parsedMeta.promptSourceTechnical;
        const metaPromptSourcePreservePayload = parsedMeta.promptSourcePreservePayload;
        const metaPlanMode = parsedMeta.planMode;
        const metaEngineBaseVersionId = parsedMeta.engineBaseVersionId;
        // 5-2: the version the client believes is newest. Read raw (kept out of
        // parse-chat-request-meta to keep this gate self-contained) and only
        // sent by the regular follow-up path — explicit override passes
        // (F3/autofix) omit it and are exempt from the stale-base gate below.
        const metaEngineLatestKnownVersionId =
          meta &&
          typeof meta === "object" &&
          typeof (meta as Record<string, unknown>).engineLatestKnownVersionId === "string"
            ? ((meta as Record<string, unknown>).engineLatestKnownVersionId as string).trim() ||
              null
            : null;
        const metaAppProjectId = parsedMeta.appProjectId;
        const metaScaffoldMode = parsedMeta.scaffoldMode;
        const metaScaffoldId = parsedMeta.scaffoldId;
        // Follow-ups do not carry the init brief inline. For clear-redesign
        // follow-ups, a delta-brief is generated below. Otherwise `metaBrief`
        // stays null — but the original brief still lives in the chat's
        // orchestration_snapshot and is applied to the system prompt
        // downstream. The hasPersistedBrief flag below lets the model-info
        // panel ("Brief: applicerad / Systempromt: NK tecken" — SAJ-6/B5)
        // surface that the brief is still in effect for follow-ups, not just
        // for first prompts and clear-redesign deltas.
        let metaBrief: Record<string, unknown> | null = null;
        const hasPersistedBrief = Boolean(
          extractBriefSummaryFromSnapshot(
            engineChat.orchestration_snapshot as Record<string, unknown> | null,
          ),
        );
        const metaPromptAssistModel = parsedMeta.promptAssistModel;
        const metaPromptAssistDeep = parsedMeta.promptAssistDeep;
        const metaPromptAssistMode = parsedMeta.promptAssistMode;
        const designReferences = summarizeDesignReferences(requestAttachments);
        const contractAnswerContext = collectConfirmedContractAnswers(engineChat.messages, message);

        if (metaAppProjectId && engineChat.project_id !== metaAppProjectId) {
          // IDOR guard: the caller can request a re-mapping to any
          // project id, so we must independently verify they actually
          // own the target project before re-pointing the chat row.
          const ownedTarget = await getAppProjectByIdForRequest(
            req,
            metaAppProjectId,
            { sessionId },
          );
          if (!ownedTarget) {
            return attachSessionCookie(
              NextResponse.json({ error: "forbidden" }, { status: 403 }),
            );
          }
          try {
            await chatRepo.updateChatProjectId(engineChat.id, ownedTarget.id);
            engineChat.project_id = ownedTarget.id;
          } catch (error) {
            console.warn("[API/engine/chats/:chatId/stream] Failed to repair chat project mapping", {
              chatId,
              currentProjectId: engineChat.project_id,
              targetProjectId: ownedTarget.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const promptOrchestration = orchestratePromptMessage({
          message,
          buildMethod: metaBuildMethod,
          buildIntent: metaBuildIntent,
          isFirstPrompt: false,
          attachmentsCount: requestAttachments.length,
          hardCap: MAX_PROMPT_HANDOFF_CHARS,
          promptSourceKind: metaPromptSourceKind,
          promptSourceTechnical: metaPromptSourceTechnical,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
        });
        debugLog("orchestration", "Follow-up prompt assist + strategy (request meta)", {
          chatId,
          promptAssistModel: metaPromptAssistModel,
          promptAssistDeep: metaPromptAssistDeep,
          promptAssistMode: metaPromptAssistMode,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptType: promptOrchestration.strategyMeta.promptType,
        });
        let optimizedMessage = promptOrchestration.finalMessage;
        optimizedMessage = prependOrchestrationContinuityToFollowUp(
          optimizedMessage,
          engineChat.orchestration_snapshot ?? null,
        );

        const previousFiles = await resolveFollowUpPreviousFiles(
          chatId,
          metaEngineBaseVersionId,
        );

        // 5-2 stale-base gate — mirrors finalize-design's `stale_design_version`
        // 409 (finalize-design/route.ts). A follow-up must not silently build
        // on a superseded base when a second writer (other client/agent,
        // background repair) has advanced the chat. The client reports which
        // version it believes is newest (`engineLatestKnownVersionId`); if the
        // server already has a newer preferred/latest version than that, the
        // client's whole view is stale → 409 so the user reloads. Deliberately
        // editing an OLDER version (BuilderShellContent.tsx:181-212) stays
        // allowed: there the client's known-latest still equals the server's,
        // only `engineBaseVersionId` is older — so neither leg below is true.
        if (metaEngineBaseVersionId && metaEngineLatestKnownVersionId) {
          const serverPreferredVersionId = await resolveChatPreferredVersionId(engineChat.id);
          const clientViewIsStale =
            serverPreferredVersionId !== null &&
            metaEngineLatestKnownVersionId !== serverPreferredVersionId &&
            metaEngineBaseVersionId !== serverPreferredVersionId;
          if (clientViewIsStale) {
            debugLog("orchestration", "Follow-up stale base gated (409)", {
              chatId,
              requestedBaseVersionId: metaEngineBaseVersionId,
              clientLatestVersionId: metaEngineLatestKnownVersionId,
              latestVersionId: serverPreferredVersionId,
            });
            return attachSessionCookie(
              NextResponse.json(
                {
                  error: "stale_base_version",
                  reason: "stale_base_version",
                  requestedBaseVersionId: metaEngineBaseVersionId,
                  clientLatestVersionId: metaEngineLatestKnownVersionId,
                  latestVersionId: serverPreferredVersionId,
                  message:
                    "En nyare version finns. Ladda om för att bygga vidare på den senaste versionen.",
                },
                { status: 409 },
              ),
            );
          }
        }
        // P1 F3-entry (BUG-SWARM-BACKLOG "F3-flödet körde v8 i F2-lane"):
        // server-side lifecycle-stage inheritance. The F3 stage is only carried
        // by the auto-kicked "Bygg integrationer" message; when that stream
        // parks in awaiting-input (tool-only, `tool_only_empty_generation`),
        // the user's reply arrives as a plain follow-up without
        // `meta.lifecycleStage` and used to default to design/F2 — so the
        // actual SDK codegen ran with `previewPolicy: fidelity2` and the F2
        // guards stripped the integration imports (prod chat cc10e7de v8).
        // Derivation is server-authoritative: the generation stream persisted
        // an assistant F3-continuation marker (`f3-continuation.ts`).
        // Conservative exclusions: explicit client overrides win unchanged,
        // plan-mode stays F2, and technical passes (autofix/preserve-payload)
        // are not user replies.
        //
        // PHASE A (here, before the M#818-2 gate): classify the reply and set
        // the stage PROVISIONALLY for an approving reply so the env-readiness
        // gate + credit gate run against the real F3 intent. Only an
        // APPROVING reply inherits (`classifyF3ContinuationReply` — Bugbot
        // HIGH r2: quick-reply exact match or conservative approval free
        // text; fail-safe = F2). Codex P2 r3: the inherited lineage is
        // resolved with the SAME resolution as the file base and the gate
        // (chat-scoped `engineBaseVersionId`, else preferred) — never the raw
        // marker parent, so `parent_version_id` can't point at a version that
        // was never the build base.
        //
        // PHASE B (at the persistence boundary, right before the user message
        // is persisted): the atomic marker consume. Codex P1 r3: consuming
        // here — AFTER the 412/409 readiness gate, the clarification gate and
        // the credit gate — means an aborted request leaves the marker
        // pending, so the same approval still inherits F3 once the user has
        // fixed env/credits. The conditional jsonb write stays the race
        // arbiter: an unconfirmed consume downgrades the provisional stage
        // back to design before anything is persisted or generated.
        let f3ContinuationDecision: {
          replyIntent: ReturnType<typeof classifyF3ContinuationReply>;
          markerMessageId: string | null;
          markerParentVersionId: string | null;
          /** Providers signaled in the tool-only round (marker payload). */
          markerSuggestedProviders: string[];
          /** Loop-breaker counter carried by the consumed marker. */
          markerToolOnlyRounds: number;
        } | null = null;
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
        // P2 F3-loop (åtgärd 4): a REJECT-classified reply to the pending F3
        // question ends F3 calmly WITHOUT any generation. The observed prod
        // flow ran the reject as a normal F2 follow-up, which produced a
        // fully silent generation ("Model produced no text events",
        // `toolCalls: []`) and then re-asked the same question. Instead:
        // persist the reply, consume the marker (so a racing approve cannot
        // resurrect it — same #382 arbiter semantics), confirm briefly in
        // the chat and return the user to design mode. No credits are
        // prepared/charged and no LLM call runs on this path. "Annat"/
        // unrelated replies keep the existing behavior (consume + run F2).
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
        // M#818-2: F3 env-readiness gate. `/finalize-design` is the intended F3
        // entry point and refuses to hand out `lifecycleStage: "integrations"`
        // stream-meta until every required real env key is present (412) — but
        // this route trusted the meta blindly, so a client that skipped
        // finalize-design started F3 codegen with placeholder keys and burned
        // credits on a generation whose build gate was guaranteed to fail.
        // Re-check the same shared gate here (server-authoritative), scoped to
        // the parent F2 version being forked (fall back to the chat's preferred
        // version when the meta omits it). Gate errors fail open with a log —
        // the F3 quality gate (build+lint) still catches a broken build.
        if (parsedMeta.lifecycleStage === "integrations" && !metaPlanMode) {
          // Codex P1 (PR #351): the readiness gate must inspect the version the
          // generation will ACTUALLY build from — `engineBaseVersionId` drives
          // the file context (`resolveFollowUpPreviousFiles`), while
          // `parentVersionId` is only persisted as lineage. A caller that sends
          // both with different ids could point `parentVersionId` at a
          // no-integration version to sneak past the gate, so a mismatched pair
          // is refused outright (the legit F3 trigger sends them equal —
          // BuilderShellContent.tsx).
          if (
            metaEngineBaseVersionId &&
            parsedMeta.parentVersionId &&
            metaEngineBaseVersionId !== parsedMeta.parentVersionId
          ) {
            return attachSessionCookie(
              NextResponse.json(
                {
                  error: "f3_base_mismatch",
                  message:
                    "F3-start kräver att engineBaseVersionId och parentVersionId pekar på samma F2-version.",
                  engineBaseVersionId: metaEngineBaseVersionId,
                  parentVersionId: parsedMeta.parentVersionId,
                },
                { status: 409 },
              ),
            );
          }
          try {
            // Chat-scope the client-supplied id (mirrors
            // `resolveFollowUpPreviousFiles`): an id that does not belong to
            // this chat falls back to the chat's preferred version — the same
            // base the generation itself would fall back to.
            //
            // Post-#351 hardening: the gate id derives from
            // `engineBaseVersionId` ONLY. `parentVersionId` is persisted
            // lineage and never feeds `resolveFollowUpPreviousFiles`, so a
            // caller sending only `parentVersionId` would previously be gated
            // against a version the generation does not build from (it builds
            // from preferred/latest in that case) — the same
            // gate-vs-build-base split the mismatch 409 above refuses.
            const requestedGateVersionId = metaEngineBaseVersionId ?? null;
            let gateVersionId: string | null = null;
            if (requestedGateVersionId) {
              const gateVersion = await chatRepo.getVersionById(requestedGateVersionId);
              gateVersionId =
                gateVersion && gateVersion.chat_id === engineChat.id
                  ? gateVersion.id
                  : null;
            }
            gateVersionId =
              gateVersionId ?? (await resolveChatPreferredVersionId(engineChat.id));
            if (gateVersionId) {
              const gate = await checkTier3ReadinessForVersion({
                versionId: gateVersionId,
                selectedDossiers: resolveSelectedDossiersFromSnapshot(
                  engineChat.orchestration_snapshot,
                ),
                projectId: engineChat.project_id ?? null,
              });
              if (!gate.ok && gate.reason === "missing_env") {
                debugLog("orchestration", "F3 stream gated on env readiness (412)", {
                  chatId,
                  versionId: gateVersionId,
                  missingByIntegration: gate.readiness.missingByIntegration,
                });
                return attachSessionCookie(
                  NextResponse.json(
                    {
                      error: "tier3_env_not_ready",
                      ready: false,
                      parentVersionId: gateVersionId,
                      missingByIntegration: gate.readiness.missingByIntegration,
                      message:
                        "Tunga integrationer kräver riktiga env-variabler innan F3 kan köras. Kör 'Bygg integrationer' via finalize-design.",
                    },
                    { status: 412 },
                  ),
                );
              }
              if (!gate.ok && gate.reason === "product_postcheck_blocked") {
                // Codex P1 round 5 (#353): the Product Postcheck block must
                // hold on BOTH F3 entry points — build/lint gates cannot catch
                // DOM product failures (dead mobile menu, broken anchors).
                return attachSessionCookie(
                  NextResponse.json(
                    {
                      error: "product_postcheck_blocked",
                      ready: false,
                      parentVersionId: gateVersionId,
                      message:
                        "Integrationsbygget är spärrat av Product Postcheck. Åtgärda blockerande F2-previewproblem innan du bygger integrationer.",
                    },
                    { status: 409 },
                  ),
                );
              }
              if (!gate.ok) {
                return attachSessionCookie(
                  NextResponse.json(
                    {
                      error: "version_files_unavailable",
                      ready: false,
                      parentVersionId: gateVersionId,
                      message:
                        "Kunde inte läsa versionens filer — kan inte avgöra F3-readiness. Ladda om och försök igen.",
                    },
                    { status: 409 },
                  ),
                );
              }
            }
          } catch (gateErr) {
            debugLog("orchestration", "F3 stream readiness gate errored — failing open", {
              chatId,
              error: gateErr instanceof Error ? gateErr.message : String(gateErr),
            });
          }
        }
        // OMTAG Fas 2·A / E2: unified follow-up predicate. `isOrchestrationFollowUp`
        // drives routing + orchestration decisions in this function;
        // `hasMergeablePrevious` is forwarded (via `previousFilesCount`) to
        // orchestrate and, downstream, to finalize-merge so all three lanes
        // agree on the same answer for the same inputs. Every local
        // `previousFiles.length > 0` check below reads from the predicate
        // result instead of re-deriving it inline.
        const followUpPredicate = deriveFollowUpStateFromInputs({
          persistedScaffoldId: engineChat.scaffold_id ?? null,
          previousFilesCount: previousFiles.length,
        });
        const hasFollowUpBase = followUpPredicate.isOrchestrationFollowUp;
        const existingRoutePaths =
          hasFollowUpBase
            ? extractAppRoutePathsFromFilePaths(previousFiles.map((file) => file.path))
            : [];

        const existingShellRoutePaths =
          hasFollowUpBase
            ? extractAppRoutePathsFromFilePaths(
                previousFiles
                  .filter((file) => isShellPageContent(file.content ?? ""))
                  .map((file) => file.path),
              )
            : [];

        const skipIntentClassification =
          metaPromptSourcePreservePayload || metaPromptSourceTechnical;
        // Contract-gate retries send a short answer as the current message.
        // Classify intent against the original gated request so clear-redesign
        // keeps its delta-brief/scaffold-unlock semantics on turn 2.
        const followUpIntentMessage =
          contractAnswerContext.currentReplyWasConsumed &&
          contractAnswerContext.consumedReplyContext?.sourceUserMessage
            ? contractAnswerContext.consumedReplyContext.sourceUserMessage
            : message;
        const skipFollowUpClarification =
          skipIntentClassification || contractAnswerContext.currentReplyWasConsumed;
        // Backoffice 2.0 fas 6: strategy-aware classification. Default
        // manifest config is "keyword", so this resolves to the exact same
        // deterministic result as before; only an explicit `small-llm` opt-in
        // takes the LLM path (with fail-safe fallback to the same keyword
        // classifier). See follow-up-intent-router.ts.
        const followUpIntent = hasFollowUpBase && !skipIntentClassification
          ? await classifyFollowUpIntentWithStrategy(followUpIntentMessage)
          : "neutral";
        // Plan 06 (2026-04-24): detect dossier-mappable capabilities in the
        // follow-up text so `selectDossiersForRequest` actually sees the
        // signal even when the snapshot-hydrated brief and the keyword-based
        // `inferCapabilities` pass both miss it (Plan 01 smoke run 2). Skip
        // when intent classification is suppressed (auto-repair / payload
        // preservation passes) — those re-enter the same pipeline and would
        // otherwise re-trigger capability injection on every repair pass.
        const followUpCapabilityDetection: FollowUpCapabilityDetection =
          hasFollowUpBase && !skipIntentClassification
            ? detectFollowUpCapabilities(followUpIntentMessage)
            : {
                capabilities: [],
                capabilityIds: [],
                tierByCapability: {},
                wordCount: 0,
                referencesExistingCapability: false,
                modifyReferenceMatches: [],
              };
        if (followUpCapabilityDetection.capabilityIds.length > 0) {
          devLogAppend("in-progress", {
            type: "followup.capability.detected",
            chatId,
            followUpIntent,
            capabilityIds: followUpCapabilityDetection.capabilityIds,
            tierByCapability: followUpCapabilityDetection.tierByCapability,
            referencesExistingCapability:
              followUpCapabilityDetection.referencesExistingCapability,
            modifyReferenceMatches:
              followUpCapabilityDetection.modifyReferenceMatches,
          });
        }
        const followUpClarification = hasFollowUpBase && !skipFollowUpClarification
          ? resolveFollowUpClarification(message)
          : null;
        if (followUpClarification) {
          devLogAppend("latest", {
            type: "site.message.awaiting_input",
            chatId,
            reason: followUpClarification.reason,
            promptPreview: message.slice(0, 160),
          });
          await persistFollowUpClarification({
            chatId,
            message,
            clarification: followUpClarification,
            addMessage: (targetChatId, role, content, _parentMessageId, uiParts) =>
              chatRepo.addMessage(targetChatId, role, content, undefined, uiParts),
          });
          return attachSessionCookie(
            new Response(
              wrapStreamForPromptToDoneMetric(
                buildAwaitingClarificationStream({
                  chatId,
                  clarification: followUpClarification,
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

        // Delta-brief: generate a fresh brief for clear-redesign follow-ups
        // so the Kod-LLM gets structured design context instead of raw text only.
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

        if (hasFollowUpBase) {
          const followUpFileContext = buildFollowUpFileContextDecision({
            message: followUpIntentMessage,
            previousFiles,
            followUpIntent,
            skipIntentClassification,
          });
          const fileCtx = followUpFileContext.fileContext;

          // OMTAG Fas 2·A / E1: follow-up rules live in the system prompt's
          // `## Generation Mode: Follow-Up` block (intro.ts). Previously this
          // user-turn section restated the same guidance (~4 lines × 2 branches
          // = ~900 chars) as `elementPreservationReminder` + the intro lines
          // below. We keep only (a) a single pointer to the system-prompt
          // section so the LLM can re-anchor, and (b) genuinely unique
          // guidance — the `clear-redesign` aggressive-rewrite lines, which
          // are NOT in the system prompt. Measured saving: ~250 tokens per
          // non-redesign follow-up (see docs/plans/active/llm-flow-quickwins.md
          // Q11.1 and gpt_review/filer/E-easy-medium-layer.md E1).
          const FOLLOW_UP_SYSTEM_POINTER =
            "(Follow-up rules: see system prompt § Generation Mode: Follow-Up.)";

          if (skipIntentClassification) {
            optimizedMessage = wrapWithSection({
              heading: PROMPT_WRAPPER_HEADINGS.existingProjectFilesReference,
              introLines: [
                "Apply the requested change precisely. Do not modify unrelated sections or files.",
                FOLLOW_UP_SYSTEM_POINTER,
              ],
              body: fileCtx.summary,
              divider: true,
              trailingBody: optimizedMessage,
            });
          } else {
            const redesignLines =
              followUpIntent === "clear-redesign"
                ? [
                    "The user wants a genuine redesign of the existing site, not a small refinement.",
                    "Replace the visual identity, background treatment, layout rhythm, and dominant UI patterns where needed.",
                    "Rewrite the main experience aggressively enough that the result feels new. You may replace globals.css, app/page.tsx, and other dominant UI files.",
                    "Do not preserve the previous design language unless the user explicitly asked to keep parts of it.",
                    "You may still reuse useful content or information architecture from the current project when relevant.",
                  ]
                : [FOLLOW_UP_SYSTEM_POINTER];
            optimizedMessage = [
              wrapWithSection({
                heading: PROMPT_WRAPPER_HEADINGS.followUpEditingMode,
                introLines: redesignLines,
                body: fileCtx.summary,
              }),
              "",
              PROMPT_WRAPPER_HEADINGS.requestedChanges,
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

        if (contractAnswerContext.currentReplyWasConsumed) {
          const latestAnswer = contractAnswerContext.confirmedAnswers.at(-1);
          if (latestAnswer) {
            optimizedMessage = [
              wrapWithSection({
                heading: PROMPT_WRAPPER_HEADINGS.contractClarificationAnswer,
                introLines: [
                  "The user is answering the previous contract clarification question. Use this answer to continue the existing generation safely.",
                  `Question: ${latestAnswer.question}`,
                  `Answer: ${latestAnswer.answer}`,
                  "",
                  "Continue the existing implementation using this confirmed decision. Do not ask the same question again unless the answer is still genuinely insufficient.",
                ],
              }),
              "",
              PROMPT_WRAPPER_HEADINGS.userReply,
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

        optimizedMessage = await appendHydratedTextAttachmentExcerpts(
          optimizedMessage,
          requestAttachments,
          { signal: req.signal },
        );

        const creditContext = {
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          attachmentsCount: requestAttachments.length,
        };
        const creditCheck = await prepareCredits(req, "prompt.refine", creditContext, {
          sessionId,
        });
        if (!creditCheck.ok) {
          return attachSessionCookie(creditCheck.response);
        }
        try {
          const metaPayload =
            meta && typeof meta === "object"
              ? (() => {
                  const copy = { ...(meta as Record<string, unknown>) };
                  delete copy.promptOriginal;
                  delete copy.promptFormatted;
                  copy.promptStrategy = promptOrchestration.strategyMeta.strategy;
                  copy.promptType = promptOrchestration.strategyMeta.promptType;
                  copy.promptSource = promptOrchestration.strategyMeta.promptSource;
                  copy.promptBudgetTarget = promptOrchestration.strategyMeta.budgetTarget;
                  copy.promptOptimizedLength = promptOrchestration.strategyMeta.optimizedLength;
                  copy.promptReductionRatio = promptOrchestration.strategyMeta.reductionRatio;
                  copy.promptStrategyReason = promptOrchestration.strategyMeta.reason;
                  copy.promptComplexityScore = promptOrchestration.strategyMeta.complexityScore;
                  return Object.keys(copy).length > 0 ? copy : null;
                })()
              : {
                  promptStrategy: promptOrchestration.strategyMeta.strategy,
                  promptType: promptOrchestration.strategyMeta.promptType,
                  promptSource: promptOrchestration.strategyMeta.promptSource,
                  promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
                  promptOptimizedLength: promptOrchestration.strategyMeta.optimizedLength,
                  promptReductionRatio: promptOrchestration.strategyMeta.reductionRatio,
                  promptStrategyReason: promptOrchestration.strategyMeta.reason,
                  promptComplexityScore: promptOrchestration.strategyMeta.complexityScore,
                };
          await createPromptLog({
            event: "follow_up",
            userId: creditCheck.user?.id ?? null,
            sessionId,
            appProjectId: metaAppProjectId || null,
            v0ProjectId: engineChat.project_id ?? null,
            chatId,
            promptOriginal: message,
            promptFormatted: optimizedMessage,
            systemPrompt: typeof system === "string" ? system.trim() || null : null,
            promptAssistModel: metaPromptAssistModel,
            promptAssistDeep: metaPromptAssistDeep,
            promptAssistMode: metaPromptAssistMode,
            buildIntent: metaBuildIntent,
            buildMethod: metaBuildMethod,
            modelTier: resolvedModelTier,
            imageGenerations: resolvedImageGenerations,
            thinking: resolvedThinking,
            attachmentsCount: requestAttachments.length,
            meta: metaPayload,
          });
        } catch (error) {
          console.warn("[prompt-log] Failed to record follow-up prompt log:", error);
        }
        const commitCreditsOnce = createCommitCreditsOnce(creditCheck);

        const persistedScaffoldId = engineChat.scaffold_id;
        const ignorePersistedScaffoldForMatch = shouldIgnorePersistedScaffoldForMatch({
          hasPreviousFiles: hasFollowUpBase,
          followUpIntent,
          message: followUpIntentMessage,
          scaffoldMode: metaScaffoldMode,
          scaffoldId: metaScaffoldId,
        });

        if (metaPlanMode) {
          await chatRepo.addMessage(engineChat.id, "user", message);

          let planEngineIntent: BuildIntent =
            metaBuildIntent === "template" ||
            metaBuildIntent === "website" ||
            metaBuildIntent === "app"
              ? (metaBuildIntent as BuildIntent)
              : "website";
          if (planEngineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
            planEngineIntent = "app";
          }
          const planOrchestrationStartedAt = Date.now();
          const planOrchestration = await prepareGenerationContext(
            buildFollowUpOrchestrationInput({
              mode: "plan",
              optimizedMessage,
              message: followUpIntentMessage,
              buildIntent: planEngineIntent,
              parsedMeta,
              resolvedImageGenerations,
              designReferences,
              persistedScaffoldId,
              previousFilesCount: previousFiles.length,
              hasFollowUpBase,
              ignorePersistedScaffoldForMatch,
              promptStrategyMeta: promptOrchestration.strategyMeta,
              existingRoutePaths,
              existingShellRoutePaths,
              previousFilePaths: hasFollowUpBase
                ? previousFiles.map((file) => file.path)
                : [],
              followUpCapabilityDetection,
              followUpIntent,
              orchestrationSnapshot:
                engineChat.orchestration_snapshot as Record<string, unknown> | null,
              engineModelId: resolveEngineModelId(resolvedModelTier),
            }),
          );
          debugLog("orchestration", "Follow-up plan orchestration prepared", {
            chatId,
            durationMs: Date.now() - planOrchestrationStartedAt,
            qualityTarget: planOrchestration.buildSpec.qualityTarget,
            contextPolicy: planOrchestration.buildSpec.contextPolicy,
            scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
          });
          const planResolvedScaffold = planOrchestration.resolvedScaffold;
          if (
            planResolvedScaffold &&
            (!persistedScaffoldId || ignorePersistedScaffoldForMatch)
          ) {
            try {
              await chatRepo.updateChatScaffoldId(chatId, planResolvedScaffold.id);
            } catch {
              /* best-effort persist */
            }
          }

          const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
          dumpPlanModePlannerPrompts(
            planPreamble,
            planOrchestration,
            planSystemPrompt,
            "POST /api/engine/chats/[chatId]/stream",
          );
          const planChatHistory = buildBoundedChatHistory(engineChat.messages);
          const plannerSettings = resolvePlanModePlannerSettings(
            resolvedModelTier,
            resolvedThinking,
          );
          const planModel = plannerSettings.modelId;
          logPlanModeGenerationStart({
            planModel,
            promptLength: optimizedMessage.length,
            scaffoldId: planResolvedScaffold?.id ?? null,
            resolvedThinking: plannerSettings.thinking,
          });
          const planPipelineStream = createPlanModePipelineStream({
            optimizedMessage,
            planSystemPrompt,
            planModel,
            plannerThinking: plannerSettings.thinking,
            plannerReasoningEffort: plannerSettings.reasoningEffort,
            abortSignal: req.signal,
            chatHistory: planChatHistory,
            referenceAttachments: requestAttachments,
          });

          return attachSessionCookie(withPromptToDoneMetricResponse(createOwnEnginePlanModeResponse({
            pipelineStream: planPipelineStream,
            chatId,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            thinking: plannerSettings.thinking,
            promptStrategyMeta: promptOrchestration.strategyMeta,
            buildSpec: planOrchestration.buildSpec,
            resolvedScaffold: planResolvedScaffold,
            scaffoldMode: metaScaffoldMode,
            persistAssistantSummary: async (planData, hasBlockers) => {
              try {
                const storedPlanPart = buildPlanUiPart(planData);
                await chatRepo.addMessage(
                  chatId,
                  "assistant",
                  buildPlanSummaryMessage(planData, hasBlockers),
                  undefined,
                  storedPlanPart ? [storedPlanPart] : undefined,
                );
              } catch (error) {
                console.warn("[plan] Failed to persist planner assistant summary:", error);
              }
            },
            buildDonePayload: (planData, hasBlockers) => ({
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput: hasBlockers,
              planArtifact: planData,
              planMode: true,
            }),
            commitCredits: commitCreditsOnce,
            commitCreditsPosition: "before-done",
            normalizeQuestionToolCallIds: true,
          }), {
            kind: "followup",
            promptStartedAt,
            signal: req.signal,
            chatId,
          }));
        }

        await chatRepo.addMessage(engineChat.id, "user", message);

        // PHASE B — atomic F3-marker consume at the persistence boundary
        // (Codex P1 r3). Runs AFTER every blocking pre-check (stale-base 409,
        // f3_base_mismatch 409, M#818-2 readiness 412/409, follow-up
        // clarification return, credit gate) and AFTER the user reply was
        // persisted above. An abort in any of those gates therefore leaves
        // the marker pending — the same approval inherits F3 again once the
        // user has fixed env/credits. Consuming after the persist also
        // removes the "consumed but nothing persisted" window entirely: once
        // the reply row exists, the history walk clears pending regardless,
        // so this conditional write's ONLY remaining job is the concurrent
        // race arbiter. Every direct reply consumes (approve to claim the
        // continuation, reject/unrelated so a racing approve cannot resurrect
        // it); an approve whose consume is not CONFIRMED (lost race, write
        // error) downgrades the provisional stage back to design before
        // anything is generated.
        // P2 F3-loop: true when this generation is a CONFIRMED approval
        // continuation ("Godkänn förslag" that claimed the marker). Drives
        // (a) the forced-codegen build directive below, (b) pulling the
        // integration-signal tools out of the tool set for this round, and
        // (c) the dossier-capability injection + loop-breaker counter.
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

        // P2 F3-loop (åtgärd 1): the approval round must BUILD, not
        // re-propose. Map the approved providers to dossier capabilities
        // (stripe → payments etc. via integrationRegistry + dossier
        // matching) so `selectDossiersForRequest` injects the hard-dossier
        // verbatim templates — the same mechanic the init path uses — and
        // inject an explicit end-to-end build directive with the #374
        // graceful not-configured contract (real keys must NOT be assumed;
        // placeholder env values may remain until the owner fills them in).
        let f3ApprovedDossierCapabilities: string[] = [];
        if (f3ApprovalBuildRound && f3ContinuationDecision) {
          const approvedProviders = f3ContinuationDecision.markerSuggestedProviders;
          try {
            f3ApprovedDossierCapabilities =
              mapProviderKeysToDossierCapabilities(approvedProviders);
          } catch (mapErr) {
            debugLog("orchestration", "F3 provider→capability mapping failed", {
              chatId,
              error: mapErr instanceof Error ? mapErr.message : String(mapErr),
            });
            f3ApprovedDossierCapabilities = [];
          }
          devLogAppend("in-progress", {
            type: "f3.approval_build_round",
            chatId,
            approvedProviders,
            dossierCapabilities: f3ApprovedDossierCapabilities,
            priorToolOnlyRounds: f3ContinuationDecision.markerToolOnlyRounds,
          });
          // Codex P2 (PR #383): only reference "the dossier's config-notice
          // UI" when an injected dossier actually ships the component —
          // otherwise the model imports a file that is never emitted.
          const configNoticeShipped =
            approvedProvidersShipConfigNotice(approvedProviders);
          const fallbackInstruction = configNoticeShipped
            ? "Do NOT assume real API keys are configured. Placeholder env values may remain until the site owner fills them in — implement the graceful not-configured fallback: initialize SDK clients lazily after an env guard (never at module scope), return a calm 503 with a `*-not-configured` error code from the API route, and render the dossier's config-notice UI (`components/integration-config-notice.tsx`, included in the provided dossier files) with a disabled CTA instead of a raw error."
            : "Do NOT assume real API keys are configured. Placeholder env values may remain until the site owner fills them in — implement the graceful not-configured fallback: initialize SDK clients lazily after an env guard (never at module scope), return a calm 503 with a `*-not-configured` error code from the API route, and show a calm inline notice (plain markup you write yourself) with a disabled CTA instead of a raw error. Do NOT import any config-notice component — none is provided.";
          optimizedMessage = [
            wrapWithSection({
              heading: "## F3 Integration Build Approval",
              introLines: [
                "The user has APPROVED the integration proposal. The proposal phase is OVER.",
                approvedProviders.length > 0
                  ? `Approved integration providers: ${approvedProviders.join(", ")}.`
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

        const promptForLlm = optimizedMessage;

        let engineIntent: BuildIntent =
          metaBuildIntent === "template" ||
          metaBuildIntent === "website" ||
          metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
          engineIntent = "app";
        }
        const trimmedSystem = typeof system === "string" ? system.trim() : "";
        const snapshotRecord =
          engineChat.orchestration_snapshot && typeof engineChat.orchestration_snapshot === "object"
            ? (engineChat.orchestration_snapshot as Record<string, unknown>)
            : null;
        const snapshotVariantId =
          snapshotRecord && typeof snapshotRecord.variantId === "string"
            ? (snapshotRecord.variantId as string)
            : null;
        // TODO(plan-01/failsafe): if snapshotVariantId is null, consider reading
        // latest resolved `orchestration.styleDirection` for this chat from the
        // persisted event history as a continuity fallback. Not implemented here
        // yet because this call-site currently has no local event-history reader.
        // P22b: ärv qualityTarget från senaste accepterad versions buildSpec
        // (lagrad i orchestration_snapshot). `inheritQualityTargetFromPriorVersion`
        // i orchestrate.ts är no-op om värdet saknas eller redan matchar baseSpec.
        const snapshotBuildSpec =
          snapshotRecord && snapshotRecord.buildSpec && typeof snapshotRecord.buildSpec === "object"
            ? (snapshotRecord.buildSpec as Record<string, unknown>)
            : null;
        const PRIOR_QUALITY_TARGETS = ["standard", "premium", "release-candidate"] as const;
        const rawPriorQualityTarget =
          snapshotBuildSpec && typeof snapshotBuildSpec.qualityTarget === "string"
            ? snapshotBuildSpec.qualityTarget
            : null;
        const priorQualityTarget =
          rawPriorQualityTarget &&
          (PRIOR_QUALITY_TARGETS as readonly string[]).includes(rawPriorQualityTarget)
            ? (rawPriorQualityTarget as (typeof PRIOR_QUALITY_TARGETS)[number])
            : null;
        const requestKindResult =
          hasFollowUpBase ? classifyRequestKind(followUpIntentMessage) : null;
        if (requestKindResult?.kind === "qa-or-score") {
          devLogAppend("in-progress", {
            type: "request.kind.shortcircuit",
            chatId,
            kind: requestKindResult.kind,
            reason: "qa-or-score-no-codegen",
          });
          try {
            const assistantText = await generateQaShortCircuitText({
              optimizedMessage,
              signal: req.signal,
            });
            await chatRepo.addMessage(chatId, "assistant", assistantText).catch(() => null);
            const qaStream = buildQaShortCircuitStream({
              chatId,
              text: assistantText,
            });
            return attachSessionCookie(new Response(
              wrapStreamForPromptToDoneMetric(qaStream, {
                kind: "followup",
                promptStartedAt,
                signal: req.signal,
                chatId,
              }),
              { headers: createSSEHeaders() },
            ));
          } catch (err) {
            devLogAppend("in-progress", {
              type: "request.kind.shortcircuit.fallback",
              chatId,
              kind: requestKindResult.kind,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
        const engineModel = resolveEngineModelId(resolvedModelTier);
        // MB-3: the actual codegen + telemetry model is the generator-phase
        // model (manifest phaseRouting). In the current default config it equals
        // `engineModel` on every tier (the anthropic tier's build-default is now
        // Claude Opus 4.8 too after Sonnet was retired 2026-06-28). The chat's
        // persisted `chat.model` (set at init) stays the tier build model so
        // repair/server-verify round-trip the tier via ownModelIdToCanonicalModelId.
        const generatorModel = resolvePhaseModel(resolvedModelTier, "generator").modelId;
        // P32 Fas B next step: external-fetch needs web-search integration
        // before it can short-circuit safely; keep it on normal codegen for now.
        const orchestrationInput = buildFollowUpOrchestrationInput({
          mode: "codegen",
          optimizedMessage,
          message: followUpIntentMessage,
          buildIntent: engineIntent,
          parsedMeta,
          resolvedImageGenerations,
          designReferences,
          persistedScaffoldId,
          previousFilesCount: previousFiles.length,
          hasFollowUpBase,
          ignorePersistedScaffoldForMatch,
          promptStrategyMeta: promptOrchestration.strategyMeta,
          existingRoutePaths,
          existingShellRoutePaths,
          previousFilePaths: hasFollowUpBase
            ? previousFiles.map((file) => file.path)
            : [],
          followUpCapabilityDetection,
          followUpIntent,
          additionalDossierCapabilities: f3ApprovedDossierCapabilities,
          // Codex P1 (#445): keep the approved provider identity through
          // sibling selection — the approval text has no provider keyword.
          approvedProviders:
            f3ApprovalBuildRound && f3ContinuationDecision
              ? f3ContinuationDecision.markerSuggestedProviders
              : null,
          orchestrationSnapshot:
            engineChat.orchestration_snapshot as Record<string, unknown> | null,
          // Q5a + MB-3: budget scales to the generator-phase model's context
          // window (Opus 4.8 on the anthropic tier), not the tier build-default.
          engineModelId: generatorModel,
          persistedVariantId: snapshotVariantId,
          contractAnswers: contractAnswerContext.confirmedAnswers,
          customInstructions: trimmedSystem || undefined,
          chatId,
          priorQualityTarget,
          requestKind: requestKindResult?.kind ?? null,
        });
        const orchestrationStartedAt = Date.now();
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        if (requestKindResult) {
          devLogAppend("in-progress", {
            type: "request.kind.classified",
            chatId,
            kind: requestKindResult.kind,
            source: requestKindResult.source,
          });
        }
        debugLog("orchestration", "Follow-up orchestration base resolved", {
          chatId,
          durationMs: Date.now() - orchestrationStartedAt,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          routeCount: orchestrationBase.routePlan.routes.length,
          requestKind: requestKindResult?.kind ?? null,
        });
        devLogAppend("in-progress", {
          type: "orchestration.resolved",
          chatId,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
        });
        const { resolvedScaffold, routePlan, preGenerationContracts } = orchestrationBase;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });
        if (
          resolvedScaffold &&
          (!persistedScaffoldId || ignorePersistedScaffoldForMatch)
        ) {
          try {
            await chatRepo.updateChatScaffoldId(chatId, resolvedScaffold.id);
          } catch { /* best-effort persist */ }
        }
        devLogAppend("in-progress", {
          type: "contracts.inferred",
          chatId,
          dataMode: preGenerationContracts.contracts.dataMode,
          databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
          authProvider: preGenerationContracts.contracts.authProvider ?? null,
          paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
          integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
          envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
          unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
        });

        const chatHistory = buildBoundedChatHistory(engineChat.messages);

        debugLog("build", "Follow-up chat stream request", {
          chatId,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          internalModelSelection: resolvedModelTier,
          enginePath: "own-engine",
          engineModel: canonicalModelIdToOwnModelId(resolvedModelTier),
          promptLength: optimizedMessage.length,
          originalPromptLength: message.length,
          attachments: requestAttachments.length,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptType: promptOrchestration.strategyMeta.promptType,
        });
        debugLog("engine", "Own engine model resolved", {
          resolvedModelTier,
          engineModel,
          generatorModel,
          fallback: false,
        });
        devLogStartGeneration({
          message: optimizedMessage,
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          projectId: engineChat.project_id ?? undefined,
          slug: metaBuildMethod || metaBuildIntent || undefined,
          chatId,
          generationKind: "followup",
        });
        devLogAppend("in-progress", {
          type: "comm.request.followup",
          chatId,
          modelId: resolvedModelId,
          modelTier: resolvedModelTier,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          buildIntent: metaBuildIntent,
          buildMethod: metaBuildMethod,
          message: optimizedMessage,
          // P26: also surface the raw user message (truncated to 500 chars)
          // so devs can see exactly what the user typed without scrolling
          // through the wrapped optimizedMessage. Bekräftar samtidigt att
          // LLM:en faktiskt får råa intentet — det ligger sist i
          // optimizedMessage under rubriken "Begärda ändringar".
          rawMessage:
            message.length > 500 ? `${message.slice(0, 500)}…` : message,
          rawMessageLength: message.length,
          slug: metaBuildMethod || metaBuildIntent || undefined,
          promptType: promptOrchestration.strategyMeta.promptType,
          // Plan 03 (short): observability/backoffice can now filter
          // auto-repair passes out of follow-up statistics by reading
          // `promptSource` directly from the comm.request.followup row.
          promptSource: promptOrchestration.strategyMeta.promptSource,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
          originalLength: promptOrchestration.strategyMeta.originalLength,
          optimizedLength: promptOrchestration.strategyMeta.optimizedLength,
          reductionRatio: promptOrchestration.strategyMeta.reductionRatio,
          strategyReason: promptOrchestration.strategyMeta.reason,
          attachmentsCount: requestAttachments.length,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          followUpIntent,
          baseVersionId: metaEngineBaseVersionId,
        });
        if (contractClarification) {
          const assistantQuestion = await chatRepo.addMessage(
            chatId,
            "assistant",
            contractClarification.question,
            undefined,
            [buildStoredContractClarificationUiPart(contractClarification)],
          ).catch(() => null);
          devLogAppend("in-progress", {
            type: "contracts.clarification-requested",
            chatId,
            kind: contractClarification.kind,
            reason: contractClarification.reason,
          });
          const contractGateStream = createPreGenerationContractGateReadableStream(
            buildPreGenerationContractGateParams({
              routeVariant: "follow-up",
              sseChatId: chatId,
              assistantMessageId: assistantQuestion?.id ?? null,
              contractClarification,
              preGenerationContracts,
              engineModel,
              resolvedModelTier,
              buildProfileId,
              buildProfileLabel: MODEL_LABELS[resolvedModelTier],
              resolvedThinking,
              resolvedImageGenerations,
              resolvedScaffold,
              strategyMeta: promptOrchestration.strategyMeta,
              buildSpec: orchestrationBase.buildSpec,
              metaBriefApplied: Boolean(metaBrief) || hasPersistedBrief,
              customInstructionsLength: trimmedSystem?.length ?? 0,
            }),
          );
          return attachSessionCookie(new Response(
            wrapStreamForPromptToDoneMetric(contractGateStream, {
              kind: "followup",
              promptStartedAt,
              signal: req.signal,
              chatId,
            }),
            { headers: createSSEHeaders() },
          ));
        }
        const finalizePromptStartedAt = Date.now();
        const finalized = await finalizeOrchestrationPrompts(orchestrationBase, orchestrationInput);
        const { engineSystemPrompt } = finalized;
        debugLog("orchestration", "Follow-up system prompt finalized", {
          chatId,
          durationMs: Date.now() - finalizePromptStartedAt,
          routeCount: orchestrationBase.routePlan.routes.length,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldVariant: finalized.variantId,
        });
        if (finalized.variantId) {
          devLogAppend("in-progress", {
            type: "orchestration.styleDirection",
            chatId,
            styleDirection: finalized.variantId,
          });
        }
        const generationInputPackage = buildGenerationInputPackage(
          orchestrationBase,
          orchestrationInput,
          finalized,
        );
        const lineageHash = generationInputPackage.lineageHash;
        writeOrchestrationDynamicDump(generationInputPackage);
        dumpOwnEngineCodegenFromFullSystem(engineSystemPrompt, {
          route: "POST /api/engine/chats/[chatId]/stream",
          planMode: false,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const { compressed: enginePrompt, urlMap } = compressUrls(promptForLlm);
        const generatorThinking = resolvePhaseThinking(resolvedModelTier, "generator");
        const effectiveGeneratorThinking =
          resolvedThinking && generatorThinking.thinking;
        const engineStream = createOwnEnginePipelineAndGenerationStream({
          chatId,
          resolvedTier: resolvedModelTier,
          // Integration tools (`requestEnvVar`, `suggestIntegration`) are
          // only useful in F3 ("bygg integrationer") where the user is
          // wiring real keys. Stays off in F2 follow-ups so design-iteration
          // chats never surface env-var prompts. P2 F3-loop (åtgärd 1a):
          // ALSO off in the F3 APPROVAL round — the proposal phase is over,
          // and leaving the tools in let the model re-propose instead of
          // building (prod chat fa6515bc: three approval rounds, zero code).
          includeIntegrationSignals:
            parsedMeta.lifecycleStage === "integrations" && !f3ApprovalBuildRound,
          pipeline: {
            prompt: enginePrompt,
            systemPrompt: engineSystemPrompt,
            model: generatorModel,
            chatHistory,
            thinking: effectiveGeneratorThinking,
            abortSignal: req.signal,
            maxSteps: resolveOwnEngineMaxSteps({
              buildSpec: orchestrationBase.buildSpec,
              userMessage: followUpIntentMessage,
              isFollowUp: hasFollowUpBase,
            }),
            referenceAttachments: requestAttachments,
          },
          meta: buildOwnEngineGenerationStreamMeta({
            routeVariant: "follow-up",
            engineModel: generatorModel,
            resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            resolvedThinking: effectiveGeneratorThinking,
            resolvedImageGenerations,
            strategyMeta: promptOrchestration.strategyMeta,
            orchestrationBase,
            buildSpec: orchestrationBase.buildSpec,
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief) || hasPersistedBrief,
            customInstructionsLength: trimmedSystem?.length ?? 0,
            scaffoldId: resolvedScaffold?.id ?? null,
            variantId: finalized.variantId,
          }),
          engineModel: generatorModel,
          optimizedMessage,
          rawPrompt: followUpIntentMessage,
          engineIntent,
          buildSpec: orchestrationBase.buildSpec,
          routePlan: routePlan ?? null,
          orchestrationContract: orchestrationBase.orchestrationContract,
          resolvedScaffold: resolvedScaffold ?? null,
          urlMap,
          commitCredits: commitCreditsOnce,
          previousFiles: hasFollowUpBase ? previousFiles : undefined,
          lineageHash,
          targetVersionId:
            metaPromptSourceKind === "autofix" && metaEngineBaseVersionId
              ? metaEngineBaseVersionId
              : undefined,
          lifecycleParentVersionId:
            parsedMeta.lifecycleStage === "integrations"
              ? parsedMeta.parentVersionId
              : null,
          // P2 F3-loop (åtgärd 3): forward the marker's tool-only round
          // counter so a repeated tool-only outcome escalates (round 2 →
          // closure-offering question; round 3 → terminal close, no marker).
          f3PriorToolOnlyRounds:
            f3ApprovalBuildRound && f3ContinuationDecision
              ? f3ContinuationDecision.markerToolOnlyRounds
              : 0,
          // Bugbot HIGH (PR #383): a SILENT approval round signals no
          // providers itself — forward the consumed marker's providers so
          // the re-persisted marker keeps its provider→dossier mapping for
          // the next retry-approval.
          f3PriorSuggestedProviders:
            f3ApprovalBuildRound && f3ContinuationDecision
              ? f3ContinuationDecision.markerSuggestedProviders
              : null,
        });

        return buildEngineStreamResponse({
          engineStream,
          req,
          promptStartedAt,
          kind: "followup",
          attachSessionCookie,
          chatId,
        });
    } catch (err) {
      return buildStreamErrorResponse({
        err,
        req,
        requestId,
        promptStartedAt,
        kind: "followup",
        logLabel: "Send message error",
        devLogType: "comm.error.send",
        devLogExtras: { chatId: null },
        attachSessionCookie,
      });
    }
  };

  return options.skipRateLimit ? runHandler() : withRateLimit(req, "message:send", runHandler);
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return handleMessageStreamRequest(req, ctx);
}
