import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { formatPrompt, resolvePromptAssistProvider, isPromptAssistOff } from "@/lib/builder/promptAssist";
import { debugLog } from "@/lib/utils/debug";
import { MODEL_LABELS, canonicalizeModelId } from "@/lib/v0/models";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, MessageOptions, V0ChatMessagingParams } from "./types";
import {
  appendAttachmentPrompt,
  appendModelInfoPart,
  buildApiErrorMessage,
  buildCreateChatKey,
  clearCreateChatLock,
  getActiveCreateChatLock,
  isAbortLikeError,
  isNetworkError,
  updateCreateChatLockChatId,
  writeCreateChatLock,
} from "./helpers";
import { runPostGenerationChecks, triggerImageMaterialization } from "./post-checks";
import { handleSseStream } from "./stream-handlers";

export function useCreateChat(
  params: V0ChatMessagingParams,
  deps: {
    buildBuilderParams: (entries: Record<string, string | null | undefined>) => URLSearchParams;
    streamAbortRef: React.MutableRefObject<AbortController | null>;
    autoFixHandlerRef: React.MutableRefObject<(payload: AutoFixPayload) => void>;
    lastSentSystemPromptRef: React.MutableRefObject<string | null>;
    startStreamSafetyTimer: (timeoutMs?: number) => void;
    touchStreamSafetyTimer: () => void;
    clearStreamSafetyTimer: () => void;
  },
) {
  const {
    chatId: _chatId,
    setChatId,
    chatIdParam,
    router,
    appProjectId,
    v0ProjectId,
    selectedModelTier,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
    chatPrivacy,
    designSystemId,
    systemPrompt,
    promptAssistModel,
    promptAssistDeep,
    promptAssistMode,
    buildIntent,
    buildMethod,
    scaffoldMode,
    scaffoldId,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh,
    onGenerationComplete,
    onV0ProjectId,
    setMessages,
    resetBeforeCreateChat,
  } = params;

  const {
    buildBuilderParams,
    streamAbortRef,
    autoFixHandlerRef,
    lastSentSystemPromptRef,
    startStreamSafetyTimer,
    touchStreamSafetyTimer,
    clearStreamSafetyTimer,
  } = deps;

  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const createChatInFlightRef = useRef(false);
  const pendingCreateKeyRef = useRef<string | null>(null);

  const createNewChat = useCallback(
    async (initialMessage: string, options: MessageOptions = {}, systemPromptOverride?: string) => {
      if (isCreatingChat || createChatInFlightRef.current) return;
      if (!initialMessage?.trim()) {
        toast.error("Please enter a message to start a new chat");
        return;
      }

      const effectiveSystemPrompt = systemPromptOverride ?? systemPrompt;

      const createKey = buildCreateChatKey(
        initialMessage,
        options,
        selectedModelTier,
        enableImageGenerations,
        effectiveSystemPrompt,
      );
      const existingLock = getActiveCreateChatLock(createKey);
      if (existingLock) {
        if (existingLock.chatId) {
          setChatId(existingLock.chatId);
          if (chatIdParam !== existingLock.chatId) {
            const p = buildBuilderParams({
              chatId: existingLock.chatId,
              project: appProjectId ?? undefined,
            });
            router.replace(`/builder?${p.toString()}`);
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
        attachments: options.attachments?.length ?? 0,
        imageGenerations: enableImageGenerations,
        modelTier: MODEL_LABELS[canonicalizeModelId(selectedModelTier) ?? "v0-1.5-lg"],
        modelId: selectedModelTier,
        systemPromptProvided: Boolean(effectiveSystemPrompt?.trim()),
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

      const handleNonStreamingCreate = async (data: Record<string, unknown>) => {
        const meta =
          data?.meta && typeof data.meta === "object"
            ? (data.meta as Record<string, unknown>)
            : null;
        appendModelInfoPart(setMessages, assistantMessageId, {
          modelId:
            (typeof meta?.modelId === "string" && meta?.modelId) || selectedModelTier || null,
          modelTier:
            (typeof meta?.modelTier === "string" && meta?.modelTier) || selectedModelTier || null,
          thinking: typeof meta?.thinking === "boolean" ? (meta.thinking as boolean) : null,
          imageGenerations:
            typeof meta?.imageGenerations === "boolean"
              ? (meta.imageGenerations as boolean)
              : null,
          chatPrivacy: typeof meta?.chatPrivacy === "string" ? (meta.chatPrivacy as string) : null,
          promptAssistProvider: promptAssistModel
            ? (isPromptAssistOff(promptAssistModel) ? "off" : resolvePromptAssistProvider(promptAssistModel))
            : null,
          promptAssistModel: promptAssistModel ?? null,
          promptAssistDeep: promptAssistDeep ?? null,
        });
        const newChatId =
          data.id || data.chatId || data.v0ChatId || (data.chat as Record<string, unknown>)?.id;
        const newV0ProjectId = data.v0ProjectId || data.v0_project_id || null;
        const latestVersion = data.latestVersion as Record<string, unknown> | undefined;
        const resolvedVersionId =
          data.versionId || latestVersion?.id || latestVersion?.versionId || null;

        if (!newChatId) {
          throw new Error("No chat ID returned from API");
        }

        setChatId(String(newChatId));
        if (newV0ProjectId) {
          onV0ProjectId?.(String(newV0ProjectId));
        }
        {
          const p = buildBuilderParams({
            chatId: String(newChatId),
            project: appProjectId ?? undefined,
          });
          router.replace(`/builder?${p.toString()}`);
        }
        if (pendingCreateKeyRef.current) {
          updateCreateChatLockChatId(pendingCreateKeyRef.current, String(newChatId));
        }
        toast.success("Chat created!");

        if (latestVersion?.demoUrl) {
          setCurrentDemoUrl(latestVersion.demoUrl as string);
          onPreviewRefresh?.();
        }
        onGenerationComplete?.({
          chatId: String(newChatId),
          versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
          demoUrl: latestVersion?.demoUrl as string | undefined,
        });
        if (resolvedVersionId) {
          void triggerImageMaterialization({
            chatId: String(newChatId),
            versionId: String(resolvedVersionId),
            enabled: enableImageMaterialization,
          });
        }
        if (resolvedVersionId) {
          void runPostGenerationChecks({
            chatId: String(newChatId),
            versionId: String(resolvedVersionId),
            demoUrl: (latestVersion?.demoUrl as string) ?? null,
            assistantMessageId,
            setMessages,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
          });
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      };

      let requestBody: Record<string, unknown> | null = null;

      try {
        const formattedMessage = formatPrompt(initialMessage);
        debugLog("AI", "Prompt formatting result", {
          originalLength: initialMessage.length,
          finalLength: formattedMessage.length,
          changed: formattedMessage.trim() !== initialMessage.trim(),
        });
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        const thinkingForTier = enableThinking;
        const trimmedSystemPrompt = effectiveSystemPrompt?.trim();
        const promptMeta: Record<string, unknown> = {
          promptOriginal: initialMessage,
          promptFormatted: formattedMessage,
          formattedChanged: formattedMessage.trim() !== initialMessage.trim(),
          promptLength: initialMessage.length,
          formattedLength: formattedMessage.length,
          attachmentsCount: options.attachments?.length ?? 0,
          isFirstPrompt: true,
        };
        if (promptAssistModel) promptMeta.promptAssistModel = promptAssistModel;
        if (typeof promptAssistDeep === "boolean") promptMeta.promptAssistDeep = promptAssistDeep;
        if (promptAssistMode) promptMeta.promptAssistMode = promptAssistMode;
        if (buildIntent) promptMeta.buildIntent = buildIntent;
        if (buildMethod) promptMeta.buildMethod = buildMethod;
        if (scaffoldMode && scaffoldMode !== "off") promptMeta.scaffoldMode = scaffoldMode;
        if (scaffoldId) promptMeta.scaffoldId = scaffoldId;
        if (appProjectId) promptMeta.appProjectId = appProjectId;
        promptMeta.modelId = selectedModelTier;
        promptMeta.modelTier = selectedModelTier;

        requestBody = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
          chatPrivacy: chatPrivacy || "private",
          meta: promptMeta,
        };
        if (designSystemId) requestBody.designSystemId = designSystemId;
        if (v0ProjectId) requestBody.projectId = v0ProjectId;
        if (trimmedSystemPrompt) {
          requestBody.system = trimmedSystemPrompt;
          lastSentSystemPromptRef.current = trimmedSystemPrompt;
        } else {
          lastSentSystemPromptRef.current = null;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }

        streamAbortRef.current?.abort();
        const streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer(STREAM_SAFETY_TIMEOUT_DEFAULT_MS);

        const response = await fetch("/api/v0/chats/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: streamController.signal,
        });

        if (!response.ok) {
          let errorData: Record<string, unknown> | null = null;
          try {
            errorData = (await response.json()) as Record<string, unknown>;
          } catch {
            // ignore
          }
          throw new Error(
            buildApiErrorMessage({ response, errorData, fallbackMessage: "Failed to create chat" }),
          );
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
          await handleSseStream(
            response,
            {
              streamType: "create",
              assistantMessageId,
              selectedModelTier,
              chatId: null,
              setMessages,
              touchStreamSafetyTimer,
              setChatId,
              chatIdParam,
              buildBuilderParams,
              router,
              appProjectId,
              pendingCreateKeyRef,
              onV0ProjectId,
              setCurrentDemoUrl,
              onPreviewRefresh,
              onGenerationComplete,
              mutateVersions,
              enableImageMaterialization,
              autoFixHandlerRef,
              promptAssistModel,
              promptAssistDeep,
            },
            streamController.signal,
          );
        } else {
          const data = await response.json();
          await handleNonStreamingCreate(data);
        }
      } catch (error) {
        if (isAbortLikeError(error)) {
          debugLog("AI", "Create chat stream aborted");
          return;
        }

        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          try {
            const fallbackRes = await fetch("/api/v0/chats", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });
            if (!fallbackRes.ok) {
              let errorData: Record<string, unknown> | null = null;
              try {
                errorData = (await fallbackRes.json()) as Record<string, unknown>;
              } catch {
                // ignore
              }
              throw new Error(
                buildApiErrorMessage({
                  response: fallbackRes,
                  errorData,
                  fallbackMessage: "Failed to create chat",
                }),
              );
            }
            const data = await fallbackRes.json();
            await handleNonStreamingCreate(data);
            return;
          } catch (fallbackErr) {
            if (isAbortLikeError(fallbackErr)) {
              debugLog("AI", "Create chat fallback aborted");
              return;
            }
            finalError = fallbackErr;
          }
        }
        console.error("Error creating chat:", finalError);
        const message = finalError instanceof Error ? finalError.message : "Failed to create chat";
        toast.error(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId && !m.content
              ? { ...m, content: `Varning: ${message}`, isStreaming: false }
              : m,
          ),
        );
      } finally {
        clearStreamSafetyTimer();
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
      selectedModelTier,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      designSystemId,
      systemPrompt,
      setMessages,
      setChatId,
      chatIdParam,
      router,
      appProjectId,
      v0ProjectId,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      onV0ProjectId,
      mutateVersions,
      buildBuilderParams,
      buildIntent,
      buildMethod,
      scaffoldMode,
      scaffoldId,
      promptAssistModel,
      promptAssistDeep,
      promptAssistMode,
      chatPrivacy,
      startStreamSafetyTimer,
      touchStreamSafetyTimer,
      clearStreamSafetyTimer,
      streamAbortRef,
      autoFixHandlerRef,
      lastSentSystemPromptRef,
    ],
  );

  return { isCreatingChat, createNewChat, pendingCreateKeyRef, createChatInFlightRef, setIsCreatingChat };
}
