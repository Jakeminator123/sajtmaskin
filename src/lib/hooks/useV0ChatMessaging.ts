import { consumeSseResponse } from "@/lib/builder/sse";
import type { ChatMessage, UiMessagePart } from "@/lib/builder/types";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import { debugLog } from "@/lib/utils/debug";
import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";

type RouterLike = { replace: (href: string) => void };

type V0Attachment = {
  type: "user_file";
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

type MessageOptions = {
  attachments?: V0Attachment[];
  attachmentPrompt?: string;
  skipPromptAssist?: boolean;
};

type CreateChatLock = {
  key: string;
  createdAt: number;
  chatId?: string | null;
};

const CREATE_CHAT_LOCK_KEY = "sajtmaskin:createChatLock";
const CREATE_CHAT_LOCK_TTL_MS = 2 * 60 * 1000;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCreateChatLock(): CreateChatLock | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CREATE_CHAT_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateChatLock;
    if (!parsed || typeof parsed.key !== "string" || typeof parsed.createdAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCreateChatLock(lock: CreateChatLock) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(CREATE_CHAT_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // ignore storage errors
  }
}

function clearCreateChatLock() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(CREATE_CHAT_LOCK_KEY);
  } catch {
    // ignore storage errors
  }
}

function getActiveCreateChatLock(key: string): CreateChatLock | null {
  const lock = readCreateChatLock();
  if (!lock) return null;
  if (Date.now() - lock.createdAt > CREATE_CHAT_LOCK_TTL_MS) {
    clearCreateChatLock();
    return null;
  }
  return lock.key === key ? lock : null;
}

function updateCreateChatLockChatId(key: string, chatId: string) {
  const lock = readCreateChatLock();
  if (!lock || lock.key !== key) return;
  if (lock.chatId === chatId) return;
  writeCreateChatLock({ ...lock, chatId });
}

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildCreateChatKey(
  message: string,
  options: MessageOptions,
  modelTier: ModelTier,
  imageGenerations: boolean,
  systemPrompt?: string,
): string {
  const normalizedMessage = normalizePrompt(message);
  const normalizedSystem = normalizePrompt(systemPrompt ?? "");
  const attachmentSignature = (options.attachments ?? [])
    .map((attachment) => {
      const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
      const filename = typeof attachment.filename === "string" ? attachment.filename.trim() : "";
      return url || filename || "";
    })
    .filter((value) => value.length > 0)
    .join("|");
  const attachmentPrompt = normalizePrompt(options.attachmentPrompt ?? "");
  const fingerprint = [
    normalizedMessage,
    `model:${modelTier}`,
    `images:${imageGenerations ? "1" : "0"}`,
    `system:${normalizedSystem}`,
    `attachments:${attachmentSignature}`,
    `attachmentPrompt:${attachmentPrompt}`,
  ].join("::");
  return hashString(fingerprint);
}

function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;

  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (previous.slice(-size) === incoming.slice(0, size)) {
      return previous + incoming.slice(size);
    }
  }

  const last = previous.slice(-1);
  const first = incoming[0];
  const needsSpace =
    last &&
    first &&
    !/\s/.test(last) &&
    !/\s/.test(first) &&
    /[A-Za-z0-9]/.test(last) &&
    /[A-Za-z0-9]/.test(first) &&
    !/[\/._:-]$/.test(last) &&
    !/^[\/._:-]/.test(first) &&
    !previous.slice(-12).toLowerCase().includes("http");

  return needsSpace ? `${previous} ${incoming}` : previous + incoming;
}

function appendAttachmentPrompt(message: string, attachmentPrompt?: string): string {
  if (!attachmentPrompt) return message;
  return `${message}${attachmentPrompt}`.trim();
}

function coerceUiParts(data: unknown): UiMessagePart[] {
  if (Array.isArray(data)) {
    return data.filter((part): part is UiMessagePart => Boolean(part) && typeof part === "object");
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.type === "string") {
      return [obj as UiMessagePart];
    }
    if (Array.isArray(obj.parts)) {
      return obj.parts.filter(
        (part): part is UiMessagePart => Boolean(part) && typeof part === "object",
      );
    }
  }
  return [];
}

