import { consumeSseResponse } from "@/lib/builder/sse";
import { isPromptAssistOff, resolvePromptAssistProvider } from "@/lib/builder/promptAssist";
import type {
  AutoFixPayload,
  SandboxBuildErrorPayload,
  SandboxProdBuildPayload,
  SetMessages,
  StreamQualitySignal,
} from "./types";
import { toast } from "sonner";
import {
  appendModelInfoPart,
  appendPromptStrategyPart,
  appendToolPartToMessage,
  buildStreamErrorMessage,
  coerceIntegrationSignals,
  coerceUiParts,
  finalizeStreamStats,
  initStreamStats,
  integrationSignalToToolPart,
  mergeStreamingText,
  mergeUiParts,
  recordStreamParts,
  recordStreamText,
} from "./helpers";
import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import {
  isOwnEnginePostStreamPhaseId,
  ownEnginePostStreamStepLabelSv,
} from "@/lib/gen/stream/finalize-pipeline-contract";
import { isCompatibilityShimPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";

function effectivePreviewUrlFromDonePayload(done: Record<string, unknown>): string | null {
  const raw = resolveInboundPreviewUrl({
    previewUrl: done.previewUrl,
    demoUrl: done.demoUrl,
  });
  if (!raw) return null;
  const normalized = normalizePreviewUrl(raw);
  if (!normalized || isCompatibilityShimPreviewUrl(normalized)) return null;
  return normalized;
}

export type StreamContext = {
  streamType: "create" | "send";
  assistantMessageId: string;
  selectedModelTier: string;
  chatId: string | null;
  setMessages: SetMessages;
  touchStreamSafetyTimer: () => void;

  setChatId?: (id: string | null) => void;
  chatIdParam?: string | null;
  buildBuilderParams?: (entries: Record<string, string | null | undefined>) => URLSearchParams;
  router?: { replace: (href: string) => void };
  appProjectId?: string | null;
  pendingCreateKeyRef?: React.MutableRefObject<string | null>;
  onLinkedProjectId?: (projectId: string) => void;

  setCurrentPreviewUrl: (url: string | null) => void;
  setSandboxBuildError?: (payload: SandboxBuildErrorPayload | null) => void;
  setSandboxProdBuild?: (payload: SandboxProdBuildPayload | null) => void;
  setSandboxPending?: (pending: boolean) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: {
    chatId: string;
    versionId?: string;
    previewUrl?: string;
    onlySelectVersionIfWasLatest?: boolean;
  }) => void;
  /** Own-engine sandbox session metadata (SSE sandbox-ready). */
  onSandboxSessionMeta?: (meta: { sandboxId: string; versionId: string | null } | null) => void;
  mutateVersions: () => void;
  enableImageMaterialization: boolean;
  autoFixHandlerRef: React.MutableRefObject<(payload: AutoFixPayload) => void>;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
};

import { updateCreateChatLockChatId } from "./helpers";

