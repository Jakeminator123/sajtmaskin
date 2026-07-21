/**
 * Follow-up chat stream handler (own-engine). Split out of the former
 * `chat-message-stream-post.ts` monolith — the phase/turn modules in this
 * folder hold the extracted steps; execution order is unchanged.
 */
import { NextResponse } from "next/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { detectFollowUpCapabilities, type FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import { mergeDossierIdCapabilities } from "@/lib/builder/dossier-id-request";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { prepareCredits } from "@/lib/credits/server";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { isShellPageContent } from "@/lib/gen/build-spec";
import { collectConfirmedContractAnswers } from "@/lib/gen/contract/answer-context";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
import { getDossierById } from "@/lib/gen/dossiers/registry";
import { deriveFollowUpStateFromInputs } from "@/lib/gen/follow-up-predicate";
import {
  extractBriefSummaryFromSnapshot,
  prependOrchestrationContinuityToFollowUp,
} from "@/lib/gen/orchestration-snapshot";
import { createPreviewPrewarmLeaseKey } from "@/lib/gen/preview/preview-prewarm";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "@/lib/gen/prompt-wrapper-contract";
import {
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import { extractAppRoutePathsFromFilePaths } from "@/lib/gen/route-plan";
import {
  resolveChatPreferredVersionId,
  resolveFollowUpPreviousFiles,
} from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { readRunStatusForChat } from "@/lib/logging/run-status-reader";
import {
  DEFAULT_MODEL_ID,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { resolveModelSelection } from "@/lib/models/selection";
import { wrapStreamForPromptToDoneMetric } from "@/lib/observability/prompt-to-done-stream";
import {
  buildAwaitingClarificationStream,
  persistFollowUpClarification,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "@/lib/providers/own-engine/follow-up-clarification";
import { classifyFollowUpIntentWithStrategy } from "@/lib/providers/own-engine/follow-up-intent-router";
import { withRateLimit } from "@/lib/rateLimit";
import { createSSEHeaders } from "@/lib/streaming";
import { getAppProjectByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { debugLog } from "@/lib/utils/debug";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { createCommitCreditsOnce } from "../credits-handler";
import { buildFollowUpFileContextDecision } from "../follow-up-file-context";
import { parseChatRequestMeta } from "../parse-chat-request-meta";
import { buildStreamErrorResponse } from "../stream-error-response";
import { runCodegenTurn } from "./codegen-turn";
import { runClearRedesignDeltaBriefPhase } from "./delta-brief-phase";
import {
  consumeF3MarkerPhaseB,
  handleF3RejectClose,
  prepareF3ApprovalBuildRound,
  resolveF3ContinuationPhaseA,
} from "./f3-continuation-phase";
import { runF3ReadinessGate } from "./f3-readiness-gate";
import { recordFollowUpPromptLog } from "./follow-up-prompt-log";
import { runPlanModeTurn } from "./plan-mode-turn";

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
      // Distinguishes a genuine empty result (new/versionless chat) from a
      // fail-open catch (transient DB/repo error). Only a CONFIRMED-empty chat
      // may prewarm: a follow-up whose version lookup merely threw must never
      // be treated as new (that would restart its warm preview workspace).
      let versionsQuerySucceeded = false;
      try {
        existingVersionsForChat = await chatRepo.getVersionsByChat(engineChat.id);
        versionsQuerySucceeded = true;
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
        // PHASE A of the F3-continuation contract (full doc on
        // `resolveF3ContinuationPhaseA` in f3-continuation-phase.ts):
        // classify the reply and provisionally inherit the F3 stage for an
        // approving reply so the env-readiness gate + credit gate run
        // against the real F3 intent.
        const f3ContinuationDecision = await resolveF3ContinuationPhaseA({
          chatId,
          message,
          engineChat,
          parsedMeta,
          metaPlanMode,
          metaPromptSourceKind,
          metaPromptSourcePreservePayload,
          metaPromptSourceTechnical,
          metaEngineBaseVersionId,
        });
        // P2 F3-loop (åtgärd 4): a REJECT-classified reply ends F3 calmly
        // WITHOUT any generation (see `handleF3RejectClose`).
        const f3RejectResponse = await handleF3RejectClose({
          f3ContinuationDecision,
          engineChat,
          chatId,
          message,
          promptStartedAt,
          req,
          attachSessionCookie,
        });
        if (f3RejectResponse) {
          return f3RejectResponse;
        }
        // M#818-2: F3 env-readiness gate (see `runF3ReadinessGate`). Early
        // Response on every gated path; otherwise the file-derived build
        // spec is threaded to the generation's dynamic context.
        const f3GateResult = await runF3ReadinessGate({
          chatId,
          message,
          engineChat,
          parsedMeta,
          metaPlanMode,
          metaEngineBaseVersionId,
          f3ContinuationDecision,
          previousFiles,
          attachSessionCookie,
        });
        if (f3GateResult instanceof Response) {
          return f3GateResult;
        }
        const { fileDerivedTier3BuildSpec } = f3GateResult;
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
        // Katalogval från Byggblock-panelen skickar det deterministiska
        // formatet `Lägg till byggblocket "<label>" (id: <dossier-id>)`.
        // De flesta manifest-etiketter matchar ingen vokabulär, så utan
        // id-pre-detektorn vore ett katalogval en tyst no-op (ingen
        // capability begärd → ingen dossier injicerad). Id:t slås upp mot
        // registret; okända id:n ignoreras fail-safe.
        const followUpCapabilityDetection: FollowUpCapabilityDetection =
          hasFollowUpBase && !skipIntentClassification
            ? mergeDossierIdCapabilities(
                detectFollowUpCapabilities(followUpIntentMessage),
                followUpIntentMessage,
                (id) => getDossierById(id)?.capability ?? null,
              )
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

        // Delta-brief for clear-redesign follow-ups (see
        // `runClearRedesignDeltaBriefPhase` — also writes back to
        // `parsedMeta.brief`).
        metaBrief = await runClearRedesignDeltaBriefPhase({
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
        });

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
        // The host enforces this opaque subject lease before it creates a
        // prewarm session. The digest reuses rateLimit.ts identity (verified
        // user, else trusted IP), never the rotatable guest cookie.
        const prewarmLeaseKey = createPreviewPrewarmLeaseKey(req, {
          userId: creditCheck.user?.id,
        });
        await recordFollowUpPromptLog({
          chatId,
          engineChat,
          message,
          optimizedMessage,
          system,
          meta,
          sessionId,
          creditCheck,
          metaAppProjectId,
          metaPromptAssistModel,
          metaPromptAssistDeep,
          metaPromptAssistMode,
          metaBuildIntent,
          metaBuildMethod,
          resolvedModelTier,
          resolvedImageGenerations,
          resolvedThinking,
          requestAttachments,
          promptOrchestration,
        });
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
          return runPlanModeTurn({
            chatId,
            engineChat,
            message,
            optimizedMessage,
            followUpIntentMessage,
            metaBuildIntent,
            metaScaffoldMode,
            parsedMeta,
            resolvedImageGenerations,
            resolvedModelTier,
            resolvedThinking,
            buildProfileId,
            designReferences,
            persistedScaffoldId,
            previousFiles,
            hasFollowUpBase,
            ignorePersistedScaffoldForMatch,
            promptOrchestration,
            existingRoutePaths,
            existingShellRoutePaths,
            followUpCapabilityDetection,
            followUpIntent,
            requestAttachments,
            commitCreditsOnce,
            promptStartedAt,
            req,
            attachSessionCookie,
          });
        }

        await chatRepo.addMessage(engineChat.id, "user", message);

        // PHASE B — atomic F3-marker consume at the persistence boundary
        // (see `consumeF3MarkerPhaseB` for the full contract). True when this
        // generation is a CONFIRMED approval continuation.
        const f3ApprovalBuildRound = await consumeF3MarkerPhaseB({
          f3ContinuationDecision,
          engineChat,
          chatId,
          parsedMeta,
        });

        // P2 F3-loop (åtgärd 1): the approval round must BUILD, not
        // re-propose (see `prepareF3ApprovalBuildRound`).
        const f3ApprovalRound = await prepareF3ApprovalBuildRound({
          f3ApprovalBuildRound,
          f3ContinuationDecision,
          engineChat,
          chatId,
          previousFiles,
          optimizedMessage,
          promptStartedAt,
          req,
          attachSessionCookie,
        });
        if (f3ApprovalRound instanceof Response) {
          return f3ApprovalRound;
        }
        optimizedMessage = f3ApprovalRound.optimizedMessage;
        const { f3ApprovedDossierCapabilities, f3EffectiveApprovedProviders } = f3ApprovalRound;

        return await runCodegenTurn({
          req,
          chatId,
          promptStartedAt,
          attachSessionCookie,
          engineChat,
          message,
          system,
          optimizedMessage,
          followUpIntentMessage,
          metaBuildIntent,
          metaBuildMethod,
          metaPromptSourceKind,
          metaEngineBaseVersionId,
          parsedMeta,
          metaBrief,
          hasPersistedBrief,
          resolvedModelId,
          resolvedModelTier,
          resolvedThinking,
          resolvedImageGenerations,
          buildProfileId,
          requestAttachments,
          designReferences,
          promptOrchestration,
          contractAnswerContext,
          previousFiles,
          hasFollowUpBase,
          existingRoutePaths,
          existingShellRoutePaths,
          followUpCapabilityDetection,
          followUpIntent,
          persistedScaffoldId,
          ignorePersistedScaffoldForMatch,
          f3ContinuationDecision,
          f3ApprovalBuildRound,
          f3ApprovedDossierCapabilities,
          f3EffectiveApprovedProviders,
          fileDerivedTier3BuildSpec,
          commitCreditsOnce,
          prewarmLeaseKey,
          versionsQuerySucceeded,
          existingVersionsForChat,
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
