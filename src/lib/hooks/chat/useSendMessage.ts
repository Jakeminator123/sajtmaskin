import { useCallback } from "react";
import { toast } from "sonner";
import { formatPrompt } from "@/lib/builder/promptAssist";
import { MODEL_LABELS, canonicalizeModelId, canonicalModelIdToOwnModelId, getBuildProfileId } from "@/lib/models/catalog";
import { debugLog } from "@/lib/utils/debug";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, MessageOptions, ChatMessagingParams } from "./types";
import {
  appendAttachmentPrompt,
  appendToolPartToMessage,
  buildApiErrorMessage,
  isAbortLikeError,
  isNetworkError,
} from "./helpers";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import { handleSseStream } from "./stream-handlers";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";
import { isCompatibilityShimPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";

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
    activeVersionId,
    appProjectId,
    selectedModelTier,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
    thinkingUserSetRef,
    registryDesignSystemId,
    designThemePreset,
    systemPrompt,
    promptAssistModel,
    promptAssistDeep,
    promptAssistMode,
    buildIntent,
    buildMethod,
    scaffoldMode,
    scaffoldId,
    themeColors,
    paletteState,
    pendingBriefRef,
    mutateVersions,
    setCurrentPreviewUrl,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewRefresh,
    onGenerationComplete,
    onPreviewSessionMeta,
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
      const engineModel = canonicalModelIdToOwnModelId(canonicalTier);
      const buildProfileId = getBuildProfileId(canonicalTier);

      debugLog("AI", "Send message requested", {
        messageLength: messageText.length,
        attachments: options.attachments?.length ?? 0,
        buildProfile: MODEL_LABELS[canonicalTier],
        buildProfileId,
        internalModelSelection: canonicalTier,
        engineModel,
      });

      setPreviewBuildError?.(null);
      setPreviewProdBuild?.(null);
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
        const latestVersion = data?.latestVersion as Record<string, unknown> | undefined;
        const previewResolved =
          resolveInboundPreviewUrl(data as { previewUrl?: unknown; demoUrl?: unknown }) ||
          resolveInboundPreviewUrl(
            latestVersion as
              | { previewUrl?: unknown; demoUrl?: unknown }
              | undefined,
          );
        const preflight = readPreviewPreflight(data);
        if (previewResolved) {
          const n = normalizePreviewUrl(previewResolved);
          if (n && !isCompatibilityShimPreviewUrl(n)) {
            setCurrentPreviewUrl(n);
          }
        }
        onPreviewRefresh?.();
        const resolvedVersionId =
          data?.versionId || latestVersion?.id || latestVersion?.versionId || null;
        const responseText =
          (typeof data?.text === "string" && data.text) ||
          (typeof data?.message === "string" && data.message) ||
          null;
        const awaitingInputPrompt =
          data?.awaitingInputPrompt && typeof data.awaitingInputPrompt === "object"
            ? (data.awaitingInputPrompt as Record<string, unknown>)
            : null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: (responseText as string) ?? m.content, isStreaming: false }
              : m,
          ),
        );
        if (data?.awaitingInput === true) {
          const promptQuestion =
            (typeof awaitingInputPrompt?.question === "string" &&
              awaitingInputPrompt.question.trim()) ||
            (typeof responseText === "string" && responseText.trim()) ||
            "AI väntar på ditt svar innan nästa steg kan fortsätta.";
          const promptOptions = Array.isArray(awaitingInputPrompt?.options)
            ? (awaitingInputPrompt.options as unknown[])
                .map((option) => (typeof option === "string" ? option.trim() : ""))
                .filter(Boolean)
            : [];
          appendToolPartToMessage(setMessages, assistantMessageId, {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            toolCallId: `awaiting-input:${assistantMessageId}`,
            state: "input-available",
            output: {
              question: promptQuestion,
              options: promptOptions.length > 0 ? promptOptions : undefined,
              kind:
                typeof awaitingInputPrompt?.kind === "string"
                  ? awaitingInputPrompt.kind
                  : "unclear",
              awaitingInput: true,
            },
          });
        }
        mutateVersions();
        onGenerationComplete?.({
          chatId: chatId || "",
          versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
          previewUrl: previewResolved ?? undefined,
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
            demoUrl: previewResolved ?? null,
            preflight,
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
        const effectiveScaffoldMode = options.scaffoldModeOverride ?? scaffoldMode;
        const effectiveScaffoldId = options.scaffoldIdOverride ?? scaffoldId;
        const thinkingForTier = thinkingUserSetRef?.current ? enableThinking : undefined;
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
        if (effectiveScaffoldMode && effectiveScaffoldMode !== "off") promptMeta.scaffoldMode = effectiveScaffoldMode;
        if (effectiveScaffoldId) promptMeta.scaffoldId = effectiveScaffoldId;
        if (appProjectId) promptMeta.appProjectId = appProjectId;
        if (designThemePreset) promptMeta.designTheme = designThemePreset;
        if (themeColors) promptMeta.themeColors = themeColors;
        if (paletteState?.selections?.length) promptMeta.palette = paletteState;
        if (options.planMode) promptMeta.planMode = true;
        if (options.promptSourceMeta) {
          promptMeta.promptSourceKind = options.promptSourceMeta.sourceKind;
          promptMeta.promptSourceTechnical = options.promptSourceMeta.isTechnical;
          promptMeta.promptSourcePreservePayload = options.promptSourceMeta.preservePayload;
        }
        if (promptAssistModel) promptMeta.promptAssistModel = promptAssistModel;
        if (promptAssistMode) promptMeta.promptAssistMode = promptAssistMode;
        if (pendingBriefRef?.current) {
          promptMeta.brief = pendingBriefRef.current;
          promptMeta.promptAssistDeep = true;
        } else if (typeof promptAssistDeep === "boolean") {
          promptMeta.promptAssistDeep = promptAssistDeep;
        }
        const trimmedVersionId =
          typeof options.engineBaseVersionIdOverride === "string"
            ? options.engineBaseVersionIdOverride.trim()
            : activeVersionId?.trim();
        if (trimmedVersionId) {
          promptMeta.engineBaseVersionId = trimmedVersionId;
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
        if (registryDesignSystemId) requestBody.designSystemId = registryDesignSystemId;
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

        const response = await fetch(`${engineChatBaseUrl(chatId)}/stream`, {
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
            setCurrentPreviewUrl,
            setPreviewBuildError,
            setPreviewProdBuild,
            setPreviewPending,
            onPreviewRefresh,
            onGenerationComplete,
            onPreviewSessionMeta,
            mutateVersions,
            enableImageMaterialization,
            autoFixHandlerRef,
            promptAssistModel,
            promptAssistDeep,
            promptAssistMode,
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
            const fallbackRes = await fetch(`${engineChatBaseUrl(chatId)}/messages`, {
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
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: m.content?.trim()
                    ? `${m.content}\n\nVarning: ${message}`
                    : `Varning: ${message}`,
                  isStreaming: false,
                }
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
      activeVersionId,
      appProjectId,
      createNewChat,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      registryDesignSystemId,
      designThemePreset,
      systemPrompt,
      setMessages,
      setCurrentPreviewUrl,
      setPreviewBuildError,
      setPreviewProdBuild,
      onPreviewRefresh,
      onGenerationComplete,
      onPreviewSessionMeta,
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
      promptAssistMode,
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