function mergeUiParts(prev: UiMessagePart[] | undefined, next: UiMessagePart[]): UiMessagePart[] {
  if (next.length === 0) return prev ?? [];
  const merged = [...(prev ?? [])];
  next.forEach((part) => {
    const key = getUiPartKey(part);
    if (!key) {
      merged.push(part);
      return;
    }
    const index = merged.findIndex((existing) => getUiPartKey(existing) === key);
    if (index === -1) {
      merged.push(part);
      return;
    }
    merged[index] = mergeUiPart(merged[index], part);
  });
  return merged;
}

function mergeUiPart(current: UiMessagePart, next: UiMessagePart): UiMessagePart {
  const merged = { ...current };
  Object.entries(next).forEach(([key, value]) => {
    if (value !== undefined) {
      merged[key] = value;
    }
  });
  return merged;
}

function getUiPartKey(part: UiMessagePart): string | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (type.startsWith("tool")) {
    const candidate =
      (typeof part.toolCallId === "string" && part.toolCallId) ||
      (typeof part.id === "string" && part.id) ||
      (typeof part.name === "string" && part.name) ||
      (typeof part.toolName === "string" && part.toolName) ||
      type;
    return candidate || null;
  }
  if (type === "plan") return "plan";
  if (type === "sources") return "sources";
  if (type === "source") {
    const candidate =
      (typeof part.url === "string" && part.url) ||
      (typeof (part.source as { url?: unknown })?.url === "string" &&
        (part.source as { url?: string }).url) ||
      null;
    return candidate;
  }
  return null;
}

