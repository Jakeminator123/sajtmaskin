/**
 * Own Engine-vägen i init-strömmen (inklusive kontraktsgrinden). Extraherad
 * verbatim ur `create-chat-stream-post.ts` — samma grenar, ordning, tidiga
 * returer och sidoeffekter; bara indenteringen är justerad.
 */
import { NextResponse } from "next/server";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import type { mergeDossierIdCapabilities } from "@/lib/builder/dossier-id-request";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { buildContractClarificationQuestion, buildStoredContractClarificationUiPart } from "@/lib/gen/contract/clarification";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { prewarmPreviewSession } from "@/lib/gen/preview/preview-prewarm";
import type { createPreviewPrewarmLeaseKey } from "@/lib/gen/preview/preview-prewarm";
import { summarizeDesignReferences } from "@/lib/gen/request-metadata";
import type { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import { compressUrls } from "@/lib/gen/url-compress";
import { MODEL_LABELS } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { resolveEngineModelId } from "@/lib/models/selection";
import {
  attachChatToPendingUsage,
  setLlmUsageContext,
} from "@/lib/observability/llm-usage";
import { wrapStreamForPromptToDoneMetric } from "@/lib/observability/prompt-to-done-stream";
import {
  buildOwnEngineGenerationStreamMeta,
  buildPreGenerationContractGateParams,
} from "@/lib/own-engine/session/own-engine-build-session";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import { createSSEHeaders } from "@/lib/streaming";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { buildEngineStreamResponse } from "../stream-error-response";
import { resolveConfiguredEnvKeys } from "../configured-env-keys";
import type { SimpleWebsitePathDecision } from "../simple-website-path";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import type {
  CreateChatBuildProfileId,
  CreateChatCommitCredits,
  CreateChatModelTier,
  CreateChatPrivacy,
  CreateChatRequestAttachments,
  CreateChatRequestData,
  CreateChatStrategyMeta,
} from "./types";

export async function runCreateChatOwnEnginePath(params: {
  req: Request;
  attachSessionCookie: (response: Response) => Response;
  sessionId: string;
  requestStartedAt: number;
  metaBuildIntent: ParsedChatRequestMeta["buildIntent"];
  parsedMeta: ParsedChatRequestMeta;
  message: string;
  optimizedMessage: string;
  initCapabilityDetection: ReturnType<typeof mergeDossierIdCapabilities>;
  effectiveBrief: Record<string, unknown> | null;
  trimmedSystemPrompt: string;
  preMatchVariant: ReturnType<typeof pickScaffoldVariant> | null;
  simpleWebsitePath: SimpleWebsitePathDecision;
  strategyMeta: CreateChatStrategyMeta;
  requestAttachments: CreateChatRequestAttachments;
  metaAppProjectId: ParsedChatRequestMeta["appProjectId"];
  projectId: CreateChatRequestData["projectId"];
  resolvedModelTier: CreateChatModelTier;
  resolvedThinking: boolean;
  resolvedImageGenerations: boolean;
  resolvedChatPrivacy: CreateChatPrivacy;
  buildProfileId: CreateChatBuildProfileId;
  prewarmLeaseKey: ReturnType<typeof createPreviewPrewarmLeaseKey>;
  commitCreditsOnce: CreateChatCommitCredits;
}): Promise<Response> {
  const {
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
  } = params;

  let engineIntent: BuildIntent =
    metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
      ? (metaBuildIntent as BuildIntent)
      : "website";
  if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
    engineIntent = "app";
  }
  const metaScaffoldMode = parsedMeta.scaffoldMode;
  const metaScaffoldId = parsedMeta.scaffoldId;
  const metaThemeColors = parsedMeta.themeColors;
  const metaBrief = effectiveBrief;
  const metaDesignThemePreset = parsedMeta.designThemePreset;
  const metaPalette = parsedMeta.palette;
  const designReferences = summarizeDesignReferences(requestAttachments);

  const engineModel = resolveEngineModelId(resolvedModelTier);
  // MB-3: the actual codegen + telemetry model is the generator-phase
  // model (manifest phaseRouting). In the current default config it equals
  // `engineModel` on every tier (the anthropic tier's build-default is now
  // Claude Opus 4.8 too after Sonnet was retired 2026-06-28). We keep
  // `engineModel` for `chat.model` so repair/server-verify can round-trip
  // the tier from it via ownModelIdToCanonicalModelId.
  const generatorModel = resolvePhaseModel(resolvedModelTier, "generator").modelId;

  // Resolved here (and reused below for `createChat`) because the
  // orchestration input needs the project's stored env keys — see
  // `configuredEnvKeys` further down. Tenant-checked, so a foreign
  // project id resolves to null and contributes no keys.
  const projectIdForChat = await resolveAppProjectIdForRequest(
    req,
    { appProjectId: metaAppProjectId, projectId },
    { sessionId },
  );
  // Restlistan R6: init körs ofta på ett projekt som redan har sparade
  // nycklar (ny chat i samma projekt), så en tom mängd ljög om
  // `configured` och lät Kopplade byggblock rendera sin okonfigurerade
  // placeholder-UI. Läs projektets env-karta i stället — men aldrig
  // `undefined`, som skulle falla tillbaka på plattformens process.env.
  const configuredEnvKeys = await resolveConfiguredEnvKeys(projectIdForChat);

  const orchestrationInput = {
    prompt: optimizedMessage,
    rawPrompt: message,
    // Bug 07#1 (2026-04-22 audit): init tappade tidigare alla rå-prompt-
    // fält som follow-up skickar explicit. Det innebar att route-plan,
    // build-spec och contract-inferens i init gick på `optimizedMessage`
    // (wrappat med filkontext, guidance, templates) medan follow-up gick
    // på rå `message`. Samma användaravsikt kunde därför få olika
    // BuildSpec/route/contract-beslut beroende på mode. Spegla follow-
    // upens rå-källor så signalerna blir konsekventa.
    routePlanPrompt: message,
    buildSpecPrompt: message,
    contractsPrompt: message,
    scaffoldMatchPrompt: message,
    // QW-1: capability inference (needsAuth/needsEcommerce/needsCharts…)
    // är keyword-baserad. Använd rå user-message så bifogade text-utdrag
    // (PDFs/.docx) inte triggar capabilities som skuggar prompt-intent.
    capabilitiesPrompt: message,
    requestedDossierCapabilities: initCapabilityDetection.capabilityIds,
    requestedCapabilityTiers: initCapabilityDetection.tierByCapability,
    buildIntent: engineIntent,
    scaffoldMode: metaScaffoldMode,
    scaffoldId: metaScaffoldId,
    // Byggval (init controls): structured hints — page count wins over
    // prompt-text regex in buildRoutePlan; style keywords merge into
    // scaffold-variant matching; complexity biases BuildSpec.
    pageCountHint: parsedMeta.pageCountHint,
    styleKeywordsHint: parsedMeta.styleKeywordsHint.length
      ? parsedMeta.styleKeywordsHint
      : undefined,
    complexityHint: parsedMeta.complexityHint,
    brief: metaBrief,
    themeColors: metaThemeColors,
    imageGenerations: resolvedImageGenerations,
    componentPalette: metaPalette,
    designThemePreset: metaDesignThemePreset,
    designReferences,
    customInstructions: trimmedSystemPrompt || undefined,
    promptStrategyMeta: strategyMeta,
    // Lock variant to the pre-match pick so brief-LLM hints (variantHints
    // built above) and the final codegen variant agree. Without this the
    // async embedding-driven picker in finalizeOrchestrationPrompts can
    // land on a different variant after brief is ready, causing
    // brief→codegen drift. If preMatchVariant is null, async picker runs.
    // getVariantById fallback in orchestrate.ts re-picks if id is stale.
    persistedVariantId: preMatchVariant?.id ?? null,
    embeddingScaffoldMatch: !simpleWebsitePath.enabled,
    simpleWebsitePath: simpleWebsitePath.enabled,
    // Q5a + MB-3: pass the generator-phase model id so deriveBuildSpec
    // scales tokenBudgets to the context window of the model that
    // actually generates (e.g. Opus 4.8's larger window on the anthropic
    // tier), not the tier build-default.
    engineModelId: generatorModel,
    configuredEnvKeys,
  };
  const orchestrationStartedAt = Date.now();
  const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
  debugLog("orchestration", "Orchestration base resolved", {
    durationMs: Date.now() - orchestrationStartedAt,
    qualityTarget: orchestrationBase.buildSpec.qualityTarget,
    contextPolicy: orchestrationBase.buildSpec.contextPolicy,
    scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
    serializeMode: orchestrationBase.serializeMode,
    routeCount: orchestrationBase.routePlan.routes.length,
  });
  devLogAppend("in-progress", {
    type: "orchestration.resolved",
    scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
    serializeMode: orchestrationBase.serializeMode,
    qualityTarget: orchestrationBase.buildSpec.qualityTarget,
    contextPolicy: orchestrationBase.buildSpec.contextPolicy,
  });
  const {
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    capabilities: engineCapabilities,
  } = orchestrationBase;
  const contractClarification = buildContractClarificationQuestion({
    buildIntent: engineIntent,
    context: preGenerationContracts,
  });

  debugLog("engine", "Own engine model resolved", {
    resolvedModelTier,
    engineModel,
    generatorModel,
    fallback: false,
  });

  if (!projectIdForChat) {
    return attachSessionCookie(
      NextResponse.json(
        {
          error:
            "Own-engine generation requires a valid app project id. Create or resolve a project before retrying.",
        },
        { status: 400 },
      ),
    );
  }
  if (contractClarification) {
    const contractGateDbStartedAt = Date.now();
    // No scaffold id on the gate-only exit: the match was made on an
    // INCOMPLETE prompt, and a pinned `scaffold_id` would make the
    // answering turn read it as `persistedScaffoldId` and skip the
    // rematch — the first, unfinished guess would stick for the whole
    // chat. The scaffold is persisted first when a round actually
    // generates (own-engine path below / `codegen-turn.ts`).
    const engineChat = await chatRepo.createChat(
      projectIdForChat,
      engineModel,
    );
    await chatRepo.addMessage(engineChat.id, "user", message);
    setLlmUsageContext({ chatId: engineChat.id });
    attachChatToPendingUsage(sessionId, engineChat.id);
    debugLog("engine", "Chat DB bootstrap complete", {
      durationMs: Date.now() - contractGateDbStartedAt,
      mode: "pre-generation-contract-gate",
      chatId: engineChat.id,
    });
    devLogAppend("in-progress", {
      type: "site.chatId",
      chatId: engineChat.id,
    });
    devLogAppend("in-progress", {
      type: "contracts.inferred",
      chatId: engineChat.id,
      dataMode: preGenerationContracts.contracts.dataMode,
      databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
      authProvider: preGenerationContracts.contracts.authProvider ?? null,
      paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
      integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
      envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
      unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
    });
    const assistantQuestion = await chatRepo.addMessage(
      engineChat.id,
      "assistant",
      contractClarification.question,
      undefined,
      [buildStoredContractClarificationUiPart(contractClarification)],
    ).catch(() => null);
    devLogAppend("in-progress", {
      type: "contracts.clarification-requested",
      chatId: engineChat.id,
      kind: contractClarification.kind,
      reason: contractClarification.reason,
    });
    const contractGateStream = createPreGenerationContractGateReadableStream(
      buildPreGenerationContractGateParams({
        routeVariant: "new-chat",
        sseChatId: engineChat.id,
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
        strategyMeta,
        buildSpec: orchestrationBase.buildSpec,
        metaBriefApplied: Boolean(metaBrief),
        customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
        chatPrivacy: resolvedChatPrivacy,
        scaffoldLabel: resolvedScaffold?.label ?? null,
        capabilities: engineCapabilities,
      }),
    );
    debugLog("engine", "Create chat pre-stream complete", {
      durationMs: Date.now() - requestStartedAt,
      mode: "pre-generation-contract-gate",
      chatId: engineChat.id,
    });
    return attachSessionCookie(new Response(
      wrapStreamForPromptToDoneMetric(contractGateStream, {
        kind: "init",
        promptStartedAt: requestStartedAt,
        signal: req.signal,
        chatId: engineChat.id,
      }),
      { headers: createSSEHeaders() },
    ));
  }
  const finalizePromptStartedAt = Date.now();
  const finalized = await finalizeOrchestrationPrompts(orchestrationBase, orchestrationInput);
  const { engineSystemPrompt } = finalized;
  debugLog("orchestration", "System prompt finalized", {
    durationMs: Date.now() - finalizePromptStartedAt,
    routeCount: orchestrationBase.routePlan.routes.length,
    qualityTarget: orchestrationBase.buildSpec.qualityTarget,
    contextPolicy: orchestrationBase.buildSpec.contextPolicy,
    scaffoldVariant: finalized.variantId,
  });
  if (finalized.variantId) {
    devLogAppend("in-progress", {
      type: "orchestration.styleDirection",
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
    route: "POST /api/engine/chats/stream",
    planMode: false,
  });
  const promptLengths = getSystemPromptLengths(engineSystemPrompt);
  debugLog("prompt-cache", "System prompt lengths", promptLengths);

  const engineChatDbStartedAt = Date.now();
  const engineChat = await chatRepo.createChat(
    projectIdForChat,
    engineModel,
    engineSystemPrompt,
    resolvedScaffold?.id,
  );
  await chatRepo.addMessage(engineChat.id, "user", message);
  setLlmUsageContext({ chatId: engineChat.id });
  // Brief och scaffold-embeddings kördes innan chatten fanns — claima dem.
  attachChatToPendingUsage(sessionId, engineChat.id);
  debugLog("engine", "Chat DB bootstrap complete", {
    durationMs: Date.now() - engineChatDbStartedAt,
    mode: "own-engine",
    chatId: engineChat.id,
  });
  devLogAppend("in-progress", {
    type: "site.chatId",
    chatId: engineChat.id,
  });
  // Preview prewarm (FEATURES.previewPrewarm, default OFF): this is the
  // primary init/create path — the chat is created, credits already
  // passed the `prompt.create` gate above, and heavy codegen streaming is
  // about to start. Warm the preview host now so `npm install` overlaps
  // LLM streaming. Orchestration has already resolved above, so pass the
  // selected scaffold id — the skeleton's `package.json` is built from
  // that scaffold's own dependencies instead of the generic baseline
  // (higher fingerprint-hit rate at finalize). Fire-and-forget +
  // self-gating (flag / tier-2 / dedup); never blocks or throws. Only the
  // own-engine generation path reaches here (plan-mode and the
  // contract-clarification gate return earlier and do not generate a
  // site yet). See src/lib/gen/preview/preview-prewarm.ts.
  void prewarmPreviewSession(engineChat.id, {
    leaseKey: prewarmLeaseKey,
    scaffoldId: resolvedScaffold?.id ?? null,
  });
  devLogAppend("in-progress", {
    type: "contracts.inferred",
    chatId: engineChat.id,
    dataMode: preGenerationContracts.contracts.dataMode,
    databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
    authProvider: preGenerationContracts.contracts.authProvider ?? null,
    paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
    integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
    envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
    unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
  });
  const compressUrlsStartedAt = Date.now();
  const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
  debugLog("engine", "Prompt URL compression complete", {
    durationMs: Date.now() - compressUrlsStartedAt,
    originalPromptLength: optimizedMessage.length,
    compressedPromptLength: enginePrompt.length,
    compressedUrlCount: Object.keys(urlMap).length,
    chatId: engineChat.id,
  });
  const generatorThinking = resolvePhaseThinking(resolvedModelTier, "generator");
  const effectiveGeneratorThinking =
    resolvedThinking && generatorThinking.thinking;
  const engineStream = createOwnEnginePipelineAndGenerationStream({
    chatId: engineChat.id,
    resolvedTier: resolvedModelTier,
    // F2-init must NEVER surface env-var prompts in chat. Tier-3 env
    // input belongs in the F3 ("Bygg integrationer") flow, which goes
    // through `chat-message-stream-post.ts` with
    // `meta.lifecycleStage: "integrations"` and gates the tools there.
    includeIntegrationSignals: false,
    pipeline: {
      prompt: enginePrompt,
      systemPrompt: engineSystemPrompt,
      model: generatorModel,
      thinking: effectiveGeneratorThinking,
      abortSignal: req.signal,
      maxSteps: resolveOwnEngineMaxSteps({
        buildSpec: orchestrationBase.buildSpec,
        userMessage: message,
        isFollowUp: false,
      }),
      referenceAttachments: [
        ...finalized.variantTemplateReferenceAttachments,
        ...requestAttachments,
      ],
    },
    meta: buildOwnEngineGenerationStreamMeta({
      routeVariant: "new-chat",
      chatPrivacy: resolvedChatPrivacy,
      scaffoldLabel: resolvedScaffold?.label ?? null,
      engineModel: generatorModel,
      resolvedModelTier,
      buildProfileId,
      buildProfileLabel: MODEL_LABELS[resolvedModelTier],
      resolvedThinking: effectiveGeneratorThinking,
      resolvedImageGenerations,
      strategyMeta,
      orchestrationBase,
      buildSpec: orchestrationBase.buildSpec,
      engineSystemPromptLength: engineSystemPrompt.length,
      metaBriefApplied: Boolean(metaBrief),
      customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
      scaffoldId: resolvedScaffold?.id ?? null,
      variantId: finalized.variantId,
    }),
    engineModel: generatorModel,
    optimizedMessage,
    rawPrompt: message,
    engineIntent,
    buildSpec: orchestrationBase.buildSpec,
    routePlan: routePlan ?? null,
    orchestrationContract: orchestrationBase.orchestrationContract,
    resolvedScaffold: resolvedScaffold ?? null,
    lineageHash,
    urlMap,
    commitCredits: commitCreditsOnce,
  });

  debugLog("engine", "Create chat pre-stream complete", {
    durationMs: Date.now() - requestStartedAt,
    mode: "own-engine",
    chatId: engineChat.id,
  });
  return buildEngineStreamResponse({
    engineStream,
    req,
    promptStartedAt: requestStartedAt,
    kind: "init",
    attachSessionCookie,
    chatId: engineChat.id,
  });
}
