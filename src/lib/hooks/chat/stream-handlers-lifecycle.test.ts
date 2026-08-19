import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { SetMessages } from "./types";
import { handleMetaEvent } from "./stream-handlers-lifecycle";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";

function createMessageStore() {
  let messages: ChatMessage[] = [
    {
      id: "assistant_1",
      role: "assistant",
      content: "",
      isStreaming: true,
      uiParts: [],
    },
  ];

  const setMessages: SetMessages = (next) => {
    messages = typeof next === "function" ? next(messages) : next;
  };

  return {
    setMessages,
    getMessages: () => messages,
  };
}

function createState(): StreamRunState {
  return {
    chatIdFromStream: null,
    versionIdFromStream: null,
    recoveredArtifactSignal: false,
    linkedProjectIdFromStream: null,
    accumulatedThinking: "",
    accumulatedContent: "",
    didReceiveDone: false,
    generationProgressStarted: false,
    generationDoneProgressReceived: false,
    pendingStreamErrorMessage: null,
    postCheckQueue: [],
    materializeQueue: [],
    streamStats: {
      streamType: "create",
      assistantMessageId: "assistant_1",
      startedAt: Date.now(),
      contentEvents: 0,
      thinkingEvents: 0,
      partsEvents: 0,
      errorEvents: 0,
      contentChars: 0,
      thinkingChars: 0,
      contentNoopEvents: 0,
      thinkingNoopEvents: 0,
      maxContentChunk: 0,
      maxThinkingChunk: 0,
      finalContentLength: 0,
      finalThinkingLength: 0,
      didReceiveDone: false,
    },
  };
}

function createCtx(
  setMessages: SetMessages,
  overrides: Partial<StreamContext> = {},
): StreamContext {
  return {
    streamType: "create",
    assistantMessageId: "assistant_1",
    selectedModelTier: "gpt-5.4",
    chatId: null,
    setMessages,
    touchStreamSafetyTimer: vi.fn(),
    setCurrentPreviewUrl: vi.fn(),
    mutateVersions: vi.fn(),
    enableImageMaterialization: false,
    autoFixHandlerRef: { current: vi.fn() },
    promptAssistModel: "openai/gpt-5.6-sol",
    promptAssistDeep: true,
    ...overrides,
  };
}

function modelInfoSteps(messages: ChatMessage[]): string[] {
  const part = messages[0]?.uiParts?.find(
    (entry) => (entry as { type?: string }).type === "tool:model-info",
  ) as { output?: { steps?: unknown } } | undefined;
  return Array.isArray(part?.output?.steps)
    ? part.output.steps.filter((step): step is string => typeof step === "string")
    : [];
}

describe("handleMetaEvent — Deep Brief labels", () => {
  it("shows Deep Brief rows on an init turn where a brief ran", () => {
    const store = createMessageStore();
    handleMetaEvent(
      { modelId: "gpt-5.5", briefApplied: true },
      createState(),
      createCtx(store.setMessages, { streamType: "create", briefUsedThisTurn: true }),
    );

    const steps = modelInfoSteps(store.getMessages());
    expect(steps).toContain("Deep Brief-provider: OpenAI");
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(true);
    expect(steps).toContain("Deep brief-inställning: på");
  });

  it("hides Deep Brief rows on a follow-up even when builder UI state still has the setting", () => {
    const store = createMessageStore();
    handleMetaEvent(
      { modelId: "gpt-5.5", briefApplied: true },
      createState(),
      createCtx(store.setMessages, {
        streamType: "send",
        chatId: "chat_1",
        briefUsedThisTurn: false,
      }),
    );

    const steps = modelInfoSteps(store.getMessages());
    expect(steps.some((step) => step.includes("Deep Brief"))).toBe(false);
    expect(steps.some((step) => step.includes("Deep brief"))).toBe(false);
  });

  it("shows only the off setting on an init turn when Deep Brief is disabled", () => {
    const store = createMessageStore();
    handleMetaEvent(
      { modelId: "gpt-5.5", briefApplied: false },
      createState(),
      createCtx(store.setMessages, {
        streamType: "create",
        promptAssistModel: "off",
        promptAssistDeep: false,
        briefUsedThisTurn: false,
      }),
    );

    const steps = modelInfoSteps(store.getMessages());
    expect(steps).toContain("Deep brief-inställning: av");
    expect(steps.some((step) => step.startsWith("Deep Brief-provider:"))).toBe(false);
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(false);
  });
});
