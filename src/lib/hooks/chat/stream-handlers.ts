import { consumeSseResponse } from "@/lib/builder/sse";
import { isPromptAssistOff, resolvePromptAssistProvider } from "@/lib/builder/prompt-assist";
import type {
  AutoFixPayload,
  PreviewBuildErrorPayload,
  PreviewProdBuildPayload,
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
import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import {
  isOwnEnginePostStreamPhaseId,
  ownEnginePostStreamStepLabelSv,
} from "@/lib/gen/stream/finalize-pipeline-contract";
import {
  resolveCanonicalLivePreviewUrlFromDonePayload,
  resolveCanonicalLivePreviewUrlFromPreviewReadyPayload,
} from "@/lib/api/preview-url-contract";

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
  setPreviewBuildError?: (payload: PreviewBuildErrorPayload | null) => void;
  setPreviewProdBuild?: (payload: PreviewProdBuildPayload | null) => void;
  setPreviewPending?: (pending: boolean) => void;
  onPreviewRefresh?: () => void;
  /** Område 6-3 punkt 1: post-check completion → guaranteed status refetch. */
  onVersionStatusRefresh?: () => void;
  onGenerationComplete?: (data: {
    chatId: string;
    versionId?: string;
    previewUrl?: string;
    onlySelectVersionIfWasLatest?: boolean;
  }) => void;
  /** Own-engine preview session metadata (SSE `preview-ready`). */
  onPreviewSessionMeta?: (meta: { previewSessionId: string; versionId: string | null } | null) => void;
  mutateVersions: () => void;
  enableImageMaterialization: boolean;
  autoFixHandlerRef: React.MutableRefObject<(payload: AutoFixPayload) => void>;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  promptAssistMode?: "polish" | "rewrite" | null;
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
  let generationDoneProgressReceived = false;
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
    onPreviewSessionMeta,
    setCurrentPreviewUrl,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewRefresh,
    onVersionStatusRefresh,
    onGenerationComplete,
    mutateVersions,
    enableImageMaterialization,
    autoFixHandlerRef,
  } = ctx;

  const effectiveChatId = ctx.chatId;

  const getProgressToolName = (step: string) => {
    if (isOwnEnginePostStreamPhaseId(step)) return ownEnginePostStreamStepLabelSv(step);
    if (step === "generation") return "Generering";
    if (step === "preview") return "Live-preview";
    if (step === "build-error") return "Byggfel";
    return step;
  };

  const buildProgressSteps = (step: string, phase: string, payload: Record<string, unknown>) => {
    const durationMs =
      typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
        ? payload.durationMs
        : null;
    const reasoningMs =
      typeof payload.reasoningMs === "number" && Number.isFinite(payload.reasoningMs)
        ? payload.reasoningMs
        : null;
    const outputMs =
      typeof payload.outputMs === "number" && Number.isFinite(payload.outputMs)
        ? payload.outputMs
        : null;
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
    const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
    const doneSuffix = durationMs !== null ? ` (${formatSeconds(durationMs)})` : "";

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
      if (phase === "done") {
        const lines = [`Generering klar${doneSuffix}. Startar efterkontroller och slutsteg.`];
        if (reasoningMs !== null || outputMs !== null) {
          lines.push(
            `Faser: reasoning ${formatSeconds(reasoningMs ?? 0)}, output ${formatSeconds(outputMs ?? 0)}.`,
          );
        }
        return lines;
      }
    }
    if (step === "autofix") {
      if (phase === "start") return ["Autofix startad."];
      if (phase === "done") {
        const summary: string[] = [`Autofix klar${doneSuffix}.`];
        if (fixes !== null || warnings !== null) {
          summary.push(
            `Fixar: ${fixes ?? 0}${warnings !== null ? `, varningar: ${warnings}` : ""}.`,
          );
        }
        return summary;
      }
      if (phase === "error") return ["Autofix misslyckades. Fortsätter med rått innehåll."];
    }
    if (step === "verifier") {
      if (phase === "start") {
        return ["Verifiering: läser av projektet efter syntax (ingen kodändring i detta steg)."];
      }
      if (phase === "done") {
        const bc =
          typeof payload.blockingCount === "number" && Number.isFinite(payload.blockingCount)
            ? payload.blockingCount
            : null;
        const qc =
          typeof payload.qualityCount === "number" && Number.isFinite(payload.qualityCount)
            ? payload.qualityCount
            : null;
        return [
          `Verifiering klar${doneSuffix}.${bc !== null ? ` Blockerande fynd: ${bc}.` : ""}${qc !== null ? ` Kvalitetsanteckningar: ${qc}.` : ""}`,
        ];
      }
      if (phase === "error") return ["Verifiering misslyckades; fortsätter med nuvarande kod."];
      if (phase === "skipped") return ["Verifiering hoppades över."];
    }
    if (step === "url_expand") {
      if (phase === "start") return ["Expanderar kortade URL:er till fulla adresser."];
      if (phase === "done") return [`URL-expansion klar${doneSuffix}.`];
    }
    if (step === "materialize_images") {
      if (phase === "start") return ["Materialiserar bildplatshållare (t.ex. riktiga bild-URL:er)…"];
      if (phase === "done") {
        const replaced =
          typeof payload.replacedCount === "number" && Number.isFinite(payload.replacedCount)
            ? payload.replacedCount
            : null;
        if (replaced !== null && replaced > 0) {
          return [`Bytte ut ${replaced} bildplatshållare${doneSuffix}.`];
        }
        return [`Inga bildplatshållare behövde bytas${doneSuffix}.`];
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
        // Tidigare: "Försöker reparera syntaxfel..." — gav intryck av att
        // något var allvarligt fel. Det här är normal autofix-poleringen
        // som körs på varje generation och nästan alltid lyckas inom
        // några sekunder. Neutralare formulering.
        return [
          `Polerar syntax${pass ? ` (pass ${pass})` : ""}${errorCount !== null ? `, ${errorCount} smafel` : ""}.`,
        ];
      }
      if (phase === "retrying") {
        return [`Kör om valideringen efter fixförsök${pass ? ` i pass ${pass}` : ""}.`];
      }
      if (phase === "passed") return ["Validering klar."];
      if (phase === "done") return [`Syntaxvalidering klar${doneSuffix}.`];
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
        const details: string[] = [`Finalisering klar${doneSuffix}.`];
        if (fileCount !== null) details.push(`Filer i versionen: ${fileCount}.`);
        if (versionId) details.push(`Version: ${versionId}.`);
        return details;
      }
    }
    if (step === "preview") {
      if (phase === "starting") {
        return ["Startar tier-2-preview (VM) ..."];
      }
      if (phase === "build-verified") {
        return ["Production build (npm run build) lyckades i verifierings-VM — separat från dev-preview."];
      }
      if (phase === "build-failed") {
        return [
          "Production build misslyckades i verifierings-VM. Dev-server-preview kan ändå vara användbar.",
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
              promptAssistMode: ctx.promptAssistMode ?? null,
              scaffoldId: typeof meta.scaffoldId === "string" ? meta.scaffoldId : null,
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
              appendPromptStrategyPart(setMessages, assistantMessageId, {
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
                if (phase === "done") {
                  generationDoneProgressReceived = true;
                }
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
                : (data as Record<string, unknown>)?.projectId ||
                  (data as Record<string, unknown>)?.v0ProjectId ||
                  (data as Record<string, unknown>)?.v0_project_id ||
                  null;
            if (nextV0ProjectId && !linkedProjectIdFromStream) {
              const id = String(nextV0ProjectId);
              linkedProjectIdFromStream = id;
              onLinkedProjectId?.(id);
            }
            break;
          }
          case "preview-ready": {
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
              onPreviewSessionMeta?.({
                previewSessionId: previewSessionIdRaw,
                versionId: versionIdFromStream,
              });
            }

            setPreviewPending?.(false);
            setPreviewBuildError?.(null);

            if (previewUrl) {
              setCurrentPreviewUrl(previewUrl);
              onPreviewRefresh?.();
              const pendingPost = postCheckQueue[postCheckQueue.length - 1];
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
              setPreviewProdBuild?.({
                verified: pb,
                logSnippet: !pb ? logSnippet : undefined,
              });
              appendProgressPart(
                "preview",
                pb ? "build-verified" : "build-failed",
                { prodBuildVerified: pb, ...tierMeta },
              );
            } else if (previewUrl) {
              setPreviewProdBuild?.(null);
            }

            if (previewUrl && Object.keys(tierMeta).length > 0 && pb === undefined) {
              appendProgressPart("preview", "ready", tierMeta);
            }
            break;
          }
          case "build-error": {
            const buildErrorData = data as Record<string, unknown>;
            const stage = String(buildErrorData.stage ?? "build");
            const message = String(buildErrorData.message ?? "Build failed");
            setPreviewPending?.(false);
            setPreviewBuildError?.({
              stage,
              message,
            });
            appendProgressPart("build-error", "error", { stage, message });
            toast.error(
              `Live-preview gick inte [${stage}]: ${message.slice(0, 400)}. Ingen live-preview förrän VM-previewn lyckas.`,
            );
            break;
          }
          case "version-repair-available": {
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

            appendToolPartToMessage(setMessages, assistantMessageId, {
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

            mutateVersions();
            toast.message("Serverreparation tillgänglig", {
              description: summary,
            });
            break;
          }
          case "done": {
            didReceiveDone = true;
            streamStats.didReceiveDone = true;
            if (
              !generationDoneProgressReceived &&
              (generationProgressStarted ||
                accumulatedContent.trim().length > 0 ||
                accumulatedThinking.trim().length > 0)
            ) {
              appendProgressPart("generation", "done");
            }
            const doneData =
              typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const donePreflight = parseDonePreflight(doneData);
            const doneV0ProjectId =
              doneData.projectId || doneData.v0ProjectId || doneData.v0_project_id || null;
            if (doneV0ProjectId && !linkedProjectIdFromStream) {
              linkedProjectIdFromStream = String(doneV0ProjectId);
              onLinkedProjectId?.(linkedProjectIdFromStream);
            }
            const effectiveDoneDemo = resolveCanonicalLivePreviewUrlFromDonePayload(
              doneData as { previewUrl?: unknown; demoUrl?: unknown },
            );
            if (effectiveDoneDemo) {
              setCurrentPreviewUrl(effectiveDoneDemo);
              onPreviewRefresh?.();
            }
            setPreviewPending?.(Boolean(doneData.previewPending));
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
    if (signal.aborted) {
      const abortErr = new Error("Streaming aborted by client");
      abortErr.name = "AbortError";
      throw abortErr;
    }
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
  if (latestMaterialize && !signal.aborted) {
    void triggerImageMaterialization({
      chatId: latestMaterialize.chatId,
      versionId: latestMaterialize.versionId,
      enabled: enableImageMaterialization,
    }).then((result) => {
      if (!result) return;
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:image-materialization",
        toolName: "Bildmaterialisering",
        toolCallId: `image-materialization:${latestMaterialize.versionId}`,
        state: result.error ? "output-error" : "output-available",
        output: {
          attempted: result.attempted,
          strategy: result.strategy,
          replaced: result.replaced,
          uploaded: result.uploaded,
          skipped: result.skipped,
          warningCount: result.warningCount,
          reason: result.reason ?? null,
          error: result.error ?? null,
          steps: result.error
            ? ["Bildmaterialisering misslyckades efter att versionen sparats."]
            : !result.attempted
              ? [result.reason === "blob_not_configured"
                ? "Blob-materialisering hoppades över eftersom Blob inte är konfigurerat."
                : "Bildmaterialisering hoppades över i den här körningen."]
              : result.replaced > 0
                ? [`Speglade ${result.replaced} bildreferenser till Blob efter att versionen sparats.`]
                : ["Ingen ytterligare bildmaterialisering behövdes efter att versionen sparats."],
        },
      } as Parameters<typeof appendToolPartToMessage>[2]);
    });
  }

  const latestPostCheck =
    postCheckQueue.length > 0 ? postCheckQueue[postCheckQueue.length - 1] : null;
  if (latestPostCheck && !signal.aborted) {
    void runPostGenerationChecks({
      chatId: latestPostCheck.chatId,
      versionId: latestPostCheck.versionId,
      demoUrl: latestPostCheck.demoUrl ?? null,
      preflight: latestPostCheck.preflight ?? null,
      assistantMessageId,
      setMessages,
      streamQuality,
      mutateVersions,
      onAutoFix: (payload) => autoFixHandlerRef.current(payload),
      onComplete: onVersionStatusRefresh,
    });
  }

  return { streamQuality, chatIdFromStream };
}
