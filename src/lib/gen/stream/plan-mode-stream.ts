import {
  createBuilderStreamEvent,
  type BuilderMetaPayload,
  type BuilderStreamEvent,
  type BuilderToolCallPayload,
} from "@/lib/gen/stream/builder-stream-contract";
import { parseSSEBuffer } from "@/lib/gen/route-helpers";
import { formatSSEEvent } from "@/lib/streaming";

type ToolCallRecord = Record<string, unknown>;
type PlanArtifact = Record<string, unknown>;

function getToolName(toolData: ToolCallRecord): string {
  return typeof toolData.toolName === "string" ? toolData.toolName : "";
}

function getToolArgs(toolData: ToolCallRecord): Record<string, unknown> {
  const args = toolData.args;
  return args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function encodeBuilderEvent(
  encoder: TextEncoder,
  streamEvent: BuilderStreamEvent,
): Uint8Array {
  return encoder.encode(formatSSEEvent(streamEvent.event, streamEvent.data));
}

export function createPlanModeStream(params: {
  pipelineStream: ReadableStream<Uint8Array>;
  chatId?: string;
  meta: BuilderMetaPayload;
  resolvePlanArtifact: (
    accumulatedContent: string,
    toolPlanArtifact: PlanArtifact | null,
  ) => PlanArtifact;
  enrichPlanArtifact?: (toolArgs: Record<string, unknown>) => PlanArtifact;
  persistAssistantSummary: (planData: PlanArtifact, hasBlockers: boolean) => Promise<void>;
  buildDonePayload: (planData: PlanArtifact, hasBlockers: boolean) => Record<string, unknown>;
  commitCredits: () => Promise<void>;
  commitCreditsPosition?: "before-done" | "after-done";
  onResolved?: (
    planData: PlanArtifact,
    hasBlockers: boolean,
    accumulatedContent: string,
  ) => Promise<void> | void;
  normalizeQuestionToolCallIds?: boolean;
}) {
  const {
    pipelineStream,
    chatId,
    meta,
    resolvePlanArtifact,
    enrichPlanArtifact,
    persistAssistantSummary,
    buildDonePayload,
    commitCredits,
    commitCreditsPosition = "after-done",
    onResolved,
    normalizeQuestionToolCallIds = false,
  } = params;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = pipelineStream.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulatedContent = "";
      let controllerClosed = false;
      let toolPlanArtifact: PlanArtifact | null = null;

      const safeEnqueue = (streamEvent: BuilderStreamEvent) => {
        if (controllerClosed) return;
        try {
          controller.enqueue(encodeBuilderEvent(encoder, streamEvent));
        } catch {
          controllerClosed = true;
        }
      };

      if (chatId) {
        safeEnqueue(createBuilderStreamEvent("chatId", { id: chatId }));
      }
      safeEnqueue(createBuilderStreamEvent("meta", meta));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(sseBuffer);
          sseBuffer = remaining;

          for (const evt of events) {
            if (controllerClosed) break;

            switch (evt.event) {
              case "thinking": {
                const text =
                  typeof evt.data === "string"
                    ? evt.data
                    : typeof evt.data?.text === "string"
                      ? evt.data.text
                      : "";
                if (text) {
                  safeEnqueue(createBuilderStreamEvent("thinking", { text }));
                }
                break;
              }
              case "content": {
                const text =
                  typeof evt.data === "string"
                    ? evt.data
                    : typeof evt.data?.text === "string"
                      ? evt.data.text
                      : "";
                if (text) {
                  accumulatedContent += text;
                  safeEnqueue(createBuilderStreamEvent("content", { text }));
                }
                break;
              }
              case "tool-call": {
                const toolData =
                  evt.data && typeof evt.data === "object"
                    ? (evt.data as ToolCallRecord)
                    : {};
                const toolName = getToolName(toolData);
                const toolArgs = getToolArgs(toolData);

                if (toolName === "emitPlanArtifact") {
                  const emittedPlanArtifact = enrichPlanArtifact
                    ? enrichPlanArtifact(toolArgs)
                    : toolArgs;
                  toolPlanArtifact = emittedPlanArtifact;
                  safeEnqueue(
                    createBuilderStreamEvent("tool-call", {
                      toolName,
                      toolCallId:
                        typeof toolData.toolCallId === "string"
                          ? toolData.toolCallId
                          : `plan-${Date.now()}`,
                      args: emittedPlanArtifact,
                    }),
                  );
                } else if (
                  toolName === "suggestIntegration" ||
                  toolName === "requestEnvVar" ||
                  toolName === "askClarifyingQuestion"
                ) {
                  const forwarded: BuilderToolCallPayload =
                    toolName === "askClarifyingQuestion" &&
                    normalizeQuestionToolCallIds &&
                    typeof toolData.toolCallId !== "string"
                      ? {
                          ...toolData,
                          toolName,
                          toolCallId: `q-${Date.now()}`,
                          args: toolArgs,
                        }
                      : {
                          ...toolData,
                          toolName,
                          args: toolArgs,
                        };
                  safeEnqueue(createBuilderStreamEvent("tool-call", forwarded));
                }
                break;
              }
              case "done":
              case "error":
                break;
            }
          }
        }
      } catch (error) {
        if (!controllerClosed) {
          safeEnqueue(
            createBuilderStreamEvent("error", {
              message:
                error instanceof Error ? error.message : "Plan generation failed",
            }),
          );
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }

      const planData = resolvePlanArtifact(accumulatedContent, toolPlanArtifact);
      const hasBlockers =
        Array.isArray(planData?.blockers) && (planData.blockers as unknown[]).length > 0;

      await onResolved?.(planData, hasBlockers, accumulatedContent);
      await persistAssistantSummary(planData, hasBlockers);

      if (commitCreditsPosition === "before-done") {
        await commitCredits();
      }

      safeEnqueue(createBuilderStreamEvent("done", buildDonePayload(planData, hasBlockers)));

      if (commitCreditsPosition === "after-done") {
        await commitCredits();
      }

      if (!controllerClosed) {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
}
