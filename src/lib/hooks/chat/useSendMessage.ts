import { useCallback } from "react";
import { toast } from "sonner";
import { formatPrompt } from "@/lib/builder/promptAssist";
import { debugLog } from "@/lib/utils/debug";
import { MODEL_LABELS, canonicalizeModelId, getBuildProfileId, v0TierToOpenAIModel } from "@/lib/v0/models";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, MessageOptions, ChatMessagingParams } from "./types";
import {
  appendAttachmentPrompt,
  buildApiErrorMessage,
  isAbortLikeError,
  isNetworkError,
} from "./helpers";
import { runPostGenerationChecks, triggerImageMaterialization } from "./post-checks";
import { handleSseStream } from "./stream-handlers";

export function useSendMessage(
  params: ChatMessagingParams,
  deps: {
    createNewChat: (
      initialMessage: string,
      options?: MessageOptions,
      systemPromptOverride?: string,
    ) => Promise<void>;
    streamAbortRef: React.MutableRefObject<AbortController | null>;
    autoFixHandlerRef: React.MutableRefObject<(payload: AutoFixPayload) => void>;
    lastSentSystemPromptRef: React.MutableRefObject<string | null>;
    startStreamSafetyTimer: (timeoutMs?: number) => void;
    touchStreamSafetyTimer: () => void;
    clearStreamSafetyTimer: () => void;
  },
) {
  const {
    chatId,
    appProjectId,
    selectedModelTier,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
    v0DesignSystemId,
    designThemePreset,
    systemPrompt,
    promptAssistModel,
    promptAssistDeep,
    buildIntent,
    buildMethod,
    scaffoldMode,
    scaffoldId,
    themeColors,
    paletteState,
    pendingBriefRef,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh,
    onGenerationComplete,
    setMessages,
  } = params;

  const {
    createNewChat,
    streamAbortRef,
    autoFixHandlerRef,
    lastSentSystemPromptRef,
    startStreamSafetyTimer,
    touchStreamSafetyTimer,
    clearStreamSafetyTimer,
  } = deps;

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
      const canonicalTier = canonicalizeModelId(selectedModelTier) ?? "max";
      const engineModel = v0TierToOpenAIModel(canonicalTier);
      const buildProfileId = getBuildProfileId(canonicalTier);

      debugLog("AI", "Send message requested", {
        messageLength: messageText.length,
        attachments: options.attachments?.length ?? 0,
        buildProfile: MODEL_LABELS[canonicalTier],
        buildProfileId,
        internalModelSelection: canonicalTier,
        engineModel,
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

      const handleNonStreamingSend = async (data: Record<string, unknown>) => {
        const demoUrl =
          (data?.demoUrl as string) ||
          ((data?.latestVersion as Record<string, unknown>)?.demoUrl as string) ||
          null;
        if (demoUrl) setCurrentDemoUrl(demoUrl);
        onPreviewRefresh?.();
        const latestVersion = data?.latestVersion as Record<string, unknown> | undefined;
        const resolvedVersionId =
          data?.versionId || latestVersion?.id || latestVersion?.versionId || null;
        const responseText =
          (typeof data?.text === "string" && data.text) ||
          (typeof data?.message === "string" && data.message) ||
          null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: (responseText as string) ?? m.content, isStreaming: false }
              : m,
          ),
        );
        mutateVersions();
        onGenerationComplete?.({
          chatId: chatId || "",
          versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
          demoUrl: demoUrl ?? undefined,
        });
        if (chatId && resolvedVersionId) {
          void triggerImageMaterialization({
            chatId: String(chatId),
            versionId: String(resolvedVersionId),
            enabled: enableImageMaterialization,
          });
        }
        if (chatId && resolvedVersionId) {
          void runPostGenerationChecks({
            chatId: String(chatId),
            versionId: String(resolvedVersionId),
            demoUrl: demoUrl ?? null,
            assistantMessageId,
            setMessages,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
          });
        }
      };

      let requestBody: Record<string, unknown> | null = null;

      try {
        const formattedMessage = formatPrompt(messageText);
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        const thinkingForTier = enableThinking;
        const promptMeta: Record<string, unknown> = {
          promptOriginal: messageText,
          promptFormatted: formattedMessage,
          formattedChanged: formattedMessage.trim() !== messageText.trim(),
          promptLength: messageText.length,
          formattedLength: formattedMessage.length,
          attachmentsCount: options.attachments?.length ?? 0,
          isFirstPrompt: false,
        };
        if (buildIntent) promptMeta.buildIntent = buildIntent;
        if (buildMethod) promptMeta.buildMethod = buildMethod;
        if (scaffoldMode && scaffoldMode !== "off") promptMeta.scaffoldMode = scaffoldMode;
        if (scaffoldId) promptMeta.scaffoldId = scaffoldId;
        if (appProjectId) promptMeta.appProjectId = appProjectId;
        if (designThemePreset) promptMeta.designTheme = designThemePreset;
        if (themeColors) promptMeta.themeColors = themeColors;
        if (paletteState?.selections?.length) promptMeta.palette = paletteState;
        if (options.planMode) promptMeta.planMode = true;
        if (pendingBriefRef?.current) {
          promptMeta.brief = pendingBriefRef.current;
          pendingBriefRef.current = null;
        }
        promptMeta.modelTier = selectedModelTier;
        promptMeta.modelTierId = canonicalTier;
        promptMeta.buildProfile = MODEL_LABELS[canonicalTier];
        promptMeta.buildProfileId = buildProfileId;
        promptMeta.modelId = engineModel;
        promptMeta.imageGenerations = enableImageGenerations;

        requestBody = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
          meta: promptMeta,
        };
        if (v0DesignSystemId) requestBody.designSystemId = v0DesignSystemId;
        const trimmedSystem = systemPrompt?.trim();
        const shouldSendSystem =
          Boolean(trimmedSystem) && trimmedSystem !== lastSentSystemPromptRef.current;
        if (trimmedSystem && shouldSendSystem) {
          requestBody.system = trimmedSystem;
          lastSentSystemPromptRef.current = trimmedSystem;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }

        streamAbortRef.current?.abort();
        const streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer(STREAM_SAFETY_TIMEOUT_DEFAULT_MS);

        const response = await fetch(`/api/v0/chats/${chatId}/stream`, {
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
            buildApiErrorMessage({
              response,
              errorData,
              fallbackMessage: "Failed to send message",
            }),
          );
        }

        await handleSseStream(
          response,
          {
            streamType: "send",
            assistantMessageId,
            selectedModelTier,
            chatId,
            setMessages,
            touchStreamSafetyTimer,
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
      } catch (error) {
        if (isAbortLikeError(error)) {
          debugLog("AI", "Streaming send aborted");
          return;
        }

        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          try {
            const fallbackRes = await fetch(`/api/v0/chats/${chatId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
              signal: streamAbortRef.current?.signal,
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
                  fallbackMessage: "Failed to send message",
                }),
              );
            }
            const data = await fallbackRes.json();
            await handleNonStreamingSend(data);
            return;
          } catch (fallbackErr) {
            if (isAbortLikeError(fallbackErr)) {
              debugLog("AI", "Streaming send fallback aborted");
              return;
            }
            finalError = fallbackErr;
          }
        }
        console.error("Error sending streaming message:", finalError);
        const message =
          finalError instanceof Error ? finalError.message : "Failed to send message";
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
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [
      chatId,
      appProjectId,
      createNewChat,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      v0DesignSystemId,
      designThemePreset,
      systemPrompt,
      setMessages,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      selectedModelTier,
      buildIntent,
      buildMethod,
      scaffoldMode,
      scaffoldId,
      themeColors,
      paletteState,
      pendingBriefRef,
      promptAssistModel,
      promptAssistDeep,
      mutateVersions,
      startStreamSafetyTimer,
      touchStreamSafetyTimer,
      clearStreamSafetyTimer,
      streamAbortRef,
      autoFixHandlerRef,
      lastSentSystemPromptRef,
    ],
  );

  return { sendMessage };
}
