/**
 * Init-strömmen (`POST /api/engine/chats/stream`). De två stora utgångarna och
 * prompt-loggen ligger i `create-chat-stream/` sedan 2026-08-04 (mekanisk
 * uppdelning, oförändrad publik yta):
 *   create-chat-stream/types.ts           → delade typalias
 *   create-chat-stream/prompt-log.ts      → recordCreateChatPromptLog
 *   create-chat-stream/plan-mode-path.ts  → runCreateChatPlanModePath
 *   create-chat-stream/own-engine-path.ts → runCreateChatOwnEnginePath
 *                                           (inkl. kontraktsgrinden)
 */
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import {
  runWithLlmUsageContext,
  setLlmUsageContext,
} from "@/lib/observability/llm-usage";
import { prepareCredits } from "@/lib/credits/server";
import { buildStreamErrorResponse } from "./stream-error-response";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import {
  MAX_PROMPT_HANDOFF_CHARS,
  WARN_CHAT_MESSAGE_CHARS,
  WARN_CHAT_SYSTEM_CHARS,
} from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { mergeDossierIdCapabilities } from "@/lib/builder/dossier-id-request";
import { shouldRunServerAutoBrief } from "@/lib/builder/server-auto-brief-policy";
import { tryGenerateServerAutoBrief, type BriefTrace } from "@/lib/builder/site-brief-generation";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";
import { resolveModelSelection } from "@/lib/models/selection";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { getDossierById } from "@/lib/gen/dossiers";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
import { normalizeRequestAttachments } from "@/lib/gen/request-metadata";
import { parseChatRequestMeta } from "./parse-chat-request-meta";
import { createCommitCreditsOnce } from "./credits-handler";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { createPreviewPrewarmLeaseKey } from "@/lib/gen/preview/preview-prewarm";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import { inferCapabilities } from "@/lib/gen/capability-inference";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { classifySimpleWebsitePath } from "./simple-website-path";
import { recordCreateChatPromptLog } from "./create-chat-stream/prompt-log";
import { runCreateChatPlanModePath } from "./create-chat-stream/plan-mode-path";
import { runCreateChatOwnEnginePath } from "./create-chat-stream/own-engine-path";

