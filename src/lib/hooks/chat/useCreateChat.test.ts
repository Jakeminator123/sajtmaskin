import { act, renderHook } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { ChatMessage } from "@/lib/builder/types";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import { resetInitBuildChoices } from "@/lib/builder/init-build-choices";
import { ENGINE_CHATS_API_PREFIX } from "@/lib/api/engine-chats-path";
import { CREATE_CHAT_CONNECTION_BROKEN_MESSAGE } from "./helpers-errors";
import type { ChatMessagingParams } from "./types";
import { useChatMessaging } from "./useChatMessaging";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { loadPersistedMessages, persistMessages } from "@/lib/builder/messages-storage";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";

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
vi.mock("./useAutoFix", () => ({ useAutoFix: () => ({ cancelPendingAutoFix: () => {} }) }));
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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const navigationRouter = { replace: vi.fn() };
function useCreationNavigationHarness({ urlChatId }: { urlChatId: string }) {
  const [chatId, setChatId] = useState<string | null>("A");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messaging = useChatMessaging({
    chatId, setChatId, chatIdParam: urlChatId, router: navigationRouter,
    selectedModelTier: DEFAULT_MODEL_TIER, enableImageGenerations: false,
    enableThinking: false, mutateVersions: vi.fn(), setCurrentPreviewUrl: vi.fn(),
    setMessages, resetBeforeCreateChat: vi.fn(),
  });
  usePersistedChatMessages({
    chatId, chatIdParam: urlChatId, messages, setMessages,
    isCreatingChat: messaging.isCreatingChat,
    isAnyStreaming: messages.some((message) => message.isStreaming),
    cancelActiveGeneration: messaging.cancelActiveGeneration,
  });
  useEffect(() => {
    // Match the controller's URL effect, which runs after the persistence hook.
    setChatId(urlChatId);
  }, [urlChatId]);
  return { ...messaging, chatId, messages };
}

describe("creation cancellation during explicit URL navigation", () => {
  it.each(["fetch", "json"])("ignores an old %s response arriving after A to B navigation", async (boundary) => {
    vi.useFakeTimers();
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    localStorage.clear();
    persistMessages("B", [{ id: "b", role: "user", content: "B ORIGINAL" }]);
    const oldFetch = deferred<Response>();
    const oldJson = deferred<Record<string, unknown>>();
    fetchMock.mockReturnValueOnce(boundary === "fetch" ? oldFetch.promise : Promise.resolve({
      ok: true, headers: new Headers({ "content-type": "application/json" }),
      json: () => oldJson.promise,
    }));
    const { result, rerender } = renderHook(useCreationNavigationHarness, { initialProps: { urlChatId: "A" } });
    let oldRequest!: Promise<boolean>;
    await act(async () => { oldRequest = result.current.createNewChat("A STREAMING"); });
    expect(result.current.isCreatingChat).toBe(true);
    const timerIndex = setTimer.mock.calls.findIndex(([, delay]) => delay === STREAM_SAFETY_TIMEOUT_DEFAULT_MS);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const oldTimer = setTimer.mock.results[timerIndex].value;
    rerender({ urlChatId: "B" });
    expect(result.current.isCreatingChat).toBe(false);
    expect(clearTimer).toHaveBeenCalledWith(oldTimer);
    await act(async () => {
      if (boundary === "fetch") oldFetch.resolve(jsonResponse(200, { chatId: "A LATE" }));
      else oldJson.resolve({ chatId: "A LATE" });
      await oldRequest;
    });
    expect(result.current.chatId).toBe("B");
    expect(result.current.messages.map((m) => m.content)).toEqual(["B ORIGINAL"]);
    expect(loadPersistedMessages("B").map((m) => m.content)).toEqual(["B ORIGINAL"]);
    expect(navigationRouter.replace).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a newer creation's timer and flags when the canceled request settles", async () => {
    vi.useFakeTimers();
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    localStorage.clear();
    const oldFetch = deferred<Response>();
    const newFetch = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldFetch.promise).mockReturnValueOnce(newFetch.promise);
    const { result, rerender } = renderHook(useCreationNavigationHarness, { initialProps: { urlChatId: "A" } });
    let oldRequest!: Promise<boolean>;
    let newRequest!: Promise<boolean>;
    await act(async () => { oldRequest = result.current.createNewChat("OLD PROMPT"); });
    rerender({ urlChatId: "B" });
    await act(async () => { newRequest = result.current.createNewChat("NEW PROMPT"); });
    const timerIndexes = setTimer.mock.calls.flatMap(([, delay], index) =>
      delay === STREAM_SAFETY_TIMEOUT_DEFAULT_MS ? [index] : []);
    expect(timerIndexes).toHaveLength(2);
    const newTimer = setTimer.mock.results[timerIndexes[1]].value;
    clearTimer.mockClear();
    await act(async () => {
      oldFetch.resolve(jsonResponse(200, { chatId: "A LATE" }));
      await oldRequest;
    });
    expect(result.current.chatId).toBe("B");
    expect(result.current.isCreatingChat).toBe(true);
    expect(clearTimer).not.toHaveBeenCalledWith(newTimer);
    expect(result.current.messages[0].content).toBe("NEW PROMPT");
    expect(result.current.messages[1].isStreaming).toBe(true);
    await act(async () => {
      newFetch.resolve(jsonResponse(200, { chatId: "CREATED" }));
      await newRequest;
    });
    expect(result.current.chatId).toBe("CREATED");
    expect(result.current.isCreatingChat).toBe(false);
    expect(clearTimer).toHaveBeenCalledWith(newTimer);
    expect(loadPersistedMessages("CREATED")[0].content).toBe("NEW PROMPT");
  });
});