export function useV0ChatMessaging(params: {
  chatId: string | null;
  setChatId: (id: string | null) => void;
  chatIdParam: string | null;
  router: RouterLike;
  selectedModelTier: ModelTier;
  enableImageGenerations: boolean;
  systemPrompt?: string;
  maybeEnhanceInitialPrompt: (original: string) => Promise<string>;
  mutateVersions: () => void;
  setCurrentDemoUrl: (url: string | null) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: { chatId: string; versionId?: string; demoUrl?: string }) => void;
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  resetBeforeCreateChat: () => void;
}) {
  const {
    chatId,
    setChatId,
    chatIdParam,
    router,
    selectedModelTier,
    enableImageGenerations,
    systemPrompt,
    maybeEnhanceInitialPrompt,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh,
    onGenerationComplete,
    setMessages,
    resetBeforeCreateChat,
  } = params;

  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const createChatInFlightRef = useRef(false);
  const pendingCreateKeyRef = useRef<string | null>(null);

  const createNewChat = useCallback(
    async (initialMessage: string, options: MessageOptions = {}) => {
      if (isCreatingChat || createChatInFlightRef.current) return;
      if (!initialMessage?.trim()) {
        toast.error("Please enter a message to start a new chat");
        return;
      }

      const createKey = buildCreateChatKey(
        initialMessage,
        options,
        selectedModelTier,
        enableImageGenerations,
        systemPrompt,
      );
      const existingLock = getActiveCreateChatLock(createKey);
      if (existingLock) {
        if (existingLock.chatId) {
          setChatId(existingLock.chatId);
          if (chatIdParam !== existingLock.chatId) {
            router.replace(`/builder?chatId=${encodeURIComponent(existingLock.chatId)}`);
          }
          toast.success("Återansluter till pågående skapning");
        } else {
          toast("En skapning med samma prompt pågår redan. Vänta en stund och försök igen.");
        }
        return;
      }

      pendingCreateKeyRef.current = createKey;
      writeCreateChatLock({ key: createKey, createdAt: Date.now() });
      createChatInFlightRef.current = true;
      resetBeforeCreateChat();

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      debugLog("AI", "Create chat requested", {
        messageLength: initialMessage.length,
        skipPromptAssist: options.skipPromptAssist ?? false,
        attachments: options.attachments?.length ?? 0,
        imageGenerations: enableImageGenerations,
        modelTier: selectedModelTier,
        systemPromptProvided: Boolean(systemPrompt?.trim()),
      });

      setMessages([
        { id: userMessageId, role: "user", content: initialMessage },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          uiParts: [],
        },
      ]);
      setIsCreatingChat(true);

      try {
        const shouldSkipAssist = options.skipPromptAssist ?? false;
        if (shouldSkipAssist) {
          debugLog("AI", "Prompt assist skipped", { reason: "manual-or-explicit" });
        }
        const messageForV0 = shouldSkipAssist
          ? initialMessage
          : await maybeEnhanceInitialPrompt(initialMessage);
        debugLog("AI", "Prompt assist result", {
          skipped: shouldSkipAssist,
          originalLength: initialMessage.length,
          finalLength: messageForV0.length,
          changed: messageForV0.trim() !== initialMessage.trim(),
        });
        const finalMessage = appendAttachmentPrompt(messageForV0, options.attachmentPrompt);
        const thinkingForTier = selectedModelTier !== "v0-mini";
        const trimmedSystemPrompt = systemPrompt?.trim();
        const requestBody: Record<string, unknown> = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
        };
        if (trimmedSystemPrompt) {
          requestBody.system = trimmedSystemPrompt;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }
        const response = await fetch("/api/v0/chats/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          let errorMessage = "Failed to create chat";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
          let chatIdFromStream: string | null = null;
          let accumulatedThinking = "";
          let accumulatedContent = "";

          await consumeSseResponse(response, (event, data) => {
            switch (event) {
              case "thinking": {
                const thinkingText =
                  typeof data === "string"
                    ? data
                    : (data as any)?.thinking || (data as any)?.reasoning || null;
                if (thinkingText) {
                  // V0 sends the full thought text in each chunk (not incremental deltas)
                  // So we replace rather than accumulate
                  const newThought = String(thinkingText);
                  if (newThought.length > accumulatedThinking.length) {
                    accumulatedThinking = newThought;
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                        : m,
                    ),
                  );
                }
                break;
              }
              case "content": {
                const contentText =
                  typeof data === "string"
                    ? data
                    : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
                if (contentText) {
                  accumulatedContent = mergeStreamingText(
                    accumulatedContent,
                    String(contentText),
                  );
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent, isStreaming: true }
                        : m,
                    ),
                  );
                }
                break;
              }
              case "parts": {
                const nextParts = coerceUiParts(data);
                if (nextParts.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            uiParts: mergeUiParts(m.uiParts, nextParts),
                            isStreaming: true,
                          }
                        : m,
                    ),
                  );
                }
                break;
              }
              case "chatId": {
                const nextChatId =
                  typeof data === "string"
                    ? data
                    : (data as any)?.id || (data as any)?.chatId || null;
                if (nextChatId && !chatIdFromStream) {
                  const id = String(nextChatId);
                  chatIdFromStream = id;
                  setChatId(id);
                  if (chatIdParam !== id) {
                    router.replace(`/builder?chatId=${encodeURIComponent(id)}`);
                  }
                  if (pendingCreateKeyRef.current) {
                    updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
                  }
                }
                break;
              }
              case "done": {
                const doneData = typeof data === "object" && data ? (data as any) : {};
                if (doneData.demoUrl) {
                  setCurrentDemoUrl(doneData.demoUrl);
                }
                onPreviewRefresh?.();
                if (doneData.id && !chatIdFromStream) {
                  setChatId(doneData.id);
                  if (chatIdParam !== doneData.id) {
                    router.replace(`/builder?chatId=${encodeURIComponent(doneData.id)}`);
                  }
                }
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
                );
                toast.success("Chat created!");
                mutateVersions();
                // Call generation complete callback with available data
                onGenerationComplete?.({
                  chatId: doneData.chatId || doneData.id || chatIdFromStream || "",
                  versionId: doneData.versionId,
                  demoUrl: doneData.demoUrl,
                });
                break;
              }
              case "error": {
                const errorData =
                  typeof data === "object" && data ? (data as any) : { message: data };
                throw new Error(errorData.message || errorData.error || "Stream error");
              }
            }
          });

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
          );
        } else {
          const data = await response.json();
          const newChatId = data.id || data.chatId || data.v0ChatId || data.chat?.id;

          if (!newChatId) {
            throw new Error("No chat ID returned from API");
          }

          setChatId(newChatId);
          router.replace(`/builder?chatId=${encodeURIComponent(newChatId)}`);
          if (pendingCreateKeyRef.current) {
            updateCreateChatLockChatId(pendingCreateKeyRef.current, newChatId);
          }
          toast.success("Chat created!");

          if (data.latestVersion?.demoUrl) {
            setCurrentDemoUrl(data.latestVersion.demoUrl);
            onPreviewRefresh?.();
          }

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
          );
        }
      } catch (error) {
        console.error("Error creating chat:", error);
        toast.error(error instanceof Error ? error.message : "Failed to create chat");
      } finally {
        pendingCreateKeyRef.current = null;
        clearCreateChatLock();
        createChatInFlightRef.current = false;
        setIsCreatingChat(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [
      isCreatingChat,
      resetBeforeCreateChat,
      maybeEnhanceInitialPrompt,
      selectedModelTier,
      enableImageGenerations,
      systemPrompt,
      setMessages,
      setChatId,
      chatIdParam,
      router,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      mutateVersions,
    ],
  );

  const sendMessage = useCallback(
    async (messageText: string, options: MessageOptions = {}) => {
      if (!messageText?.trim()) return;

      if (!chatId) {
        await createNewChat(messageText, options);
        return;
      }

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      debugLog("AI", "Send message requested", {
        messageLength: messageText.length,
        attachments: options.attachments?.length ?? 0,
        modelTier: selectedModelTier,
      });

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", content: messageText },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          uiParts: [],
        },
      ]);

      try {
        const finalMessage = appendAttachmentPrompt(messageText, options.attachmentPrompt);
        const requestBody: Record<string, unknown> = { message: finalMessage };
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }
        const response = await fetch(`/api/v0/chats/${chatId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          let errorMessage = "Failed to send message";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        let accumulatedThinking = "";
        let accumulatedContent = "";

        await consumeSseResponse(response, (event, data) => {
          switch (event) {
            case "thinking": {
              const thinkingText =
                typeof data === "string"
                  ? data
                  : (data as any)?.thinking || (data as any)?.reasoning || null;
              if (thinkingText) {
                // V0 sends the full thought text in each chunk (not incremental deltas)
                // So we replace rather than accumulate
                const newThought = String(thinkingText);
                if (newThought.length > accumulatedThinking.length) {
                  accumulatedThinking = newThought;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                      : m,
                  ),
                );
              }
              break;
            }
            case "content": {
              const contentText =
                typeof data === "string"
                  ? data
                  : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
              if (contentText) {
                accumulatedContent = mergeStreamingText(accumulatedContent, String(contentText));
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: accumulatedContent, isStreaming: true }
                      : m,
                  ),
                );
              }
              break;
            }
            case "parts": {
              const nextParts = coerceUiParts(data);
              if (nextParts.length > 0) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          uiParts: mergeUiParts(m.uiParts, nextParts),
                          isStreaming: true,
                        }
                      : m,
                  ),
                );
              }
              break;
            }
            case "done": {
              const doneData = typeof data === "object" && data ? (data as any) : {};
              if (doneData?.demoUrl) setCurrentDemoUrl(doneData.demoUrl);
              onPreviewRefresh?.();
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
              );
              mutateVersions();
              // Call generation complete callback with available data
              onGenerationComplete?.({
                chatId: chatId || "",
                versionId: doneData.versionId,
                demoUrl: doneData.demoUrl,
              });
              break;
            }
            case "error": {
              const errorData =
                typeof data === "object" && data ? (data as any) : { message: data };
              throw new Error(errorData.message || errorData.error || "Stream error");
            }
          }
        });
      } catch (error) {
        console.error("Error sending streaming message:", error);
        toast.error(error instanceof Error ? error.message : "Failed to send message");
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [
      chatId,
      createNewChat,
      setMessages,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      selectedModelTier,
      mutateVersions,
    ],
  );

  return { isCreatingChat, createNewChat, sendMessage };
}