/** Shared create handler (SSE). Used by `POST` and by sync `POST /chats` JSON adapter. */
export async function handleCreateChatStreamPost(req: Request): Promise<Response> {
  return withRateLimit(req, "chat:create", async () =>
    // Etablerar ägarkontexten för HELA genereringen: brief, scaffold-embeddings,
    // codegen, verifier och RepairGate hamnar på rätt chat/användare utan att
    // varje mellanliggande funktion behöver bära id:n.
    runWithLlmUsageContext({}, async () => {
    const requestStartedAt = Date.now();
    const requestId = req.headers.get("x-vercel-id") || "unknown";
    const session = ensureSessionIdFromRequest(req);
    const sessionId = session.sessionId;
    setLlmUsageContext({ sessionId });
    const attachSessionCookie = (response: Response) => {
      if (session.setCookie) {
        response.headers.set("Set-Cookie", session.setCookie);
      }
      return response;
    };
    try {
      const botError = requireNotBot(req);
      if (botError) return attachSessionCookie(botError);

      const body = await req.json().catch(() => ({}));

      const validationResult = createChatSchema.safeParse(body);
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
        projectId,
        system,
        modelId = DEFAULT_MODEL_ID,
        thinking,
        imageGenerations,
        chatPrivacy,
        meta,
      } = validationResult.data;
      const requestAttachments = normalizeRequestAttachments(attachments);
      const parsedMeta = parseChatRequestMeta(meta);
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: parsedMeta.modelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });
      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;
      const metaBuildMethod = parsedMeta.buildMethod;
      const metaBuildIntent = parsedMeta.buildIntent;
      const metaPromptSourceKind = parsedMeta.promptSourceKind;
      const metaPromptSourceTechnical = parsedMeta.promptSourceTechnical;
      const metaPromptSourcePreservePayload = parsedMeta.promptSourcePreservePayload;
      const metaPlanMode = parsedMeta.planMode;
      const metaAppProjectId = parsedMeta.appProjectId;
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        attachmentsCount: requestAttachments.length,
        hardCap: MAX_PROMPT_HANDOFF_CHARS,
        promptSourceKind: metaPromptSourceKind,
        promptSourceTechnical: metaPromptSourceTechnical,
        promptSourcePreservePayload: metaPromptSourcePreservePayload,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      let optimizedMessage = promptOrchestration.finalMessage;
      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      const hasSystemPrompt = Boolean(trimmedSystemPrompt);
      const resolvedThinking =
        typeof thinking === "boolean"
          ? thinking
          : getDefaultThinkingEnabled();
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";
      if (
        message.length > WARN_CHAT_MESSAGE_CHARS ||
        optimizedMessage.length > WARN_CHAT_MESSAGE_CHARS ||
        trimmedSystemPrompt.length > WARN_CHAT_SYSTEM_CHARS
      ) {
        devLogAppend("in-progress", {
          type: "prompt.size.warning",
          messageLength: optimizedMessage.length,
          originalMessageLength: message.length,
          systemLength: trimmedSystemPrompt.length,
          warnMessageChars: WARN_CHAT_MESSAGE_CHARS,
          warnSystemChars: WARN_CHAT_SYSTEM_CHARS,
        });
      }
      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: requestAttachments.length,
      };
      const creditCheck = await prepareCredits(req, "prompt.create", creditContext, { sessionId });
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }
      // `prepareCredits` is only an eligibility check. Prewarm is deliberately
      // lease-bound by the canonical rate-limit subject (verified user, else
      // trusted IP; never the rotatable guest cookie), so an aborted stream
      // cannot repeatedly consume host install capacity before settlement.
      const prewarmLeaseKey = createPreviewPrewarmLeaseKey(req, {
        userId: creditCheck.user?.id,
      });
      // Samma identitetsform som tenant-lagret (`getRequestUserId`), så gäst-
      // förbrukning kan attribueras i stället för att bli NULL.
      setLlmUsageContext({
        userId: creditCheck.user?.id ?? `guest:${sessionId}`,
      });
      optimizedMessage = await appendHydratedTextAttachmentExcerpts(
        optimizedMessage,
        requestAttachments,
        { signal: req.signal },
      );

      const clientBriefFromMeta = parsedMeta.brief;
      const assistModelHint = parsedMeta.promptAssistModel;

      // Fast pre-match: keyword-only scaffold + variant (~1ms) to give Brief-LLM design hints.
      // Intentionally NOT pickScaffoldVariantAsync — that would add a +500ms OpenAI embedding
      // round-trip just for hint generation.
      // The picked preMatchVariant.id is later passed as orchestrationInput.persistedVariantId
      // so the same variant is reused by finalizeOrchestrationPrompts (no async re-pick), keeping
      // brief-LLM hints and codegen aligned.
      // Only runs when scaffoldMode is not "off" — if off, resolveOrchestrationBase will
      // also skip scaffold selection, so we should not inject stale variant hints.
      const scaffoldModeIsOff = parsedMeta.scaffoldMode === "off";
      const preMatchScaffold = scaffoldModeIsOff
        ? null
        : parsedMeta.scaffoldId
          ? getScaffoldById(parsedMeta.scaffoldId)
          : matchScaffold(message, metaBuildIntent as BuildIntent | null);
      const preMatchVariant = preMatchScaffold
        ? pickScaffoldVariant({
            prompt: message,
            scaffoldId: preMatchScaffold.id,
            // Byggval (init controls): structured style keywords steer the
            // keyword pre-match so brief hints and the pinned variant agree
            // with the user's chosen style.
            styleKeywords: parsedMeta.styleKeywordsHint.length
              ? parsedMeta.styleKeywordsHint
              : undefined,
          })
        : null;
      const variantHints = buildVariantHintsForBrief(preMatchScaffold, preMatchVariant);
      const variantHintsText = variantHints
        ? formatVariantHintsForPrompt(variantHints)
        : undefined;
      const initCapabilities = inferCapabilities(message);
      const initCapabilityDetection = mergeDossierIdCapabilities(
        detectFollowUpCapabilities(message, { mode: "init" }),
        message,
        (id) => getDossierById(id)?.capability ?? null,
      );
      const simpleWebsitePath = classifySimpleWebsitePath({
        generationMode: "init",
        planMode: Boolean(metaPlanMode),
        hasClientBrief: Boolean(clientBriefFromMeta),
        attachmentsCount: requestAttachments.length,
        hasCustomSystem: hasSystemPrompt,
        promptSourceTechnical: metaPromptSourceTechnical,
        promptSourcePreservePayload: metaPromptSourcePreservePayload,
        buildIntent:
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website",
        promptStrategyMeta: strategyMeta,
        prompt: message,
        preMatchScaffold,
        capabilities: initCapabilities,
        requestedDossierCapabilities: initCapabilityDetection.capabilityIds,
      });
      devLogAppend("in-progress", {
        type: "orchestration.simple_website_path",
        enabled: simpleWebsitePath.enabled,
        reason: simpleWebsitePath.reason,
        scaffoldId: simpleWebsitePath.scaffoldId,
      });

      let serverAutoBrief: Record<string, unknown> | null = null;
      let serverAutoBriefModel: string | null = null;
      let serverAutoBriefTrace: BriefTrace | null = null;
      if (
        !simpleWebsitePath.enabled &&
        shouldRunServerAutoBrief({
          hasClientBrief: Boolean(clientBriefFromMeta),
          promptSourceTechnical: metaPromptSourceTechnical,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
          promptType: strategyMeta.promptType,
          orchestrationReason: strategyMeta.reason,
          prompt: message,
          buildIntent: metaBuildIntent,
        })
      ) {
        const autoBriefStartedAt = Date.now();
        const generated = await tryGenerateServerAutoBrief({
          prompt: message,
          modelTier: resolvedModelTier,
          assistModelHint,
          imageGenerations: resolvedImageGenerations,
          signal: req.signal,
          variantHints: variantHintsText,
        });
        if (generated) {
          serverAutoBrief = generated.brief;
          serverAutoBriefModel = generated.modelUsed;
          serverAutoBriefTrace = generated.trace;
          debugLog("orchestration", "Server auto brief applied", {
            durationMs: Date.now() - autoBriefStartedAt,
            modelUsed: serverAutoBriefModel,
            traceId: serverAutoBriefTrace.traceId,
            promptHash: serverAutoBriefTrace.promptHash,
            pages: Array.isArray(serverAutoBrief?.pages) ? serverAutoBrief.pages.length : 0,
          });
          devLogAppend("in-progress", {
            type: "orchestration.server_auto_brief",
            status: "applied",
            source: serverAutoBriefTrace.source,
            model: serverAutoBriefModel,
            traceId: serverAutoBriefTrace.traceId,
            promptHash: serverAutoBriefTrace.promptHash,
            durationMs: Date.now() - autoBriefStartedAt,
            pages: Array.isArray(serverAutoBrief?.pages) ? serverAutoBrief.pages.length : 0,
          });
        } else {
          debugLog("orchestration", "Server auto brief skipped or returned empty", {
            durationMs: Date.now() - autoBriefStartedAt,
          });
          devLogAppend("in-progress", {
            type: "orchestration.server_auto_brief",
            status: "skipped_or_empty",
            durationMs: Date.now() - autoBriefStartedAt,
          });
        }
      }
      const effectiveBrief = clientBriefFromMeta ?? serverAutoBrief;
      const briefQuality: "full" | "server-auto" | "none" = (() => {
        const clientQuality = clientBriefFromMeta?.briefQuality;
        if (clientQuality === "full" || clientQuality === "server-auto") return clientQuality;
        if (serverAutoBrief) return "server-auto";
        return "none";
      })();

      const creditUser = creditCheck.user;
      const commitCreditsOnce = createCommitCreditsOnce(creditCheck);

      await recordCreateChatPromptLog({
        meta,
        strategyMeta,
        serverAutoBrief,
        serverAutoBriefModel,
        serverAutoBriefTrace,
        briefQuality,
        creditUser,
        sessionId,
        metaAppProjectId,
        projectId,
        message,
        optimizedMessage,
        trimmedSystemPrompt,
        parsedMeta,
        metaBuildIntent,
        metaBuildMethod,
        resolvedModelTier,
        resolvedImageGenerations,
        resolvedThinking,
        requestAttachments,
      });

      const buildProfileId = getBuildProfileId(resolvedModelTier);
      debugLog("build", "Chat stream request", {
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        internalModelSelection: resolvedModelTier,
        enginePath: "own-engine",
        engineModel: canonicalModelIdToOwnModelId(resolvedModelTier),
        promptLength: optimizedMessage.length,
        originalPromptLength: message.length,
        attachments: requestAttachments.length,
        systemProvided: hasSystemPrompt,
        systemApplied: hasSystemPrompt,
        systemIgnored: false,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        chatPrivacy: resolvedChatPrivacy,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
      });
      devLogStartNewSite({
        message: optimizedMessage,
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
        slug: metaBuildMethod || metaBuildIntent || undefined,
      });
      devLogAppend("in-progress", {
        type: "comm.request.create",
        modelId: resolvedModelId,
        modelTier: resolvedModelTier,
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        chatPrivacy: resolvedChatPrivacy,
        buildIntent: metaBuildIntent,
        buildMethod: metaBuildMethod,
        message: optimizedMessage,
        slug: metaBuildMethod || metaBuildIntent || undefined,
        promptType: strategyMeta.promptType,
        // Plan 03 (short): mirror promptSource into the init devlog so
        // observability gets the same auto-repair vs user discriminator
        // on init as it does on follow-ups (init is always "user" today
        // since autofix only fires on existing chats, but we surface the
        // field uniformly).
        promptSource: strategyMeta.promptSource,
        promptStrategy: strategyMeta.strategy,
        promptBudgetTarget: strategyMeta.budgetTarget,
        originalLength: strategyMeta.originalLength,
        optimizedLength: strategyMeta.optimizedLength,
        reductionRatio: strategyMeta.reductionRatio,
        strategyReason: strategyMeta.reason,
        attachmentsCount: requestAttachments.length,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
      });
      debugLog("orchestration", "Create chat prompt assist + strategy (request meta)", {
        promptAssistModel: parsedMeta.promptAssistModel,
        promptAssistDeep: parsedMeta.promptAssistDeep,
        promptAssistMode: parsedMeta.promptAssistMode,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
      });

      // ── Plan Mode Path ────────────────────────────────────────────────
      if (metaPlanMode) {
        return runCreateChatPlanModePath({
          req,
          attachSessionCookie,
          sessionId,
          requestStartedAt,
          resolvedModelTier,
          resolvedThinking,
          metaBuildIntent,
          parsedMeta,
          message,
          optimizedMessage,
          initCapabilities,
          initCapabilityDetection,
          effectiveBrief,
          trimmedSystemPrompt,
          preMatchVariant,
          strategyMeta,
          requestAttachments,
          metaAppProjectId,
          projectId,
          buildProfileId,
          commitCreditsOnce,
        });
      }

      // ── Own Engine Path ───────────────────────────────────────────────
      return runCreateChatOwnEnginePath({
        req,
        attachSessionCookie,
        sessionId,
        requestStartedAt,
        metaBuildIntent,
        parsedMeta,
        message,
        optimizedMessage,
        initCapabilityDetection,
        effectiveBrief,
        trimmedSystemPrompt,
        preMatchVariant,
        simpleWebsitePath,
        strategyMeta,
        requestAttachments,
        metaAppProjectId,
        projectId,
        resolvedModelTier,
        resolvedThinking,
        resolvedImageGenerations,
        resolvedChatPrivacy,
        buildProfileId,
        prewarmLeaseKey,
        commitCreditsOnce,
      });
    } catch (err) {
      return buildStreamErrorResponse({
        err,
        req,
        requestId,
        promptStartedAt: requestStartedAt,
        kind: "init",
        logLabel: "Create chat error",
        devLogType: "comm.error.create",
        attachSessionCookie,
      });
    }
    }),
  );
}
