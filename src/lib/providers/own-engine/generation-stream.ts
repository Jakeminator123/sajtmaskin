import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { parseSSEBuffer, SuspenseLineProcessor } from "@/lib/gen/stream/sse-parser";
import {
  EmptyGenerationError,
  PartialFileOutputError,
  type FinalizeResult,
} from "@/lib/gen/stream/finalize-version";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import { finalizeOrHandleEmptyGeneration } from "@/lib/gen/stream/shared-own-engine-helpers";
import {
  buildF3AwaitingInputUiPart,
  F3_CONTINUATION_EMPTY_QUESTION,
  F3_CONTINUATION_EXHAUSTED_MESSAGE,
  F3_CONTINUATION_FIRST_QUESTION,
  F3_CONTINUATION_LOOP_QUESTION,
  F3_CONTINUATION_PARENT_HAS_CODE_QUESTION,
  F3_EMPTY_NO_CODE_REASON,
  F3_TOOL_ONLY_EXHAUSTED_REASON,
} from "@/lib/gen/stream/f3-continuation";
import { resolveDossiersPresentInVersion } from "@/lib/gen/dossiers/version-presence";
import { dossierRequiresF3 } from "@/lib/gen/dossiers/types";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import { emitOwnEngineToolCallSse } from "./generation-stream-tools";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";
import { classifyProviderError } from "./provider-error-messages";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import * as chatRepo from "@/lib/db/chat-repository-pg";

type UrlMap = Record<string, string>;

/**
 * `done`-event reason for a round whose only tool-call activity was a
 * MALFORMED suggestIntegration/requestEnvVar call (C1, prod chat e298da50).
 * Distinct from `tool_only_empty_generation` (well-formed signal) and
 * `f3_empty_no_code_generation` (truly silent F3 round, `f3-continuation.ts`)
 * — this is "the model tried to signal something but the call was garbage".
 */
const MALFORMED_INTEGRATION_TOOL_CALL_REASON = "malformed_integration_tool_call_empty_generation";

/**
 * User-facing copy for {@link MALFORMED_INTEGRATION_TOOL_CALL_REASON} (C1/C3).
 * Points the user at a concrete next step instead of the generic "no code,
 * try the same prompt again" dead end — same copy whether the malformed call
 * happened in F2 (free-text "Bygg integrationer" outside the button flow) or
 * F3 (isSilentF3NoCode already handles zero-tool-call F3 rounds separately;
 * this only fires when F2's own tool-only branch doesn't apply).
 */
const MALFORMED_INTEGRATION_TOOL_CALL_MESSAGE =
  "Integrationsförslaget kunde inte tolkas — försök igen eller starta F3-bygget via knappen.";

/**
 * Pulls a non-negative reasoning-token count out of whatever shape the
 * upstream pipeline forwarded in its `done` event. Both the OpenAI
 * Responses API (`usage.reasoning_tokens`) and the AI-SDK wrappers
 * (`tokenUsage.reasoningTokens`) eventually reach us as a flat object on
 * the `done` SSE payload, but the exact key has historically drifted
 * between providers/wrappers. We normalise it here so downstream summaries
 * see "visible output tokens" (`outputTokens` / `completionTokens`) and
 * "reasoning tokens" as two distinct numbers — without that, a thinking
 * model that emits 38 files from a 600-token visible response looks
 * suspiciously cheap in the logs.
 */
