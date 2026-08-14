import { isPromptAssistOff, resolvePromptAssistProvider } from "@/lib/builder/prompt-assist";
import { resolveCanonicalLivePreviewUrlFromPreviewReadyPayload } from "@/lib/api/preview-url-contract";
import { toast } from "sonner";
import {
  appendModelInfoPart,
  appendPromptStrategyPart,
  appendToolPartToMessage,
  buildStreamErrorMessage,
  updateCreateChatLockChatId,
} from "./helpers";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";

type LifecycleDeps = {
  appendProgressPart: (
    step: string,
    phase: string,
    payload?: Record<string, unknown>,
  ) => void;
  deliverPreviewUrl: (url: string | null | undefined, versionId: string | null) => void;
};

export function handleMetaEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
) {
  const meta = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const paModel = ctx.promptAssistModel ?? null;
  appendModelInfoPart(ctx.setMessages, ctx.assistantMessageId, {
    modelId: (meta.modelId as string) ?? ctx.selectedModelTier,
    modelTier:
      (typeof meta.modelTier === "string" && meta.modelTier) || ctx.selectedModelTier || null,
    buildProfileId:
      typeof meta.buildProfileId === "string" ? meta.buildProfileId : null,
    buildProfileLabel:
      typeof meta.buildProfileLabel === "string" ? meta.buildProfileLabel : null,
    enginePath: typeof meta.enginePath === "string" ? meta.enginePath : null,
    thinking: typeof meta.thinking === "boolean" ? meta.thinking : null,
    imageGenerations:
      typeof meta.imageGenerations === "boolean" ? meta.imageGenerations : null,
    chatPrivacy: typeof meta.chatPrivacy === "string" ? meta.chatPrivacy : null,
    promptAssistProvider: paModel
      ? (isPromptAssistOff(paModel) ? "off" : resolvePromptAssistProvider(paModel))
      : null,
    promptAssistModel: paModel,
    promptAssistDeep: ctx.promptAssistDeep ?? null,
    scaffoldId: typeof meta.scaffoldId === "string" ? meta.scaffoldId : null,
    scaffoldLabel: typeof meta.scaffoldLabel === "string" ? meta.scaffoldLabel : null,
    capabilities: meta.capabilities && typeof meta.capabilities === "object" ? meta.capabilities as Record<string, boolean> : null,
    mutedCapabilityLabels: Array.isArray(meta.mutedCapabilityLabels)
      ? (meta.mutedCapabilityLabels as string[])
      : null,
    fileEvidenceCapabilities: Array.isArray(meta.fileEvidenceCapabilities)
      ? (meta.fileEvidenceCapabilities as string[])
      : null,
    contractDataMode:
      typeof meta.contractDataMode === "string" ? meta.contractDataMode : null,
    contractDatabaseProvider:
      typeof meta.contractDatabaseProvider === "string" ? meta.contractDatabaseProvider : null,
    contractAuthProvider:
      typeof meta.contractAuthProvider === "string" ? meta.contractAuthProvider : null,
    contractPaymentProvider:
      typeof meta.contractPaymentProvider === "string" ? meta.contractPaymentProvider : null,
    contractIntegrations:
      Array.isArray(meta.contractIntegrations)
        ? (meta.contractIntegrations as Array<{ provider?: string; name?: string; status?: string; envVars?: string[] }>)
        : null,
    contractEnvVars:
      Array.isArray(meta.contractEnvVars)
        ? (meta.contractEnvVars as Array<{ key?: string; reason?: string; required?: boolean }>)
        : null,
    unresolvedContractDecisions:
      Array.isArray(meta.unresolvedContractDecisions)
        ? (meta.unresolvedContractDecisions as Array<{ kind?: string; reason?: string } | string>)
        : null,
  });
  
  const promptStrategy =
    meta.promptStrategy === "direct" ||
    meta.promptStrategy === "phase_plan_build_refine" ||
    meta.promptStrategy === "preserved"
      ? meta.promptStrategy
      : null;
  const promptType =
    meta.promptType === "audit" ||
    meta.promptType === "wizard" ||
    meta.promptType === "freeform" ||
    meta.promptType === "template" ||
    meta.promptType === "followup_general" ||
    meta.promptType === "followup_technical" ||
    meta.promptType === "unknown"
      ? meta.promptType
      : null;
  const promptBudgetTarget =
    typeof meta.promptBudgetTarget === "number" ? meta.promptBudgetTarget : null;
  const promptOriginalLength =
    typeof meta.promptOriginalLength === "number" ? meta.promptOriginalLength : null;
  const promptOptimizedLength =
    typeof meta.promptOptimizedLength === "number" ? meta.promptOptimizedLength : null;
  const promptReductionRatio =
    typeof meta.promptReductionRatio === "number" ? meta.promptReductionRatio : 0;
  const promptStrategyReason =
    typeof meta.promptStrategyReason === "string" ? meta.promptStrategyReason : "";
  const promptComplexityScore =
    typeof meta.promptComplexityScore === "number" ? meta.promptComplexityScore : 0;
  // Plan 03 (short): SSE meta now carries `promptSource` ("user" |
  // "auto_repair"). Default to "user" so legacy meta payloads
  // missing the field render exactly as before.
  const promptSource =
    meta.promptSource === "auto_repair" ? "auto_repair" : "user";
  
  if (promptStrategy && promptType && promptBudgetTarget !== null && promptOriginalLength !== null &&
    promptOptimizedLength !== null) {
    appendPromptStrategyPart(ctx.setMessages, ctx.assistantMessageId, {
      strategy: promptStrategy,
      promptType,
      promptSource,
      budgetTarget: promptBudgetTarget,
      originalLength: promptOriginalLength,
      optimizedLength: promptOptimizedLength,
      reductionRatio: promptReductionRatio,
      reason: promptStrategyReason,
      phaseHints: [],
      complexityScore: promptComplexityScore,
      wasChanged: promptOriginalLength !== promptOptimizedLength,
    });
  }
  
  if (!state.chatIdFromStream && typeof meta.chatId === "string" && meta.chatId) {
    const id = meta.chatId;
    state.chatIdFromStream = id;
    ctx.setChatId?.(id);
    if (ctx.chatIdParam !== id && ctx.buildBuilderParams && ctx.router) {
      const params = ctx.buildBuilderParams({
        chatId: id,
        project: ctx.appProjectId ?? undefined,
      });
      ctx.router.replace(`/builder?${params.toString()}`);
    }
    if (ctx.pendingCreateKeyRef?.current) {
      updateCreateChatLockChatId(ctx.pendingCreateKeyRef.current, id);
    }
  }
  if (!state.versionIdFromStream && typeof meta.versionId === "string" && meta.versionId) {
    state.versionIdFromStream = meta.versionId;
  }
}