export async function handleSseStream(
  response: Response,
  ctx: StreamContext,
  signal: AbortSignal,
): Promise<{ streamQuality: StreamQualitySignal; chatIdFromStream: string | null }> {
  let chatIdFromStream: string | null = null;
  let versionIdFromStream: string | null = null;
  let linkedProjectIdFromStream: string | null = null;
  let accumulatedThinking = "";
  let accumulatedContent = "";
  let progressivePreviewFired = false;
  let didReceiveDone = false;
  let generationProgressStarted = false;
  let pendingStreamErrorMessage: string | null = null;
  const postCheckQueue: Array<{
    chatId: string;
    versionId: string;
    demoUrl?: string | null;
    preflight?: PreviewPreflightState | null;
  }> = [];
  const materializeQueue: Array<{ chatId: string; versionId: string }> = [];
  let streamQuality: StreamQualitySignal = { hasCriticalAnomaly: false, reasons: [] };
  const streamStats = initStreamStats(ctx.streamType, ctx.assistantMessageId);

  const {
    assistantMessageId,
    selectedModelTier,
    setMessages,
    touchStreamSafetyTimer,
    setChatId,
    chatIdParam,
    buildBuilderParams,
    router,
    appProjectId,
    pendingCreateKeyRef,
    onLinkedProjectId,
    onSandboxSessionMeta,
    setCurrentPreviewUrl,
    setSandboxBuildError,
    setSandboxProdBuild,
    setSandboxPending,
    onPreviewRefresh,
    onGenerationComplete,
    mutateVersions,
    enableImageMaterialization,
    autoFixHandlerRef,
  } = ctx;

  const effectiveChatId = ctx.chatId;

  const getProgressToolName = (step: string) => {
    if (isOwnEnginePostStreamPhaseId(step)) return ownEnginePostStreamStepLabelSv(step);
    if (step === "generation") return "Generering";
    if (step === "sandbox") return "Sandbox";
    if (step === "build-error") return "Byggfel";
    return step;
  };

  const buildProgressSteps = (step: string, phase: string, payload: Record<string, unknown>) => {
    const errorCount =
      typeof payload.errorCount === "number" && Number.isFinite(payload.errorCount)
        ? payload.errorCount
        : null;
    const pass = typeof payload.pass === "number" && Number.isFinite(payload.pass) ? payload.pass : null;
    const fixes = typeof payload.fixes === "number" && Number.isFinite(payload.fixes) ? payload.fixes : null;
    const warnings =
      typeof payload.warnings === "number" && Number.isFinite(payload.warnings) ? payload.warnings : null;
    const fileCount =
      typeof payload.fileCount === "number" && Number.isFinite(payload.fileCount) ? payload.fileCount : null;
    const versionId =
      typeof payload.versionId === "string" && payload.versionId.trim().length > 0
        ? payload.versionId.trim()
        : null;

    if (step === "generation") {
      if (phase === "start") return ["Startar own-engine-strömmen."];
      if (phase === "reasoning") {
        return ["Modellen analyserar uppgiften innan första synliga outputen kommer."];
      }
      if (phase === "awaiting-output") {
        return ["Väntar på första kod- eller textoutput från modellen."];
      }
      if (phase === "streaming") return ["Genererar innehåll och filer från prompten."];
      if (phase === "awaiting-input") {
        return ["Genereringen pausades eftersom modellen behöver mer input eller konfiguration."];
      }
      if (phase === "empty-output") {
        return ["Genereringen avslutades utan användbar kod eller preview-artifact."];
      }
      if (phase === "tool") {
        const toolName = typeof payload.toolName === "string" ? payload.toolName.trim() : "";
        return [
          toolName
            ? `Modellen kör verktyget "${toolName}" (integration, plan eller fråga).`
            : "Modellen kör ett verktyg — väntar på nästa kodoutput.",
        ];
      }
      if (phase === "done") return ["Generering klar. Startar efterkontroller och slutsteg."];
    }
    if (step === "autofix") {
      if (phase === "start") return ["Autofix startad."];
      if (phase === "done") {
        const summary: string[] = ["Autofix klar."];
        if (fixes !== null || warnings !== null) {
          summary.push(
            `Fixar: ${fixes ?? 0}${warnings !== null ? `, varningar: ${warnings}` : ""}.`,
          );
        }
        return summary;
      }
      if (phase === "error") return ["Autofix misslyckades. Fortsätter med rått innehåll."];
    }
    if (step === "polish") {
      if (phase === "start") {
        return ["Polish: andra LLM-passet förbättrar texter och tar bort platshållare."];
      }
      if (phase === "done") {
        const applied = payload.applied === true;
        const filesChanged =
          typeof payload.filesChanged === "number" && Number.isFinite(payload.filesChanged)
            ? payload.filesChanged
            : null;
        if (!applied) return ["Polish hoppades över eller ändrade inget."];
        return [
          `Polish klar.${filesChanged !== null ? ` Uppdaterade filer: ${filesChanged}.` : ""}`,
        ];
      }
      if (phase === "error") return ["Polish misslyckades. Fortsätter utan finputs."];
    }
    if (step === "url_expand") {
      if (phase === "start") return ["Expanderar kortade URL:er till fulla adresser."];
      if (phase === "done") return ["URL-expansion klar."];
    }
    if (step === "materialize_images") {
      if (phase === "start") return ["Materialiserar bildplatshållare (t.ex. riktiga bild-URL:er)…"];
      if (phase === "done") {
        const replaced =
          typeof payload.replacedCount === "number" && Number.isFinite(payload.replacedCount)
            ? payload.replacedCount
            : null;
        if (replaced !== null && replaced > 0) {
          return [`Bytte ut ${replaced} bildplatshållare.`];
        }
        return ["Inga bildplatshållare behövde bytas."];
      }
      if (phase === "error") {
        return ["Bildmaterialisering misslyckades; platshållare kan kvarstå."];
      }
    }
    if (step === "validate_syntax") {
      if (phase === "start" || phase === "validating") {
        return [`Validerar genererad kod${pass ? ` (pass ${pass})` : ""}.`];
      }
      if (phase === "fixing") {
        return [
          `Försöker reparera syntaxfel${pass ? ` i pass ${pass}` : ""}${errorCount !== null ? ` (${errorCount} fel)` : ""}.`,
        ];
      }
      if (phase === "retrying") {
        return [`Kör om valideringen efter fixförsök${pass ? ` i pass ${pass}` : ""}.`];
      }
      if (phase === "passed") return ["Validering klar."];
      if (phase === "gave-up") {
        return [
          `Valideringen gav upp${errorCount !== null ? ` med ${errorCount} kvarvarande fel` : ""}.`,
        ];
      }
      if (phase === "error") return ["Valideringen misslyckades."];
    }
    if (step === "parse_merge_preflight") {
      if (phase === "start") return ["Finaliserar filer, gör project checks och sparar versionen."];
      if (phase === "done") {
        const details: string[] = ["Finalisering klar."];
        if (fileCount !== null) details.push(`Filer i versionen: ${fileCount}.`);
        if (versionId) details.push(`Version: ${versionId}.`);
        return details;
      }
    }
    if (step === "sandbox") {
      if (phase === "starting") {
        return ["Startar sandbox-preview (install och dev-server)…"];
      }
      if (phase === "build-verified") {
        return ["Production build (npm run build) lyckades i sandbox — separat från dev-preview."];
      }
      if (phase === "build-failed") {
        return [
          "Production build misslyckades i sandbox. Dev-server-preview kan ändå vara användbar.",
        ];
      }
    }
    return [`${getProgressToolName(step)}: ${phase}`];
  };

  const appendProgressPart = (step: string, phase: string, payload: Record<string, unknown> = {}) => {
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: `tool:engine-${step}` as const,
      toolName: getProgressToolName(step),
      toolCallId: `progress:${step}`,
      state:
        phase === "passed" || phase === "done"
          ? "output-available"
          : phase === "error" || phase === "gave-up"
            ? "output-error"
            : "input-streaming",
      output: {
        step,
        phase,
        ...payload,
        steps: buildProgressSteps(step, phase, payload),
      },
    } as Parameters<typeof appendToolPartToMessage>[2]);
  };

  const parseDonePreflight = (doneData: Record<string, unknown>): PreviewPreflightState | null =>
    readPreviewPreflight(doneData);

  try {
    await consumeSseResponse(
      response,
      (event, data) => {
        touchStreamSafetyTimer();
        switch (event) {
          case "meta": {
            const meta = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const paModel = ctx.promptAssistModel ?? null;
            appendModelInfoPart(setMessages, assistantMessageId, {
              modelId: (meta.modelId as string) ?? selectedModelTier,
              modelTier:
                (typeof meta.modelTier === "string" && meta.modelTier) || selectedModelTier || null,
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
              scaffoldFamily: typeof meta.scaffoldFamily === "string" ? meta.scaffoldFamily : null,
              scaffoldLabel: typeof meta.scaffoldLabel === "string" ? meta.scaffoldLabel : null,
              capabilities: meta.capabilities && typeof meta.capabilities === "object" ? meta.capabilities as Record<string, boolean> : null,
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
              meta.promptStrategy === "summarize" ||
              meta.promptStrategy === "phase_plan_build_polish"
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

            if (promptStrategy && promptType && promptBudgetTarget !== null && promptOriginalLength !== null &&
              promptOptimizedLength !== null) {
              appendPromptStrategyPart(setMessages, assistantMessageId, {
                strategy: promptStrategy,
                promptType,
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

            if (!chatIdFromStream && typeof meta.chatId === "string" && meta.chatId) {
              const id = meta.chatId;
              chatIdFromStream = id;
              setChatId?.(id);
              if (chatIdParam !== id && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: id,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
              if (pendingCreateKeyRef?.current) {
                updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
              }
            }
            if (!versionIdFromStream && typeof meta.versionId === "string" && meta.versionId) {
              versionIdFromStream = meta.versionId;
            }
            break;
          }
          case "thinking": {
            const thinkingText =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.text ||
                  (data as Record<string, unknown>)?.thinking ||
                  (data as Record<string, unknown>)?.reasoning ||
                  null;
            if (thinkingText) {
              if (!generationProgressStarted) {
                generationProgressStarted = true;
                appendProgressPart("generation", "streaming");
              }
              const incoming = String(thinkingText);
              const previous = accumulatedThinking;
              const mergedThought = mergeStreamingText(previous, incoming);
              recordStreamText(streamStats, "thinking", previous, mergedThought, incoming.length);
              if (mergedThought !== accumulatedThinking) {
                accumulatedThinking = mergedThought;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                      : m,
                  ),
                );
              }
            }
            break;
          }
          case "content": {
            const contentText =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.content ||
                  (data as Record<string, unknown>)?.text ||
                  (data as Record<string, unknown>)?.delta ||
                  null;
            if (contentText) {
              if (!generationProgressStarted) {
                generationProgressStarted = true;
                appendProgressPart("generation", "streaming");
              }
              const incoming = String(contentText);
              const previous = accumulatedContent;
              const merged = mergeStreamingText(previous, incoming);
              recordStreamText(streamStats, "content", previous, merged, incoming.length);
              accumulatedContent = merged;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m,
                ),
              );

              if (!progressivePreviewFired && accumulatedContent.includes("\n```\n")) {
                const fileBlockCount = (accumulatedContent.match(/```\w+\s+file="[^"]+"/g) || []).length;
                const closedBlockCount = (accumulatedContent.match(/\n```\n/g) || []).length;
                if (fileBlockCount >= 2 && closedBlockCount >= 2) {
                  progressivePreviewFired = true;
                  onPreviewRefresh?.();
                }
              }
            }
            break;
          }
          case "parts": {
            const nextParts = coerceUiParts(data);
            if (nextParts.length > 0) {
              recordStreamParts(streamStats, nextParts.length);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, nextParts), isStreaming: true }
                    : m,
                ),
              );
            }
            break;
          }
          case "integration": {
            const signals = coerceIntegrationSignals(data);
            if (signals.length > 0) {
              const integrationParts = signals.map((s, i) =>
                integrationSignalToToolPart(s, `${assistantMessageId}:${i}`),
              );
              recordStreamParts(streamStats, integrationParts.length);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        uiParts: mergeUiParts(m.uiParts, integrationParts),
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
            break;
          }
          case "tool-call": {
            const toolData = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const toolName = typeof toolData.toolName === "string" ? toolData.toolName : "";
            const toolCallId = typeof toolData.toolCallId === "string"
              ? toolData.toolCallId
              : `tool-${Date.now()}`;
            const toolArgs = (toolData.args as Record<string, unknown>) ?? {};

            if (toolName === "askClarifyingQuestion") {
              const questionText = typeof toolArgs.question === "string" ? toolArgs.question : "";
              const options = Array.isArray(toolArgs.options) ? (toolArgs.options as string[]) : [];
              const part = {
                type: "tool:awaiting-input",
                toolName: "Klargörande fråga",
                toolCallId,
                state: "input-available",
                output: {
                  question: questionText,
                  options: options.length > 0 ? options : undefined,
                  kind: typeof toolArgs.kind === "string" ? toolArgs.kind : "unclear",
                  awaitingInput: true,
                },
              } as Parameters<typeof appendToolPartToMessage>[2];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [part]) }
                    : m,
                ),
              );
            } else if (toolName === "emitPlanArtifact") {
              const planPart = {
                type: "plan" as const,
                plan: {
                  title: (typeof toolArgs.goal === "string" ? toolArgs.goal : "Plan") as string,
                  description: Array.isArray(toolArgs.scope)
                    ? (toolArgs.scope as string[]).join(", ")
                    : "",
                  steps: Array.isArray(toolArgs.steps)
                    ? (toolArgs.steps as Array<Record<string, unknown>>).map((s) => ({
                        title: String(s.title ?? ""),
                        description: String(s.description ?? ""),
                        status: String(s.phase ?? "build"),
                      }))
                    : [],
                  raw: toolArgs,
                },
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
                    : m,
                ),
              );
            }
            break;
          }
          case "progress": {
            const progressData = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const step = typeof progressData.step === "string" ? progressData.step : "";
            const phase = typeof progressData.phase === "string" ? progressData.phase : "";
            if (step && phase) {
              if (step === "generation") {
                generationProgressStarted = true;
              }
              appendProgressPart(step, phase, progressData);
            }
            break;
          }
          case "chatId": {
            const nextChatId =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.id ||
                  (data as Record<string, unknown>)?.chatId ||
                  null;
            if (nextChatId && !chatIdFromStream) {
              const id = String(nextChatId);
              chatIdFromStream = id;
              streamStats.chatId = id;
              setChatId?.(id);
              if (chatIdParam !== id && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: id,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
              if (pendingCreateKeyRef?.current) {
                updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
              }
            }
            break;
          }
          case "projectId": {
            const nextV0ProjectId =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.v0ProjectId ||
                  (data as Record<string, unknown>)?.v0_project_id ||
                  null;
            if (nextV0ProjectId && !linkedProjectIdFromStream) {
              const id = String(nextV0ProjectId);
              linkedProjectIdFromStream = id;
              onLinkedProjectId?.(id);
            }
            break;
          }
          case "sandbox-ready": {
            const sandboxData = data as Record<string, unknown>;
            const sandboxUrl =
              typeof sandboxData.sandboxUrl === "string"
                ? sandboxData.sandboxUrl.trim()
                : "";
            const sandboxIdRaw =
              typeof sandboxData.sandboxId === "string" ? sandboxData.sandboxId.trim() : "";
            if (sandboxIdRaw) {
              onSandboxSessionMeta?.({
                sandboxId: sandboxIdRaw,
                versionId: versionIdFromStream,
              });
            }

            setSandboxPending?.(false);
            setSandboxBuildError?.(null);

            if (sandboxUrl && !isCompatibilityShimPreviewUrl(sandboxUrl)) {
              setCurrentPreviewUrl(sandboxUrl);
              onPreviewRefresh?.();
              const pendingPost = postCheckQueue[postCheckQueue.length - 1];
              if (pendingPost) {
                pendingPost.demoUrl = sandboxUrl;
              }
            }

            const tierMeta =
              typeof sandboxData.fidelityTier === "number"
                ? {
                    fidelityTier: sandboxData.fidelityTier,
                    ...(typeof sandboxData.sandboxPreviewMode === "string"
                      ? { sandboxPreviewMode: sandboxData.sandboxPreviewMode }
                      : {}),
                  }
                : {};

            const pb =
              typeof sandboxData.prodBuildVerified === "boolean"
                ? sandboxData.prodBuildVerified
                : undefined;
            if (pb !== undefined) {
              const logSnippet =
                typeof sandboxData.prodBuildLogSnippet === "string"
                  ? sandboxData.prodBuildLogSnippet
                  : undefined;
              setSandboxProdBuild?.({
                verified: pb,
                logSnippet: !pb ? logSnippet : undefined,
              });
              appendProgressPart(
                "sandbox",
                pb ? "build-verified" : "build-failed",
                { prodBuildVerified: pb, ...tierMeta },
              );
            } else if (sandboxUrl) {
              setSandboxProdBuild?.(null);
            }

            if (sandboxUrl && Object.keys(tierMeta).length > 0 && pb === undefined) {
              appendProgressPart("sandbox", "ready", tierMeta);
            }
            break;
          }
          case "build-error": {
            const buildErrorData = data as Record<string, unknown>;
            const stage = String(buildErrorData.stage ?? "build");
            const message = String(buildErrorData.message ?? "Build failed");
            setSandboxPending?.(false);
            setSandboxBuildError?.({
              stage,
              message,
            });
            appendProgressPart("build-error", "error", { stage, message });
            toast.error(
              `Sandbox-preview gick inte [${stage}]: ${message.slice(0, 400)}. Ingen live-preview förrän sandbox lyckas.`,
            );
            break;
          }
          case "done": {
            didReceiveDone = true;
            streamStats.didReceiveDone = true;
            if (generationProgressStarted || accumulatedContent.trim().length > 0 || accumulatedThinking.trim().length > 0) {
              appendProgressPart("generation", "done");
            }
            const doneData =
              typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const donePreflight = parseDonePreflight(doneData);
            const doneV0ProjectId = doneData.v0ProjectId || doneData.v0_project_id || null;
            if (doneV0ProjectId && !linkedProjectIdFromStream) {
              linkedProjectIdFromStream = String(doneV0ProjectId);
              onLinkedProjectId?.(linkedProjectIdFromStream);
            }
            const effectiveDoneDemo = effectivePreviewUrlFromDonePayload(doneData);
            if (effectiveDoneDemo) {
              setCurrentPreviewUrl(effectiveDoneDemo);
              onPreviewRefresh?.();
            }
            setSandboxPending?.(Boolean(doneData.sandboxPending));
            const resolvedChatId =
              doneData.chatId || doneData.id || chatIdFromStream || effectiveChatId || null;
            const resolvedVersionId =
              doneData.versionId ||
              doneData.version_id ||
              (doneData.latestVersion as Record<string, unknown> | undefined)?.id ||
              (doneData.latestVersion as Record<string, unknown> | undefined)?.versionId ||
              versionIdFromStream ||
              null;
            if (resolvedVersionId) {
              versionIdFromStream = String(resolvedVersionId);
            }
            const awaitingInput = Boolean(doneData.awaitingInput);
            const hasRecoveredArtifact =
              awaitingInput ||
              Boolean(resolvedVersionId) ||
              Boolean(effectiveDoneDemo);
            const emptyGenerationReason =
              typeof doneData.reason === "string" && doneData.reason.trim().length > 0
                ? doneData.reason.trim()
                : "no_version_or_preview";

            if (!resolvedChatId) {
              throw new Error("No chat ID returned from stream");
            }
            if (pendingStreamErrorMessage && !hasRecoveredArtifact) {
              throw new Error(pendingStreamErrorMessage);
            }
            const nextId = String(resolvedChatId);
            streamStats.chatId = nextId;
            streamStats.versionId = resolvedVersionId ? String(resolvedVersionId) : null;

            if (!chatIdFromStream && setChatId) {
              chatIdFromStream = nextId;
              setChatId(nextId);
              if (chatIdParam !== nextId && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: nextId,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
            }
            if (pendingCreateKeyRef?.current) {
              updateCreateChatLockChatId(pendingCreateKeyRef.current, nextId);
            }

            if (!awaitingInput && !hasRecoveredArtifact) {
              appendProgressPart("generation", "empty-output", { reason: emptyGenerationReason });
              const explicitFailureMessage =
                pendingStreamErrorMessage ||
                (emptyGenerationReason.includes("empty_output")
                  ? "Own-engine genererade ingen användbar kod i det här försöket."
                  : "Genereringen avslutades utan version eller preview.");
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessageId) return m;
                  if ((m.content || "").trim().length > 0) {
                    return { ...m, isStreaming: false };
                  }
                  return {
                    ...m,
                    content: `${explicitFailureMessage} Försök igen eller justera prompten.`,
                    isStreaming: false,
                  };
                }),
              );
              toast.error(explicitFailureMessage);
              break;
            }

            if (awaitingInput) {
              const planBlockers = (() => {
                const pa = doneData.planArtifact as Record<string, unknown> | undefined;
                if (!pa || !Array.isArray(pa.blockers)) return null;
                const arr = pa.blockers as Array<Record<string, unknown>>;
                return arr.length > 0 ? arr : null;
              })();

              const serverAwaitingPrompt =
                typeof doneData.awaitingInputPrompt === "string"
                  ? doneData.awaitingInputPrompt.trim()
                  : "";
              const questionPreview = (() => {
                if (serverAwaitingPrompt) return serverAwaitingPrompt;
                if (planBlockers) {
                  return planBlockers
                    .map((b) => String(b.question ?? ""))
                    .filter(Boolean)
                    .join("\n") || "Planen kräver dina svar för att fortsätta.";
                }
                const contentTail = accumulatedContent.trim().slice(-300);
                const looksLikeQuestion =
                  contentTail &&
                  (contentTail.slice(-25).includes("?") || contentTail.length <= 100);
                return looksLikeQuestion
                  ? contentTail
                  : "AI väntar på ditt svar. Läs meddelandet ovan och svara i chatten.";
              })();

              const quickOptions = planBlockers
                ? planBlockers.flatMap((b) =>
                    Array.isArray(b.options)
                      ? (b.options as string[]).slice(0, 4)
                      : [],
                  )
                : [];

              setMessages((prev) => {
                const assistantMsg = prev.find((m) => m.id === assistantMessageId);
                const hasApprovalRequested = (assistantMsg?.uiParts ?? []).some(
                  (p) =>
                    (p as { state?: string; type?: string }).state === "approval-requested" ||
                    (p as { type?: string }).type === "tool:awaiting-input",
                );
                if (hasApprovalRequested) return prev;
                const part = {
                  type: "tool:awaiting-input",
                  toolName: planBlockers ? "Plan: svar krävs" : "Awaiting input",
                  toolCallId: `awaiting-input:${assistantMessageId}`,
                  state: "input-available",
                  output: {
                    question: questionPreview,
                    options: quickOptions.length > 0 ? quickOptions : undefined,
                    chatId: nextId,
                    messageId:
                      doneData.messageId ||
                      doneData.message_id ||
                      (doneData.latestVersion as Record<string, unknown> | undefined)?.messageId ||
                      null,
                    awaitingInput: true,
                    planBlockers: planBlockers ?? undefined,
                  },
                } as Parameters<typeof appendToolPartToMessage>[2];
                return prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [part]) }
                    : m,
                );
              });
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessageId || (m.content || "").trim()) return m;
                  return {
                    ...m,
                    content: planBlockers
                      ? "Planen innehåller frågor som måste besvaras innan byggfasen kan starta."
                      : "Jag behöver ditt svar på en följdfråga innan nästa preview kan genereras.",
                  };
                }),
              );
              toast(planBlockers ? "Planen kräver dina svar." : "AI väntar på ditt svar för att fortsätta.", {
                id: "builder-awaiting-input",
              });
            }

            const planArtifact = doneData.planArtifact as Record<string, unknown> | undefined;
            if (planArtifact && typeof planArtifact === "object") {
              const planPart = {
                type: "plan" as const,
                plan: {
                  title: (typeof planArtifact.goal === "string" ? planArtifact.goal : "Plan") as string,
                  description: Array.isArray(planArtifact.scope)
                    ? (planArtifact.scope as string[]).join(", ")
                    : "",
                  steps: Array.isArray(planArtifact.steps)
                    ? (planArtifact.steps as Array<Record<string, unknown>>).map((s) => ({
                        title: String(s.title ?? ""),
                        description: String(s.description ?? ""),
                        status: String(s.phase ?? "build"),
                      }))
                    : [],
                  blockers: Array.isArray(planArtifact.blockers) ? planArtifact.blockers : [],
                  assumptions: Array.isArray(planArtifact.assumptions) ? planArtifact.assumptions : [],
                  raw: planArtifact,
                },
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
                    : m,
                ),
              );
            }

            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
            );
            if (pendingStreamErrorMessage) {
              const errTail = pendingStreamErrorMessage.slice(0, 280);
              toast.warning(
                `Streamen rapporterade fel tidigare, men en version eller demo returnerades ändå. ${errTail}${pendingStreamErrorMessage.length > 280 ? "…" : ""}`,
              );
            } else if (ctx.streamType === "create" && !awaitingInput) {
              toast.success(planArtifact ? "Plan skapad!" : "Sajt skapad!");
            }
            mutateVersions();
            const onlySelectVersionIfWasLatest = Boolean(doneData.onlySelectVersionIfWasLatest);
            onGenerationComplete?.({
              chatId: nextId,
              versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
              previewUrl: effectiveDoneDemo ?? undefined,
              onlySelectVersionIfWasLatest,
            });
            if (resolvedChatId && resolvedVersionId) {
              materializeQueue.push({
                chatId: String(resolvedChatId),
                versionId: String(resolvedVersionId),
              });
              postCheckQueue.push({
                chatId: String(resolvedChatId),
                versionId: String(resolvedVersionId),
                demoUrl: effectiveDoneDemo,
                preflight: donePreflight,
              });
            }
            break;
          }
          case "error": {
            const errorData =
              typeof data === "object" && data
                ? (data as Record<string, unknown>)
                : { message: data };
            pendingStreamErrorMessage = buildStreamErrorMessage(errorData);
            streamStats.errorEvents += 1;
            break;
          }
        }
      },
      { signal },
    );
  } finally {
    streamStats.chatId = streamStats.chatId ?? chatIdFromStream ?? effectiveChatId ?? null;
    streamStats.didReceiveDone = streamStats.didReceiveDone || didReceiveDone;
    streamStats.abortedByClient = signal.aborted;
    streamQuality = finalizeStreamStats(streamStats);
  }

  if (!didReceiveDone) {
    throw new Error(
      pendingStreamErrorMessage || "Streamen avslutades innan genereringen var klar. Försök igen.",
    );
  }
  if (ctx.streamType === "create" && !chatIdFromStream) {
    throw new Error("No chat ID returned from stream");
  }

  setMessages((prev) => {
    const msg = prev.find((m) => m.id === assistantMessageId);
    if (!msg?.isStreaming) return prev;
    return prev.map((m) =>
      m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
    );
  });

  const latestMaterialize =
    materializeQueue.length > 0 ? materializeQueue[materializeQueue.length - 1] : null;
  if (latestMaterialize) {
    void triggerImageMaterialization({
      chatId: latestMaterialize.chatId,
      versionId: latestMaterialize.versionId,
      enabled: enableImageMaterialization,
    });
  }

  const latestPostCheck =
    postCheckQueue.length > 0 ? postCheckQueue[postCheckQueue.length - 1] : null;
  if (latestPostCheck) {
    void runPostGenerationChecks({
      chatId: latestPostCheck.chatId,
      versionId: latestPostCheck.versionId,
      demoUrl: latestPostCheck.demoUrl ?? null,
      preflight: latestPostCheck.preflight ?? null,
      assistantMessageId,
      setMessages,
      streamQuality,
      onAutoFix: (payload) => autoFixHandlerRef.current(payload),
    });
  }

  return { streamQuality, chatIdFromStream };
}
