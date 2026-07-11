import { useCallback } from "react";
import { toast } from "sonner";
import { MODEL_LABELS, canonicalizeModelId, canonicalModelIdToOwnModelId, getBuildProfileId } from "@/lib/models/catalog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, MessageOptions, ChatMessagingParams } from "./types";
import {
  appendAttachmentPrompt,
  appendToolPartToMessage,
  buildApiErrorMessage,
  isAbortLikeError,
  isClientInitiatedAbort,
  isNetworkError,
} from "./helpers";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import { handleSseStream } from "./stream-handlers";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { runF3FinalizeAction } from "@/lib/builder/f3-finalize-action";
import { dispatchF3Requirements } from "@/lib/builder/project-env-events";

export function useSendMessage(
  params: ChatMessagingParams,
  deps: {
    createNewChat: (
      initialMessage: string,
      options?: MessageOptions,
      systemPromptOverride?: string,
    ) => Promise<boolean>;
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
    latestKnownVersionId,
    appProjectId,
    selectedModelTier,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
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
    pendingBriefRef: _pendingBriefRef,
    mutateVersions,
    setCurrentPreviewUrl,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewRefresh,
    onVersionStatusRefresh,
    onDeterministicF3Settled,
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
        if (!(await createNewChat(messageText, options))) return;
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
            mutateVersions,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
            onComplete: onVersionStatusRefresh,
          });
        }
      };

      let requestBody: Record<string, unknown> | null = null;
      // Hoisted so the catch block can distinguish between client-initiated
      // aborts (we cancelled this controller) vs server/provider-initiated
      // aborts (controller still un-aborted but `fetch` rejected).
      let streamController: AbortController | null = null;

      try {
        // Follow-ups are delta operations; keep the user's wording intact.
        // Shared requirements live in Core Rules and snapshot context.
        const formattedMessage = messageText;
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        const effectiveScaffoldMode = options.scaffoldModeOverride ?? scaffoldMode;
        const effectiveScaffoldId = options.scaffoldIdOverride ?? scaffoldId;
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
        // Defense-in-depth: never re-send the init brief on follow-ups.
        // The server uses persisted scaffold, orchestration snapshot, and
        // previous files for follow-up context instead.
        if (typeof promptAssistDeep === "boolean") {
          promptMeta.promptAssistDeep = promptAssistDeep;
        }
        const engineBaseVersionIdOverride = options.engineBaseVersionIdOverride;
        const usedEngineBaseVersionOverride =
          typeof engineBaseVersionIdOverride === "string";
        const trimmedVersionId = usedEngineBaseVersionOverride
          ? engineBaseVersionIdOverride.trim()
          : activeVersionId?.trim();
        if (trimmedVersionId) {
          promptMeta.engineBaseVersionId = trimmedVersionId;
        }
        // 5-2 stale-base gate (client half): on a regular follow-up the base is
        // the user's current builder selection, so tell the server which
        // version we believe is newest. The server returns 409 instead of
        // silently building on a base another writer has already superseded.
        // Deliberately editing an older version stays allowed because this
        // known-latest still matches the server's when the user is up to date.
        // Explicit overrides (F3 "Bygg integrationer", autofix) target a
        // specific version on purpose, so they skip the signal and the gate.
        const trimmedLatestKnownVersionId = latestKnownVersionId?.trim();
        if (!usedEngineBaseVersionOverride && trimmedLatestKnownVersionId) {
          promptMeta.engineLatestKnownVersionId = trimmedLatestKnownVersionId;
        }
        if (options.lifecycleStageOverride) {
          promptMeta.lifecycleStage = options.lifecycleStageOverride;
        }
        const trimmedParentVersionId =
          typeof options.parentVersionIdOverride === "string"
            ? options.parentVersionIdOverride.trim()
            : null;
        if (trimmedParentVersionId) {
          promptMeta.parentVersionId = trimmedParentVersionId;
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
        streamController = new AbortController();
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
          if (
            response.status === 412 &&
            errorData?.error === "tier3_env_not_ready" &&
            typeof errorData.parentVersionId === "string" &&
            Array.isArray(errorData.missingByIntegration)
          ) {
            dispatchF3Requirements({
              parentVersionId: errorData.parentVersionId,
              projectId:
                typeof errorData.projectId === "string"
                  ? errorData.projectId
                  : null,
              missingByIntegration: errorData.missingByIntegration.filter(
                (entry): entry is {
                  key: string;
                  name: string;
                  missing: string[];
                } =>
                  Boolean(
                    entry &&
                      typeof entry === "object" &&
                      typeof (entry as Record<string, unknown>).key === "string" &&
                      typeof (entry as Record<string, unknown>).name === "string" &&
                      Array.isArray(
                        (entry as Record<string, unknown>).missing,
                      ),
                  ),
              ),
            });
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content:
                        "F3 kräver riktiga build-nycklar. Fyll i dem i kravytan och fortsätt integrationsbygget.",
                      isStreaming: false,
                    }
                  : message,
              ),
            );
            return;
          }
          if (
            response.status === 409 &&
            errorData?.error === "f3_deterministic_release_required" &&
            typeof errorData.parentVersionId === "string"
          ) {
            const release = await runF3FinalizeAction({
              chatId,
              parentVersionId: errorData.parentVersionId,
            });
            let content: string;
            if (release.kind === "deterministic_release") {
              onDeterministicF3Settled?.({
                versionId: release.versionId,
                selectVersion: !release.superseded,
              });
              if (release.ok) {
                content = release.alreadyPromoted
                  ? "F3-versionen var redan godkänd av ReleaseGate."
                  : "F3-versionen skapades från exakt samma filer och godkändes av ReleaseGate.";
                toast.success("ReleaseGate godkänd.");
              } else if (release.superseded) {
                content =
                  "F3-versionen ersattes av en nyare version innan ReleaseGate kunde promotera den.";
                toast.warning("F3-versionen ersattes av en nyare version.");
              } else {
                const failed = release.failedChecks.join(", ");
                content = release.promoteError || release.retryable
                  ? "ReleaseGate kunde inte slutföra promotion. Försök igen."
                  : failed
                    ? `ReleaseGate underkände: ${failed}.`
                    : "ReleaseGate blev inte godkänd. Se versionsdiagnostiken.";
                toast.warning("ReleaseGate behöver åtgärdas.");
              }
            } else if (release.kind === "missing_env") {
              dispatchF3Requirements({
                parentVersionId: release.parentVersionId,
                projectId: release.projectId,
                missingByIntegration: release.missingByIntegration,
              });
              content =
                "F3 kräver riktiga build-nycklar. Fyll i dem i kravytan och försök igen.";
              toast.warning("F3 saknar obligatoriska env-värden.");
            } else {
              content =
                release.kind === "error"
                  ? release.message
                  : "F3-specen kräver nu ett vanligt integrationsbygge. Starta det igen från previewpanelen.";
              toast.warning("F3-kontrollen kunde inte slutföras.");
            }
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content, isStreaming: false }
                  : message,
              ),
            );
            return;
          }
          // 5-2 stale-base gate (client half): the server already has a newer
          // version than the one this request was built against. Surface a
          // reload hint and refresh the version list instead of falling
          // through to the generic error/abort path.
          if (response.status === 409 && errorData?.reason === "stale_base_version") {
            toast.error(
              "En nyare version finns. Ladda om sidan för att fortsätta från den senaste versionen.",
            );
            mutateVersions();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content:
                        m.content?.trim() ||
                        "En nyare version finns – ladda om för att bygga vidare på den senaste versionen.",
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            return;
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
            onVersionStatusRefresh,
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
        if (isClientInitiatedAbort(error, streamController)) {
          debugLog("AI", "Streaming send aborted by client");
          return;
        }
        if (isAbortLikeError(error)) {
          // Abort-shaped error that did NOT originate from our controller →
          // server/provider/proxy tore the stream down. Surface as a toast
          // so the user doesn't think the half-rendered output is final.
          debugLog("AI", "Streaming send aborted by server/provider");
          toast.error(
            "Strömmen avbröts av servern eller modellen. Försök igen — om det upprepas, prova en annan modell.",
          );
          return;
        }

        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          const fallbackController = new AbortController();
          try {
            const fallbackRes = await fetch(`${engineChatBaseUrl(chatId)}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
              signal: fallbackController.signal,
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
            if (isClientInitiatedAbort(fallbackErr, fallbackController)) {
              debugLog("AI", "Streaming send fallback aborted by client");
              return;
            }
            finalError = fallbackErr;
          }
        }
        errorLog("AI", "Error sending streaming message", finalError);
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
      latestKnownVersionId,
      appProjectId,
      createNewChat,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      designThemePreset,
      systemPrompt,
      setMessages,
      setCurrentPreviewUrl,
      setPreviewBuildError,
      setPreviewProdBuild,
      onPreviewRefresh,
      onVersionStatusRefresh,
      onDeterministicF3Settled,
      onGenerationComplete,
      onPreviewSessionMeta,
      selectedModelTier,
      buildIntent,
      buildMethod,
      scaffoldMode,
      scaffoldId,
      themeColors,
      paletteState,
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
      setPreviewPending,
    ],
  );

  return { sendMessage };
}
