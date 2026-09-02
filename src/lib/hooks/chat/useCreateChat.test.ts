import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { ChatMessage } from "@/lib/builder/types";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import { resetInitBuildChoices } from "@/lib/builder/init-build-choices";
import { ENGINE_CHATS_API_PREFIX } from "@/lib/api/engine-chats-path";
import { CREATE_CHAT_CONNECTION_BROKEN_MESSAGE } from "./helpers-errors";
import type { AutoFixPayload, ChatMessagingParams } from "./types";

const handleSseStream = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  });
});

vi.mock("sonner", () => ({ toast }));
vi.mock("./stream-handlers", () => ({ handleSseStream }));
vi.mock("./post-checks", () => ({
  runPostGenerationChecks: vi.fn(),
  abortPostChecksForChat: vi.fn(),
}));
vi.mock("./post-checks-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./post-checks-fetch")>();
  return {
    ...actual,
    triggerImageMaterialization: vi.fn(),
  };
});
vi.mock("./post-checks-preview", () => ({ readPreviewPreflight: vi.fn(() => null) }));
vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { useCreateChat } from "./useCreateChat";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse() {
  return new Response("event: meta\ndata: {}\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function isSyncCreateUrl(url: unknown): boolean {
  const href = String(url);
  return href.endsWith(ENGINE_CHATS_API_PREFIX) || href.endsWith(`${ENGINE_CHATS_API_PREFIX}/`);
}

function createHarness(overrides?: Partial<ChatMessagingParams>) {
  const messagesBox = { current: [] as ChatMessage[] };
  const setMessages = vi.fn((next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    messagesBox.current =
      typeof next === "function" ? next(messagesBox.current) : next;
  });

  const params: ChatMessagingParams = {
    chatId: null,
    setChatId: vi.fn(),
    chatIdParam: null,
    router: { replace: vi.fn() },
    selectedModelTier: DEFAULT_MODEL_TIER,
    enableImageGenerations: false,
    enableThinking: false,
    mutateVersions: vi.fn(),
    setCurrentPreviewUrl: vi.fn(),
    setPreviewBuildError: vi.fn(),
    setPreviewProdBuild: vi.fn(),
    setPreviewPending: vi.fn(),
    setMessages,
    resetBeforeCreateChat: vi.fn(),
    ...overrides,
  };

  const deps = {
    buildBuilderParams: (entries: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams();
      Object.entries(entries).forEach(([key, value]) => {
        if (value) p.set(key, value);
      });
      return p;
    },
    streamAbortRef: { current: null } as MutableRefObject<AbortController | null>,
    autoFixHandlerRef: { current: vi.fn() } as MutableRefObject<(payload: AutoFixPayload) => void>,
    lastSentSystemPromptRef: { current: null } as MutableRefObject<string | null>,
    startStreamSafetyTimer: vi.fn(),
    touchStreamSafetyTimer: vi.fn(),
    clearStreamSafetyTimer: vi.fn(),
  };

  const { result } = renderHook(() => useCreateChat(params, deps));
  return { result, messagesBox };
}

async function create(result: {
  current: { createNewChat: (initialMessage: string) => Promise<boolean> };
}) {
  let ok = false;
  await act(async () => {
    ok = await result.current.createNewChat("Bygg en kaffesajt");
  });
  return ok;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetInitBuildChoices();
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCreateChat broken-stream handling", () => {
  it("does not start a second codegen when fetch fails with a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, messagesBox } = createHarness();

    await create(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ENGINE_CHATS_API_PREFIX}/stream`);
    expect(fetchMock.mock.calls.some(([url]) => isSyncCreateUrl(url))).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(String(toast.error.mock.calls[0]?.[0])).not.toMatch(/Failed to create chat/i);
    const assistant = messagesBox.current.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(assistant?.content).not.toMatch(/Failed to create chat/i);
  });

  it("does not start a second codegen when an opened SSE stream disconnects", async () => {
    fetchMock.mockResolvedValue(sseResponse());
    handleSseStream.mockRejectedValue(new TypeError("network error"));
    const { result, messagesBox } = createHarness();

    await create(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ENGINE_CHATS_API_PREFIX}/stream`);
    expect(fetchMock.mock.calls.some(([url]) => isSyncCreateUrl(url))).toBe(false);
    expect(handleSseStream).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(String(toast.error.mock.calls[0]?.[0])).not.toMatch(/Failed to create chat/i);
    const assistant = messagesBox.current.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
  });

  it("still surfaces HTTP errors from the stream route without a sync POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));
    const { result } = createHarness();

    await create(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ENGINE_CHATS_API_PREFIX}/stream`);
    expect(fetchMock.mock.calls.some(([url]) => isSyncCreateUrl(url))).toBe(false);
    expect(String(toast.error.mock.calls[0]?.[0])).toMatch(/boom/);
    expect(String(toast.error.mock.calls[0]?.[0])).not.toBe(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
  });
});
