import {
  appendToolPartToMessage,
  coerceIntegrationSignals,
  coerceUiParts,
  integrationSignalToToolPart,
  mergeStreamingText,
  mergeUiParts,
  recordStreamParts,
  recordStreamText,
} from "./helpers";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";

type ContentDeps = {
  appendProgressPart: (
    step: string,
    phase: string,
    payload?: Record<string, unknown>,
  ) => void;
  requestStreamingTextFlush: (kind: "content" | "thinking") => void;
};

export function handleThinkingEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: ContentDeps,
) {
  const thinkingText =
    typeof data === "string"
      ? data
      : (data as Record<string, unknown>)?.text ||
        (data as Record<string, unknown>)?.thinking ||
        (data as Record<string, unknown>)?.reasoning ||
        null;
  if (thinkingText) {
    if (!state.generationProgressStarted) {
      state.generationProgressStarted = true;
      deps.appendProgressPart("generation", "streaming");
    }
    const incoming = String(thinkingText);
    const previous = state.accumulatedThinking;
    const mergedThought = mergeStreamingText(previous, incoming);
    recordStreamText(state.streamStats, "thinking", previous, mergedThought, incoming.length);
    if (mergedThought !== state.accumulatedThinking) {
      state.accumulatedThinking = mergedThought;
      deps.requestStreamingTextFlush("thinking");
    }
  }
}

export function handleContentEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: ContentDeps,
) {
  const contentText =
    typeof data === "string"
      ? data
      : (data as Record<string, unknown>)?.content ||
        (data as Record<string, unknown>)?.text ||
        (data as Record<string, unknown>)?.delta ||
        null;
  if (contentText) {
    if (!state.generationProgressStarted) {
      state.generationProgressStarted = true;
      deps.appendProgressPart("generation", "streaming");
    }
    const incoming = String(contentText);
    const previous = state.accumulatedContent;
    const merged = mergeStreamingText(previous, incoming);
    recordStreamText(state.streamStats, "content", previous, merged, incoming.length);
    state.accumulatedContent = merged;
    deps.requestStreamingTextFlush("content");
  }
}

export function handlePartsEvent(data: unknown, state: StreamRunState, ctx: StreamContext) {
  const nextParts = coerceUiParts(data);
  if (nextParts.length > 0) {
    recordStreamParts(state.streamStats, nextParts.length);
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId
          ? { ...m, uiParts: mergeUiParts(m.uiParts, nextParts), isStreaming: true }
          : m,
      ),
    );
  }
}

export function handleIntegrationEvent(data: unknown, state: StreamRunState, ctx: StreamContext) {
  const signals = coerceIntegrationSignals(data);
  if (signals.length > 0) {
    const integrationParts = signals.map((s, i) =>
      integrationSignalToToolPart(s, `${ctx.assistantMessageId}:${i}`),
    );
    recordStreamParts(state.streamStats, integrationParts.length);
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId
          ? {
              ...m,
              uiParts: mergeUiParts(m.uiParts, integrationParts),
              isStreaming: true,
            }
          : m,
      ),
    );
  }
}

export function handleToolCallEvent(data: unknown, state: StreamRunState, ctx: StreamContext) {
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
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId
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
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId
          ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
          : m,
      ),
    );
  }
}

export function handleProgressEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: ContentDeps,
) {
  const progressData = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const step = typeof progressData.step === "string" ? progressData.step : "";
  const phase = typeof progressData.phase === "string" ? progressData.phase : "";
  if (step && phase) {
    if (step === "generation") {
      state.generationProgressStarted = true;
      if (phase === "done") {
        state.generationDoneProgressReceived = true;
      }
    }
    deps.appendProgressPart(step, phase, progressData);
  }
}