export function handleChatIdEvent(data: unknown, state: StreamRunState, ctx: StreamContext) {
  const nextChatId =
    typeof data === "string"
      ? data
      : (data as Record<string, unknown>)?.id ||
        (data as Record<string, unknown>)?.chatId ||
        null;
  if (nextChatId && !state.chatIdFromStream) {
    const id = String(nextChatId);
    state.chatIdFromStream = id;
    state.streamStats.chatId = id;
    ctx.setChatId?.(id);
    if (ctx.chatIdParam !== id && ctx.buildBuilderParams && ctx.router) {
      const params = ctx.buildBuilderParams({
        chatId: id,
        project: ctx.appProjectId ?? undefined,
      });
      ctx.router.replace(`/builder?${params.toString()}`);
    }
    if (ctx.pendingCreateKeyRef?.current) {
      updateCreateChatLockChatId(ctx.pendingCreateKeyRef.current, id);
    }
  }
}

export function handleProjectIdEvent(data: unknown, state: StreamRunState, ctx: StreamContext) {
  const nextV0ProjectId =
    typeof data === "string"
      ? data
      : (data as Record<string, unknown>)?.projectId ||
        (data as Record<string, unknown>)?.v0ProjectId ||
        (data as Record<string, unknown>)?.v0_project_id ||
        null;
  if (nextV0ProjectId && !state.linkedProjectIdFromStream) {
    const id = String(nextV0ProjectId);
    state.linkedProjectIdFromStream = id;
    ctx.onLinkedProjectId?.(id);
  }
}