function extractReasoningTokens(streamResponse: unknown): number | undefined {
  if (!streamResponse || typeof streamResponse !== "object") return undefined;
  const root = streamResponse as Record<string, unknown>;

  const candidates: unknown[] = [
    root.reasoningTokens,
    root.reasoning_tokens,
  ];

  const usage =
    typeof root.usage === "object" && root.usage !== null
      ? (root.usage as Record<string, unknown>)
      : null;
  if (usage) {
    candidates.push(usage.reasoningTokens, usage.reasoning_tokens);
  }

  const tokenUsage =
    typeof root.tokenUsage === "object" && root.tokenUsage !== null
      ? (root.tokenUsage as Record<string, unknown>)
      : null;
  if (tokenUsage) {
    candidates.push(tokenUsage.reasoningTokens, tokenUsage.reasoning_tokens);
  }

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

export interface GenerationStreamMeta extends Record<string, unknown> {
  modelId: string;
  modelTier: string;
  buildProfileId: string;
  buildProfileLabel: string;
  enginePath: string;
  thinking: boolean;
  removedCapabilities?: string[];
  readdedCapabilities?: string[];
  removedDossierIds?: string[];
  f3ApprovedCapabilities?: string[];
  f3ApprovedProviders?: string[];
}

export interface GenerationStreamParams {
  chatId: string;
  pipelineStream: ReadableStream<Uint8Array>;
  abortSignal?: AbortSignal;
  meta: GenerationStreamMeta;
  engineModel: string;
  optimizedMessage: string;
  rawPrompt?: string;
  engineIntent: BuildIntent;
  buildSpec: BuildSpec;
  routePlan: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: UrlMap;
  commitCredits: () => Promise<void>;
  previousFiles?: CodeFile[];
  /** SHA-256 of deterministic generation inputs (prompt lineage). */
  lineageHash?: string | null;
  /** When set, repair replaces this version in-place instead of creating a new one. */
  targetVersionId?: string | null;
  /** F3 only: parent F2 version id, forwarded into `engine_versions.parent_version_id`. */
  lifecycleParentVersionId?: string | null;
  /**
   * F3 loop-breaker (P2 F3-loop): number of no-code rounds (tool-only OR
   * completely silent) this F3 kick has ALREADY produced (read from the
   * consumed continuation marker by the follow-up route). `0`/absent for
   * the initial F3 kick. If THIS stream also ends without code, the
   * persisted marker carries `prior + 1` — and at `prior >= 2` no new
   * marker is persisted at all (calm terminal close).
   */
  f3PriorToolOnlyRounds?: number | null;
  /**
   * Providers carried by the consumed F3 marker (Bugbot HIGH follow-up):
   * a SILENT no-code approval round signals nothing itself, so the new
   * marker forwards these — a retry-approval keeps its provider→dossier
   * mapping instead of losing the verbatim templates.
   */
  f3PriorSuggestedProviders?: string[] | null;
  /**
   * Mutable container holding the concatenated reasoning emitted by the
   * pipeline. The pipeline writes into `current` once the stream completes
   * (success/abort/error); the finalize step reads it just before persisting
   * the assistant message so the chain-of-thought survives a page refresh.
   */
  accumulatedThinkingRef?: { current: string | null };
}

export function createOwnEngineGenerationStream(
  params: GenerationStreamParams,
): ReadableStream<Uint8Array> {
  const {
    chatId,
    pipelineStream,
    abortSignal,
    meta,
    engineModel,
    optimizedMessage,
    rawPrompt,
    engineIntent,
    buildSpec,
    routePlan,
    orchestrationContract,
    resolvedScaffold,
    urlMap,
    commitCredits,
    previousFiles,
    lineageHash,
    targetVersionId,
    lifecycleParentVersionId,
    f3PriorToolOnlyRounds,
    f3PriorSuggestedProviders,
    accumulatedThinkingRef,
  } = params;

  const engineStartedAt = Date.now();
  const pipelineReader = pipelineStream.getReader();
  const pipelineDecoder = new TextDecoder();
  let engineControllerClosed = false;
  let enginePingTimer: ReturnType<typeof setInterval> | null = null;
  const stopEnginePing = () => {
    if (!enginePingTimer) return;
    clearInterval(enginePingTimer);
    enginePingTimer = null;
  };

  return new ReadableStream({
    cancel() {
      engineControllerClosed = true;
      stopEnginePing();
      pipelineReader.cancel().catch(() => {});
    },
    async start(controller) {
      const enc = new TextEncoder();
      let sseBuffer = "";
      let accumulatedContent = "";
      let didSendDone = false;
      let fallbackVerificationSummary =
        "Återställd ofullständig version efter streamavbrott. Automatisk verifiering hoppades över.";
      const toolSignaledProviders = new Set<string>();
      // Codex P2 (PR #383): full-set inkl. env-lösa välformade förslag —
      // används av F3-markern (provider→dossier), inte av detektorn.
      const allSignaledProviders = new Set<string>();
      const toolCallNames = new Set<string>();
      let sawBlockingToolCall = false;
      // C1 (empty-output tool feedback, prod chat e298da50 "Bygg
      // integrationer nu" as free text): counts suggestIntegration/
      // requestEnvVar calls dropped for being MALFORMED — these never reach
      // `toolCallNames`, so a round that only produced garbage tool-call
      // JSON still looked completely silent to `handleEmptyGeneration`.
      let malformedIntegrationToolCallCount = 0;
      const suspense = new SuspenseLineProcessor(undefined, { urlMap });
      const toolOnlyIntegrationTools = new Set(["suggestIntegration", "requestEnvVar"]);

      const safeEnqueue = (data: Uint8Array) => {
        if (engineControllerClosed) return;
        try {
          controller.enqueue(data);
        } catch {
          engineControllerClosed = true;
          stopEnginePing();
        }
      };

      const safeClose = () => {
        if (engineControllerClosed) return;
        engineControllerClosed = true;
        stopEnginePing();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const emitProgress = (event: string, data: Record<string, unknown>) => {
        safeEnqueue(enc.encode(formatSSEEvent("progress", { step: event, ...data })));
      };

      const finishWithoutVersion = async (
        reason: string,
        options?: { userMessage?: string; awaitingInput?: boolean; awaitingInputPrompt?: string },
      ) => {
        didSendDone = true;
        const toolCalls = Array.from(toolCallNames);
        const awaitingInput = options?.awaitingInput ?? sawBlockingToolCall;
        emitProgress("generation", {
          phase: awaitingInput ? "awaiting-input" : "empty-output",
          reason,
        });

        if (options?.userMessage) {
          safeEnqueue(enc.encode(formatSSEEvent("content", options.userMessage)));
        }

        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput,
              ...(options?.awaitingInputPrompt
                ? { awaitingInputPrompt: options.awaitingInputPrompt }
                : {}),
              toolCalls,
              reason,
            }),
          ),
        );

        devLogAppend("in-progress", {
          type: awaitingInput ? "site.awaiting_input" : "site.empty_generation",
          chatId,
          reason,
          toolCalls,
          awaitingInputPrompt: options?.awaitingInputPrompt ?? null,
          message: options?.userMessage ?? null,
        });
        devLogFinalizeSite();
        await commitCredits();
      };

      const handleEmptyGeneration = async (reason: string, error: EmptyGenerationError) => {
        const toolCalls = Array.from(toolCallNames);
        warnLog("engine", "No code emitted before finalize", {
          chatId: error.chatId,
          scaffold: error.scaffoldId,
          reason,
          toolCalls,
        });

        const hasOnlyIntegrationToolCalls =
          toolCalls.length > 0 && toolCalls.every((name) => toolOnlyIntegrationTools.has(name));
        const isF3Round = buildSpec.previewPolicy === "fidelity3";
        // Bugbot HIGH (PR #383): a completely SILENT F3 round — zero tool
        // calls AND zero code (the prod "Model produced no text events"
        // case, and any approval round where the model answers empty even
        // with the integration tools removed) — must take the SAME
        // loop-breaker path as tool-only rounds. Previously it fell into
        // the generic "Försök igen med samma prompt" dead end: the marker
        // was already atomically consumed and the round counter was never
        // applied, leaving the user stranded in F3.
        const isSilentF3NoCode = isF3Round && toolCalls.length === 0;

        if (hasOnlyIntegrationToolCalls || isSilentF3NoCode) {
          const priorRounds =
            typeof f3PriorToolOnlyRounds === "number" && f3PriorToolOnlyRounds > 0
              ? Math.floor(f3PriorToolOnlyRounds)
              : 0;
          const noCodeRounds = priorRounds + 1;

          // Loop-breaker (P2 F3-loop, åtgärd 3): max ONE repeated no-code
          // round per F3 kick — tool-only and silent-empty share the same
          // counter. The SECOND repeat closes F3 calmly with a terminal
          // message and does NOT persist a new marker — the next user
          // message runs as a plain F2 follow-up instead of an identical
          // "Svar krävs" loop. A NEW explicit "Bygg integrationer" kick
          // starts a fresh counter (no pending marker → prior = 0).
          if (isF3Round && noCodeRounds >= 3) {
            await chatRepo
              .addMessage(chatId, "assistant", F3_CONTINUATION_EXHAUSTED_MESSAGE)
              .catch(() => null);
            await finishWithoutVersion(F3_TOOL_ONLY_EXHAUSTED_REASON, {
              awaitingInput: false,
              userMessage: F3_CONTINUATION_EXHAUSTED_MESSAGE,
            });
            return;
          }

          // Task 1c (ai-tool-calling incident): a first-round F3 no-code result
          // must NOT claim "modellen skrev inga kodfiler" when the parent design
          // version already carries the integration/dossier artifacts — the code
          // exists, it just lived in F2. `previousFiles` is the parent version's
          // file set (loaded upstream for the follow-up). Only overrides the
          // FIRST round's copy; the loop/exhausted copy stays as-is.
          const parentHasIntegrationCode =
            isF3Round &&
            noCodeRounds < 2 &&
            resolveDossiersPresentInVersion(previousFiles ?? []).some((selected) =>
              dossierRequiresF3(selected.entry),
            );
          if (parentHasIntegrationCode) {
            warnLog("engine", "F3 no-code round but parent version has integration code", {
              chatId,
              toolCalls,
              parentVersionId: lifecycleParentVersionId ?? null,
            });
          }

          // Honest copy per variant: tool-only round 1 keeps the classic
          // "Integrationer signalerades…" proposal question; a repeated
          // tool-only round offers closure; a silent round never claims
          // integrations were signaled (nothing was); and when the parent
          // version already holds the integration code we say so instead of
          // falsely claiming no code files.
          const awaitingInputPrompt = parentHasIntegrationCode
            ? F3_CONTINUATION_PARENT_HAS_CODE_QUESTION
            : isSilentF3NoCode
              ? F3_CONTINUATION_EMPTY_QUESTION
              : noCodeRounds >= 2
                ? F3_CONTINUATION_LOOP_QUESTION
                : F3_CONTINUATION_FIRST_QUESTION;
          // P1 F3-entry (BUG-SWARM-BACKLOG): persist the awaiting-input
          // question WITH the F3-continuation marker. Without a version and
          // without this message the F3 stage only lived in the client's
          // volatile stream state, so the user's "Godkänn förslag" reply came
          // back as a plain F2 follow-up and the SDK codegen ran in the wrong
          // lane. The follow-up route reads this marker server-side
          // (`resolvePendingF3Continuation`) to inherit the stage for the
          // direct reply. The marker also carries the signaled providers
          // (approval → dossier-capability injection; silent rounds forward
          // the PRIOR marker's providers so a retry-approval keeps its
          // dossier mapping) and the no-code round counter (loop-breaker).
          // Best-effort: a persist failure degrades to the old behavior
          // instead of breaking the stream.
          if (isF3Round) {
            const markerSuggestedProviders = Array.from(
              new Set([
                ...(f3PriorSuggestedProviders ?? []),
                // Full-set (Codex P2, PR #383): env-lösa välformade förslag
                // ska också bära provider→dossier-mappningen in i markern.
                ...allSignaledProviders,
                ...toolSignaledProviders,
              ]),
            );
            await chatRepo
              .addMessage(chatId, "assistant", awaitingInputPrompt, undefined, [
                buildF3AwaitingInputUiPart({
                  question: awaitingInputPrompt,
                  parentVersionId: lifecycleParentVersionId ?? null,
                  suggestedProviders: markerSuggestedProviders,
                  toolOnlyRounds: noCodeRounds,
                }),
              ])
              .catch(() => null);
          }
          await finishWithoutVersion(
            isSilentF3NoCode ? F3_EMPTY_NO_CODE_REASON : "tool_only_empty_generation",
            {
              awaitingInput: true,
              awaitingInputPrompt,
              userMessage: awaitingInputPrompt,
            },
          );
          return;
        }

        // C1/C3 (empty-output tool feedback, prod chat e298da50): the F3
        // branch above already owns "zero surviving tool calls" via
        // `isSilentF3NoCode`, so this only fires for F2 (or a `previewPolicy`
        // that never entered F3 at all) — exactly the reported bug, where
        // free chat text like "Bygg integrationer nu" runs the default F2
        // lane and a malformed suggestIntegration call gets dropped silently.
        // Replaces the generic "Försök igen med samma prompt" dead end with
        // a message that tells the user what actually happened and points
        // them at the F3 button.
        if (toolCalls.length === 0 && malformedIntegrationToolCallCount > 0) {
          await finishWithoutVersion(MALFORMED_INTEGRATION_TOOL_CALL_REASON, {
            awaitingInput: true,
            awaitingInputPrompt: MALFORMED_INTEGRATION_TOOL_CALL_MESSAGE,
            userMessage: MALFORMED_INTEGRATION_TOOL_CALL_MESSAGE,
          });
          return;
        }

        if (toolCalls.length > 0) {
          await finishWithoutVersion(reason, { awaitingInput: sawBlockingToolCall });
          return;
        }

        await finishWithoutVersion(reason, {
          userMessage: "Ingen kod genererades i första försöket. Försök igen med samma prompt.",
        });
      };

      const handlePartialFileOutput = async (error: PartialFileOutputError) => {
        const toolCalls = Array.from(toolCallNames);
        const reason = "partial_file_output";
        warnLog("engine", "Partial file output detected before persist", {
          chatId: error.chatId,
          scaffold: error.scaffoldId,
          issues: error.issues,
          toolCalls,
        });

        didSendDone = true;
        emitProgress("generation", {
          phase: "partial-file-output",
          reason,
          issueCount: error.issues.length,
        });

        safeEnqueue(
          enc.encode(
            formatSSEEvent("error", {
              message:
                "Genereringen stoppades innan sparning eftersom minst en fil såg ut som en delsnutt i stället för en komplett fil.",
            }),
          ),
        );
        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput: false,
              toolCalls,
              reason,
            }),
          ),
        );

        devLogAppend("in-progress", {
          type: "site.partial_file_output",
          chatId,
          reason,
          issues: error.issues,
          toolCalls,
          message:
            "Genereringen stoppades innan version skapades eftersom en eller flera filer såg ut som partiel snippet-output.",
        });
        devLogFinalizeSite();
        await commitCredits();
      };

      safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
      safeEnqueue(enc.encode(formatSSEEvent("meta", meta)));
      emitProgress("generation", { phase: "start" });

      enginePingTimer = setInterval(() => {
        if (engineControllerClosed) return;
        safeEnqueue(enc.encode(formatSSEEvent("ping", { ts: Date.now() })));
      }, 15000);

      const resolvedTier: CanonicalModelId | undefined = isCanonicalModelId(meta.modelTier)
        ? (meta.modelTier as CanonicalModelId)
        : undefined;
      const buildFinalizeParams = (
        content: string,
        doneData: Record<string, unknown> | null,
        extra?: { logNote?: string; runAutofix?: boolean },
      ) => ({
        accumulatedContent: content,
        chatId,
        model: engineModel,
        resolvedTier,
        originalPrompt: rawPrompt ?? optimizedMessage,
        buildIntent: engineIntent,
        buildSpec,
        routePlan,
        orchestrationContract,
        resolvedScaffold,
        urlMap,
        startedAt: engineStartedAt,
        orchestrationStreamMeta: meta as Record<string, unknown>,
        tokenUsage: {
          prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
          completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
        },
        previousFiles,
        onProgress: emitProgress,
        lineageHash,
        targetVersionId,
        lifecycleParentVersionId,
        // SAJ-25: propagate repairPassIndex so finalize-version's `logPassId`
        // bucket stops collapsing follow-up passes under `:repair-0:` and
        // pruneStaleVersionErrorLogs can drop earlier-pass rows when the
        // current pass clears `verificationBlocked`. Mirrors the value used
        // in runOwnEngineStreamPostFinalize so both sides agree.
        repairPassIndex: targetVersionId ? 1 : 0,
        accumulatedThinking: accumulatedThinkingRef?.current ?? null,
        // Builder client always runs post-check quality-gate after `done`
        // (or after queued autofix), so finalize can safely skip duplicate
        // warm-tsc when that lane already includes `typecheck`.
        willRunQualityGate: true,
        // Wave 7 R2 guard: stark signal att quality-gate faktiskt är
        // planerad. Utan denna flagga kör finalize warm-tsc ändå även om
        // `willRunQualityGate` råkar vara true — se fast-path.ts för
        // guard-logik. Builder-streamen är det enda callsite idag som
        // garanterat har post-check quality-gate efter `done`.
        qualityGatePlanned: true,
        ...extra,
      });

      const emitDoneWithVersion = async (
        finalized: FinalizeResult,
        options?: { recoveredAfterStreamAbort?: boolean },
      ) => {
        didSendDone = true;
        await runOwnEngineStreamPostFinalize({
          sse: { enc, safeEnqueue },
          chatId,
          finalized,
          accumulatedContent,
          toolSignaledProviders,
          engineStartedAt,
          commitCredits,
          buildSpec,
          recoveredAfterStreamAbort: options?.recoveredAfterStreamAbort === true,
          repairPassIndex: targetVersionId ? 1 : 0,
        });
      };

      try {
        while (true) {
          if (engineControllerClosed || abortSignal?.aborted) break;
          const { done, value } = await pipelineReader.read();
          if (done) break;

          sseBuffer += pipelineDecoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(sseBuffer);
          sseBuffer = remaining;

          for (const evt of events) {
            if (engineControllerClosed) break;

            switch (evt.event) {
              case "thinking": {
                const text =
                  typeof (evt.data as Record<string, unknown>)?.text === "string"
                    ? (evt.data as Record<string, string>).text
                    : "";
                if (text) {
                  safeEnqueue(enc.encode(formatSSEEvent("thinking", text)));
                }
                break;
              }

              case "content": {
                const text =
                  typeof (evt.data as Record<string, unknown>)?.text === "string"
                    ? (evt.data as Record<string, string>).text
                    : "";
                if (text) {
                  const processed = suspense.process(text);
                  accumulatedContent += processed;
                  if (processed) {
                    safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                  }
                }
                break;
              }

              case "tool-call": {
                const toolData = evt.data as Record<string, unknown>;
                emitOwnEngineToolCallSse(
                  {
                    enc,
                    safeEnqueue,
                    toolCallNames,
                    toolSignaledProviders,
                    allSignaledProviders,
                    setBlockingToolCall: () => {
                      sawBlockingToolCall = true;
                    },
                    registerMalformedIntegrationToolCall: () => {
                      malformedIntegrationToolCallCount += 1;
                    },
                    lifecycleStage:
                      buildSpec.previewPolicy === "fidelity3"
                        ? "integrations"
                        : "design",
                  },
                  toolData,
                );
                safeEnqueue(
                  enc.encode(
                    formatSSEEvent("progress", {
                      step: "generation",
                      phase: "tool",
                      toolName:
                        typeof toolData?.toolName === "string" ? toolData.toolName : undefined,
                    }),
                  ),
                );
                break;
              }

              case "progress": {
                const progressData = evt.data as Record<string, unknown>;
                const step =
                  typeof progressData?.step === "string" ? progressData.step : "generation";
                const phase =
                  typeof progressData?.phase === "string" ? progressData.phase : "streaming";
                emitProgress(step, { ...progressData, phase });
                break;
              }

              case "done": {
                const flushed = suspense.flush();
                if (flushed) {
                  accumulatedContent += flushed;
                  safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                }

                const doneData = evt.data as Record<string, unknown> | null;
                const reasoningTokens = extractReasoningTokens(doneData);
                if (typeof reasoningTokens === "number") {
                  // Emit reasoning-token usage as a first-class signal so the
                  // generationslogg summary can show "visible output tokens"
                  // (`outputTokens`) and "reasoning tokens" as two distinct
                  // numbers — the previous summary made a thinking model that
                  // emitted dozens of files from a 600-token visible response
                  // look suspiciously cheap. The downstream `tokenUsage` shape
                  // is intentionally left untouched here; finalize-version
                  // still receives the visible (prompt/completion) totals.
                  devLogAppend("in-progress", {
                    type: "stream.token-usage",
                    chatId,
                    promptTokens:
                      typeof doneData?.promptTokens === "number"
                        ? doneData.promptTokens
                        : null,
                    outputTokens:
                      typeof doneData?.completionTokens === "number"
                        ? doneData.completionTokens
                        : null,
                    reasoningTokens,
                  });
                }
                const finalized = await finalizeOrHandleEmptyGeneration({
                  finalizeParams: buildFinalizeParams(accumulatedContent, doneData),
                  emptyGenerationReason: "done_empty_output",
                  handleEmptyGeneration,
                  handlePartialFileOutput,
                });
                if (!finalized) break;

                await emitDoneWithVersion(finalized);
                break;
              }

              case "error": {
                const data = evt.data as Record<string, unknown> | undefined;
                const rawMsg =
                  typeof data?.message === "string"
                    ? (data.message as string)
                    : "Engine generation failed";
                const classified = classifyProviderError(
                  // Pass the whole data shape so classifier can read code/status.
                  { ...(data ?? {}), message: rawMsg },
                  rawMsg,
                );
                fallbackVerificationSummary = `Återställd ofullständig version efter streamfel: ${classified.userMessage}`;
                safeEnqueue(
                  enc.encode(
                    formatSSEEvent("error", {
                      message: classified.userMessage,
                      ...(classified.code ? { code: classified.code } : {}),
                      ...(classified.permanent ? { permanent: true } : {}),
                    }),
                  ),
                );
                devLogAppend("in-progress", {
                  type: "comm.error.create",
                  chatId,
                  message: classified.userMessage,
                  rawMessage: rawMsg !== classified.userMessage ? rawMsg : undefined,
                  providerCode: classified.code,
                  permanent: classified.permanent,
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error("Engine streaming error:", error);
        const classified = classifyProviderError(error, "Engine streaming failed");
        fallbackVerificationSummary = `Återställd ofullständig version efter streamfel: ${classified.userMessage}`;
        safeEnqueue(
          enc.encode(
            formatSSEEvent("error", {
              message: classified.userMessage,
              ...(classified.code ? { code: classified.code } : {}),
              ...(classified.permanent ? { permanent: true } : {}),
            }),
          ),
        );
      } finally {
        try {
          pipelineReader.releaseLock();
        } catch {
          /* Reader may already be released */
        }

        if (sseBuffer.trim()) {
          const { events: finalEvents } = parseSSEBuffer(sseBuffer + "\n");
          for (const evt of finalEvents) {
            if (evt.event === "content") {
              const text =
                typeof (evt.data as Record<string, unknown>)?.text === "string"
                  ? (evt.data as Record<string, string>).text
                  : "";
              if (text) {
                const processed = suspense.process(text);
                accumulatedContent += processed;
                if (processed) {
                  safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                }
              }
            } else if (evt.event === "done" && !didSendDone) {
              const flushed = suspense.flush();
              if (flushed) {
                accumulatedContent += flushed;
                safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
              }

              const doneData = evt.data as Record<string, unknown> | null;
              const bufFinalized = await finalizeOrHandleEmptyGeneration({
                finalizeParams: buildFinalizeParams(accumulatedContent, doneData, {
                  logNote: "Done from buffer flush",
                }),
                emptyGenerationReason: "buffer_flush_empty_output",
                handleEmptyGeneration,
                handlePartialFileOutput,
              });
              if (!bufFinalized) break;

              await emitDoneWithVersion(bufFinalized);
            }
          }
        }

        if (!didSendDone) {
          const flushed = suspense.flush();
          if (flushed) accumulatedContent += flushed;

          if (accumulatedContent) {
            try {
              const fallbackFinalized = await finalizeOrHandleEmptyGeneration({
                finalizeParams: buildFinalizeParams(accumulatedContent, null, {
                  runAutofix: false,
                  logNote: "Done from fallback flush",
                }),
                emptyGenerationReason: "fallback_flush_empty_output",
                handleEmptyGeneration,
                handlePartialFileOutput,
              });
              if (fallbackFinalized) {
                await chatRepo
                  .failVersionVerification(
                    fallbackFinalized.version.id,
                    fallbackVerificationSummary,
                  )
                  .catch(() => null);
                await emitDoneWithVersion(fallbackFinalized, {
                  recoveredAfterStreamAbort: true,
                });
              }
            } catch {
              /* ignore persistence errors in cleanup */
            }
          }

          if (!didSendDone) {
            safeEnqueue(
              enc.encode(
                formatSSEEvent("done", {
                  chatId,
                  versionId: null,
                  messageId: null,
                  ...previewUrlField(null),
                }),
              ),
            );
            await commitCredits();
          }
        }
        safeClose();
      }
    },
  });
}
