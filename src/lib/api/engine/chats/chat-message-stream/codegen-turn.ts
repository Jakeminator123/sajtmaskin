/**
 * Codegen turn of the follow-up stream handler: request-kind short-circuit,
 * orchestration resolve, contract-clarification gate, prompt finalization and
 * the own-engine pipeline/generation stream. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import type { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract/clarification";
import type { collectConfirmedContractAnswers } from "@/lib/gen/contract/answer-context";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import type { CodeFile } from "@/lib/gen/parser";
import type { createPreviewPrewarmLeaseKey } from "@/lib/gen/preview/preview-prewarm";
import { prewarmPreviewSession } from "@/lib/gen/preview/preview-prewarm";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { classifyRequestKind } from "@/lib/gen/request-kind";
import type {
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import { compressUrls } from "@/lib/gen/url-compress";
import type { Tier3BuildSpec } from "@/lib/integrations/tier3-build-spec";
import { devLogAppend, devLogStartGeneration } from "@/lib/logging/devLog";
import type { BuildProfileId, CanonicalModelId } from "@/lib/models/catalog";
import { canonicalModelIdToOwnModelId, MODEL_LABELS } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { resolveEngineModelId } from "@/lib/models/selection";
import { wrapStreamForPromptToDoneMetric } from "@/lib/observability/prompt-to-done-stream";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";
import {
  buildOwnEngineGenerationStreamMeta,
  buildPreGenerationContractGateParams,
} from "@/lib/own-engine/session/own-engine-build-session";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import { createSSEHeaders } from "@/lib/streaming";
import { debugLog } from "@/lib/utils/debug";
import { buildEngineStreamResponse } from "../stream-error-response";
import type { createCommitCreditsOnce } from "../credits-handler";
import { buildFollowUpOrchestrationInput } from "../follow-up-orchestration-input";
import { buildBoundedChatHistory } from "../follow-up-history";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import type { F3ContinuationDecision } from "./f3-continuation-phase";
import {
  buildQaShortCircuitStream,
  generateQaShortCircuitText,
} from "./qa-short-circuit";

/** Runs the codegen turn end-to-end and returns the streaming Response. */
export async function runCodegenTurn(params: {
  req: Request;
  chatId: string;
  promptStartedAt: number;
  attachSessionCookie: (response: Response) => Response;
  engineChat: ChatWithMessages;
  message: string;
  system: string | undefined;
  optimizedMessage: string;
  followUpIntentMessage: string;
  metaBuildIntent: string | null;
  metaBuildMethod: string | null;
  metaPromptSourceKind: string | null;
  metaEngineBaseVersionId: string | null;
  parsedMeta: ParsedChatRequestMeta;
  metaBrief: Record<string, unknown> | null;
  hasPersistedBrief: boolean;
  resolvedModelId: CanonicalModelId;
  resolvedModelTier: CanonicalModelId;
  resolvedThinking: boolean;
  resolvedImageGenerations: boolean;
  buildProfileId: BuildProfileId;
  requestAttachments: ReturnType<typeof normalizeRequestAttachments>;
  designReferences: ReturnType<typeof summarizeDesignReferences>;
  promptOrchestration: ReturnType<typeof orchestratePromptMessage>;
  contractAnswerContext: ReturnType<typeof collectConfirmedContractAnswers>;
  previousFiles: CodeFile[];
  hasFollowUpBase: boolean;
  existingRoutePaths: string[];
  existingShellRoutePaths: string[];
  followUpCapabilityDetection: FollowUpCapabilityDetection;
  followUpIntent: FollowUpIntentMode;
  persistedScaffoldId: string | null;
  /** Chat started from a verbatim repo import (`edit_kind="imported_repo"`). */
  importedRepoMode: boolean;
  ignorePersistedScaffoldForMatch: boolean;
  f3ContinuationDecision: F3ContinuationDecision | null;
  f3ApprovalBuildRound: boolean;
  f3ApprovedDossierCapabilities: string[];
  f3EffectiveApprovedProviders: string[];
  fileDerivedTier3BuildSpec: Tier3BuildSpec | null;
  commitCreditsOnce: ReturnType<typeof createCommitCreditsOnce>;
  prewarmLeaseKey: ReturnType<typeof createPreviewPrewarmLeaseKey>;
  versionsQuerySucceeded: boolean;
  existingVersionsForChat: Awaited<ReturnType<typeof chatRepo.getVersionsByChat>>;
}): Promise<Response> {
  const {
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
    importedRepoMode,
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
  } = params;
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
  // fix-isconfigured: resolve the project's stored env keys so the
  // hard-dossier `configured` prompt signal reflects the PROJECT'S env,
  // not the platform process.env. `getStoredProjectEnvVarMap` only
  // returns keys with a real (non-empty, decryptable) value.
  const configuredEnvKeys = engineChat.project_id
    ? new Set(
        Object.keys(
          await getStoredProjectEnvVarMap(engineChat.project_id).catch(
            () => ({}) as Record<string, string>,
          ),
        ),
      )
    : new Set<string>();
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
    importedRepoMode,
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
    // Durable (fix 5a): includes the persisted-approval fallback when
    // the marker itself carried zero providers.
    approvedProviders:
      f3ApprovalBuildRound && f3EffectiveApprovedProviders.length > 0
        ? f3EffectiveApprovedProviders
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
    configuredEnvKeys,
    tier3BuildSpec: fileDerivedTier3BuildSpec,
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
  // Imported-repo chats never persist a scaffold id — the repo is the
  // project, and a pinned scaffold would poison every later follow-up.
  if (
    resolvedScaffold &&
    !importedRepoMode &&
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
  // Preview prewarm (FEATURES.previewPrewarm, default OFF): fire ONLY here,
  // where real codegen is about to start — every non-generating early
  // return (plan mode, contract clarification, 409 guard, credit gate) is
  // already behind us, so a plan-only/clarification-only request never
  // boots a VM or burns the dedup slot. Gated on a CONFIRMED-empty version
  // query (`versionsQuerySucceeded`): a follow-up whose lookup merely
  // threw is never mistaken for a new chat (that would restart its warm
  // workspace). The primary init flow is prewarmed in
  // create-chat-stream-post.ts; this covers the versionless first
  // generation (e.g. after the create-path contract-gate). Fire-and-forget
  // + self-gating (flag / tier-2 / dedup). `hasFollowUpBase` is the
  // authoritative file-backed guard; even an inconsistent empty version
  // list must not prewarm an established follow-up workspace.
  if (
    !hasFollowUpBase &&
    versionsQuerySucceeded &&
    existingVersionsForChat.length === 0
  ) {
    void prewarmPreviewSession(chatId, { leaseKey: prewarmLeaseKey });
  }
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
}