export function handlePreviewReadyEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: LifecycleDeps,
) {
  const previewData = data as Record<string, unknown>;
  const previewUrl =
    resolveCanonicalLivePreviewUrlFromPreviewReadyPayload(
      previewData as { previewUrl?: unknown },
    ) ?? "";
  const previewSessionIdRaw =
    typeof previewData.previewSessionId === "string"
      ? previewData.previewSessionId.trim()
      : "";
  if (previewSessionIdRaw) {
    ctx.onPreviewSessionMeta?.({
      previewSessionId: previewSessionIdRaw,
      versionId: state.versionIdFromStream,
    });
  }
  
  ctx.setPreviewPending?.(false);
  ctx.setPreviewBuildError?.(null);
  
  if (previewUrl) {
    deps.deliverPreviewUrl(previewUrl, state.versionIdFromStream);
    const pendingPost = state.postCheckQueue[state.postCheckQueue.length - 1];
    if (pendingPost) {
      pendingPost.demoUrl = previewUrl;
    }
  }
  
  const tierMeta =
    typeof previewData.previewTier === "number"
      ? {
          previewTier: previewData.previewTier,
          ...(typeof previewData.previewMode === "string"
            ? { previewMode: previewData.previewMode }
            : {}),
        }
      : {};
  
  const pb =
    typeof previewData.prodBuildVerified === "boolean"
      ? previewData.prodBuildVerified
      : undefined;
  if (pb !== undefined) {
    const logSnippet =
      typeof previewData.prodBuildLogSnippet === "string"
        ? previewData.prodBuildLogSnippet
        : undefined;
    ctx.setPreviewProdBuild?.({
      verified: pb,
      logSnippet: !pb ? logSnippet : undefined,
    });
    deps.appendProgressPart(
      "preview",
      pb ? "build-verified" : "build-failed",
      { prodBuildVerified: pb, ...tierMeta },
    );
  } else if (previewUrl) {
    ctx.setPreviewProdBuild?.(null);
  }
  
  if (previewUrl && Object.keys(tierMeta).length > 0 && pb === undefined) {
    const runtimeConfirmed =
      typeof previewData.runtimeConfirmed === "boolean"
        ? previewData.runtimeConfirmed
        : undefined;
    deps.appendProgressPart(
      "preview",
      runtimeConfirmed === false ? "boot-queued" : "ready",
      { ...tierMeta, ...(runtimeConfirmed === undefined ? {} : { runtimeConfirmed }) },
    );
  }
}

export function handleBuildErrorEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: LifecycleDeps,
) {
  const buildErrorData = data as Record<string, unknown>;
  const stage = String(buildErrorData.stage ?? "build");
  const message = String(buildErrorData.message ?? "Build failed");
  ctx.setPreviewPending?.(false);
  ctx.setPreviewBuildError?.({
    stage,
    message,
  });
  deps.appendProgressPart("preview", "error", { stage, message });
  toast.error(
    `Live-preview gick inte [${stage}]: ${message.slice(0, 400)}. Ingen live-preview förrän VM-previewn lyckas.`,
  );
}

export function handleVersionRepairAvailableEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
) {
  const payload =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const repairVersionId =
    typeof payload.versionId === "string" && payload.versionId.trim().length > 0
      ? payload.versionId.trim()
      : null;
  const summary =
    typeof payload.summary === "string" && payload.summary.trim().length > 0
      ? payload.summary.trim()
      : "En serverreparation finns tillgänglig och kan accepteras i versionspanelen.";
  
  appendToolPartToMessage(ctx.setMessages, ctx.assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Server repair",
    toolCallId: repairVersionId
      ? `server-repair-available:${repairVersionId}`
      : `server-repair-available:${Date.now()}`,
    state: "output-available",
    output: {
      repaired: true,
      status: "repair_available",
      reason: summary,
      method: null,
      newVersionId: repairVersionId,
      remainingErrors: null,
      improvedSyntax: null,
      earlyStopReason: null,
    },
  } as Parameters<typeof appendToolPartToMessage>[2]);
  
  ctx.mutateVersions();
  toast.message("Serverreparation tillgänglig", {
    description: summary,
  });
}

export function handleErrorEvent(data: unknown, state: StreamRunState) {
  const errorData =
    typeof data === "object" && data
      ? (data as Record<string, unknown>)
      : { message: data };
  state.pendingStreamErrorMessage = buildStreamErrorMessage(errorData);
  state.streamStats.errorEvents += 1;
}