describe("useCreateChat broken-stream handling", () => {
  it("finishes a JSON generation without materialization, postcheck or verify requests", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      chatId: "chat_json", versionId: "ver_json", previewUrl: "https://preview.example/json",
    }));
    const refresh = vi.fn();
    const { result, messagesBox } = createHarness({
      enableImageMaterialization: true,
      onVersionStatusRefresh: refresh,
    });
    expect(await create(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/stream");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).materializeImages).toBe(true);
    expect(handleSseStream).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
    expect(messagesBox.current.some(message => message.isStreaming)).toBe(false);
  });
  it.each([[true, false], [false, true], [true, true], [undefined, false]] as const)(
    "sends Blob materialization %s independently of image generations %s", async (materializeImages, imageGenerations) => {
      fetchMock.mockResolvedValue(sseResponse());
      handleSseStream.mockResolvedValue({ versionIdFromStream: null });
      const { result } = createHarness({ enableImageMaterialization: materializeImages, enableImageGenerations: imageGenerations });
      await create(result);
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({ materializeImages: materializeImages === true, imageGenerations });
      expect(body.meta).not.toHaveProperty("materializeImages");
    },
  );
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

describe("useCreateChat auth gate", () => {
  it("opens login and returns false before fetch when the client knows the user is logged out", async () => {
    const onAuthRequired = vi.fn();
    const resetBeforeCreateChat = vi.fn();
    const { result, messagesBox } = createHarness({
      isAuthReady: true,
      isAuthenticated: false,
      onAuthRequired,
      resetBeforeCreateChat,
    });

    expect(await create(result)).toBe(false);
    expect(onAuthRequired).toHaveBeenCalledWith("generation");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resetBeforeCreateChat).not.toHaveBeenCalled();
    expect(messagesBox.current).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("opens login and returns false on a server requiresAuth 401 without the API-key toast", async () => {
    const onAuthRequired = vi.fn();
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        requiresAuth: true,
        error: "Skapa ett konto eller logga in för att generera.",
      }),
    );
    const { result, messagesBox } = createHarness({
      isAuthReady: true,
      isAuthenticated: true,
      onAuthRequired,
    });

    expect(await create(result)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthRequired).toHaveBeenCalledWith("generation");
    expect(messagesBox.current).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("opens login on a server auth_required 401 without the API-key toast", async () => {
    const onAuthRequired = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "auth_required" }));
    const { result, messagesBox } = createHarness({
      isAuthReady: true,
      isAuthenticated: true,
      onAuthRequired,
    });

    expect(await create(result)).toBe(false);
    expect(onAuthRequired).toHaveBeenCalledWith("generation");
    expect(messagesBox.current).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still surfaces a provider 401 as an API-key error", async () => {
    const onAuthRequired = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "unauthorized" }));
    const { result } = createHarness({
      isAuthReady: true,
      isAuthenticated: true,
      onAuthRequired,
    });

    expect(await create(result)).toBe(true);
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(String(toast.error.mock.calls[0]?.[0])).toBe("API-nyckel saknas eller är ogiltig.");
  });
});
