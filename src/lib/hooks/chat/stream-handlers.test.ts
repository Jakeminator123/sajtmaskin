import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { SetMessages } from "./types";

const consumeSseResponse = vi.hoisted(() => vi.fn());
const runPostGenerationChecks = vi.hoisted(() => vi.fn());
const triggerImageMaterialization = vi.hoisted(() => vi.fn());
const readPreviewPreflight = vi.hoisted(() => vi.fn(() => null));
const toast = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  });
});

vi.mock("@/lib/builder/sse", () => ({
  consumeSseResponse,
}));

vi.mock("@/lib/builder/promptAssist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/promptAssist")>();
  return {
    ...actual,
    isPromptAssistOff: vi.fn(() => false),
    resolvePromptAssistProvider: vi.fn(() => "gateway"),
  };
});

vi.mock("sonner", () => ({
  toast,
}));

vi.mock("./post-checks", () => ({
  runPostGenerationChecks,
}));

vi.mock("./post-checks-fetch", () => ({
  triggerImageMaterialization,
}));

vi.mock("./post-checks-preview", () => ({
  readPreviewPreflight,
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { handleSseStream, type StreamContext } from "./stream-handlers";

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

function createContext(setMessages: SetMessages) {
  const setChatId = vi.fn();
  const setCurrentPreviewUrl = vi.fn();
  const setSandboxPending = vi.fn();
  const onPreviewRefresh = vi.fn();
  const onGenerationComplete = vi.fn();
  const mutateVersions = vi.fn();
  const touchStreamSafetyTimer = vi.fn();

  const ctx: StreamContext = {
    streamType: "create",
    assistantMessageId: "assistant_1",
    selectedModelTier: "gpt-5.4",
    chatId: null,
    setMessages,
    touchStreamSafetyTimer,
    setChatId,
    setCurrentPreviewUrl,
    setSandboxPending,
    onPreviewRefresh,
    onGenerationComplete,
    mutateVersions,
    enableImageMaterialization: true,
    autoFixHandlerRef: { current: vi.fn() },
    promptAssistModel: null,
    promptAssistDeep: false,
  };

  return {
    ctx,
    spies: {
      setChatId,
      setCurrentPreviewUrl,
      setSandboxPending,
      onPreviewRefresh,
      onGenerationComplete,
      mutateVersions,
      touchStreamSafetyTimer,
    },
  };
}

describe("handleSseStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runPostGenerationChecks.mockResolvedValue(undefined);
    triggerImageMaterialization.mockResolvedValue(undefined);
  });

  it("recovers when an SSE error is followed by a rescued done event", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "<main>Hello runtime lane</main>" }, "");
        onEvent("error", { message: "Engine generation failed" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://preview.example/chat_1/ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(result.streamQuality.hasCriticalAnomaly).toBe(false);
    expect(result.streamQuality.reasons).toContain("error_event_recovered");
    expect(spies.setCurrentPreviewUrl).toHaveBeenCalledWith(
      "https://preview.example/chat_1/ver_1",
    );
    expect(spies.setChatId).toHaveBeenCalledWith("chat_1");
    expect(spies.mutateVersions).toHaveBeenCalledTimes(1);
    expect(spies.onGenerationComplete).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
      previewUrl: "https://preview.example/chat_1/ver_1",
      onlySelectVersionIfWasLatest: false,
    });
    expect(triggerImageMaterialization).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
    });
    expect(runPostGenerationChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        assistantMessageId: "assistant_1",
        streamQuality: expect.objectContaining({
          hasCriticalAnomaly: false,
          reasons: expect.arrayContaining(["error_event_recovered"]),
        }),
      }),
    );
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
  });

  it("throws when an SSE error is followed by done without a recovered artifact", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("error", { message: "Stream kaputt" }, "");
        onEvent("done", { chatId: "chat_1" }, "");
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await expect(
      handleSseStream(new Response(null), ctx, new AbortController().signal),
    ).rejects.toThrow("Stream kaputt");
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    expect(triggerImageMaterialization).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("surfaces an explicit empty-generation failure when done has no version or preview", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("done", { chatId: "chat_1", reason: "done_empty_output" }, "");
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(spies.onGenerationComplete).not.toHaveBeenCalled();
    expect(spies.mutateVersions).not.toHaveBeenCalled();
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    expect(triggerImageMaterialization).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Own-engine genererade ingen användbar kod i det här försöket.",
    );
    expect(store.getMessages()[0]?.content).toContain("Own-engine genererade ingen användbar kod");
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
  });

  it("sets sandbox prod-build state on sandbox-ready with prodBuildVerified", async () => {
    const setSandboxProdBuild = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "sandbox-ready",
          {
            sandboxUrl: "https://sandbox.example",
            sandboxId: "sb_1",
            prodBuildVerified: false,
            prodBuildLogSnippet: "Error: failed",
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);
    const ctxWithProd = { ...ctx, setSandboxProdBuild };

    await handleSseStream(new Response(null), ctxWithProd, new AbortController().signal);

    expect(setSandboxProdBuild).toHaveBeenCalledWith({
      verified: false,
      logSnippet: "Error: failed",
    });
    expect(spies.setCurrentPreviewUrl).toHaveBeenCalledWith("https://sandbox.example");
  });

  it("does not set preview iframe on empty sandbox-ready (build_only) but records prod build", async () => {
    const setSandboxProdBuild = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "sandbox-ready",
          {
            sandboxUrl: "",
            sandboxId: "sb_1",
            sandboxPreviewMode: "build_only",
            fidelityTier: 3,
            prodBuildVerified: true,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(
      new Response(null),
      { ...ctx, setSandboxProdBuild },
      new AbortController().signal,
    );

    expect(setSandboxProdBuild).toHaveBeenCalledWith({
      verified: true,
      logSnippet: undefined,
    });
    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
  });

  it("does not set iframe URL from done when previewUrl is compatibility shim only", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
    expect(spies.onGenerationComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: undefined,
      }),
    );
  });

  it("does not apply shim fallback from build-error", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "build-error",
          {
            stage: "install",
            message: "npm failed",
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
  });
});
