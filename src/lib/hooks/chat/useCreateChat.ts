import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { resolvePromptAssistProvider, isPromptAssistOff } from "@/lib/builder/prompt-assist";
import { MODEL_LABELS, canonicalizeModelId, canonicalModelIdToOwnModelId, getBuildProfileId } from "@/lib/models/catalog";
import { debugLog } from "@/lib/utils/debug";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, MessageOptions, ChatMessagingParams } from "./types";
import {
  appendAttachmentPrompt,
  appendModelInfoPart,
  appendPromptStrategyPart,
  buildApiErrorMessage,
  buildCreateChatKey,
  clearCreateChatLock,
  getActiveCreateChatLock,
  isAbortLikeError,
  isClientInitiatedAbort,
  isNetworkError,
  updateCreateChatLockChatId,
  writeCreateChatLock,
} from "./helpers";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import { handleSseStream } from "./stream-handlers";
import { ENGINE_CHATS_API_PREFIX } from "@/lib/api/engine-chats-path";
import { resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";

export function useCreateChat(
  params: ChatMessagingParams,
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
    linkedProjectId,
    selectedModelTier,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
    chatPrivacy,
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
    onLinkedProjectId,
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
      if (isCreatingChat || createChatInFlightRef.current) return false;
      if (!initialMessage?.trim()) {
        toast.error("Skriv ett meddelande för att starta en ny chat.");
        return false;
      }

      const effectiveSystemPrompt = systemPromptOverride ?? systemPrompt;
      const effectiveScaffoldMode = options.scaffoldModeOverride ?? scaffoldMode;
      const effectiveScaffoldId = options.scaffoldIdOverride ?? scaffoldId;

      const createKey = buildCreateChatKey(
        initialMessage,
        options,
        selectedModelTier,
        enableImageGenerations,
        effectiveSystemPrompt,
        {
          scaffoldMode: effectiveScaffoldMode,
          scaffoldId: effectiveScaffoldId,
          buildMethod,
          buildIntent,
          planMode: options.planMode,
          promptAssistMode,
          promptAssistModel,
          promptAssistDeep,
          paletteState,
        },
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
        return false;
      }

      pendingCreateKeyRef.current = createKey;
      writeCreateChatLock({ key: createKey, createdAt: Date.now() });
      createChatInFlightRef.current = true;
      resetBeforeCreateChat();

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;
      const canonicalTier = canonicalizeModelId(selectedModelTier) ?? "max";
      const engineModel = canonicalModelIdToOwnModelId(canonicalTier);
      const buildProfileId = getBuildProfileId(canonicalTier);

      debugLog("AI", "Create chat requested", {
        messageLength: initialMessage.length,
        attachments: options.attachments?.length ?? 0,
        imageGenerations: enableImageGenerations,
        buildProfile: MODEL_LABELS[canonicalTier],
        buildProfileId,
        internalModelSelection: canonicalTier,
        engine: engineModel,
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
            (typeof meta?.modelId === "string" && meta?.modelId) || engineModel || null,
          modelTier:
            (typeof meta?.modelTier === "string" && meta?.modelTier) || selectedModelTier || null,
          buildProfileId:
            typeof meta?.buildProfileId === "string" ? (meta.buildProfileId as string) : null,
          buildProfileLabel:
            typeof meta?.buildProfileLabel === "string" ? (meta.buildProfileLabel as string) : null,
          enginePath: typeof meta?.enginePath === "string" ? (meta.enginePath as string) : null,
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
          contractDataMode:
            typeof meta?.contractDataMode === "string" ? (meta.contractDataMode as string) : null,
          contractDatabaseProvider:
            typeof meta?.contractDatabaseProvider === "string"
              ? (meta.contractDatabaseProvider as string)
              : null,
          contractAuthProvider:
            typeof meta?.contractAuthProvider === "string" ? (meta.contractAuthProvider as string) : null,
          contractPaymentProvider:
            typeof meta?.contractPaymentProvider === "string"
              ? (meta.contractPaymentProvider as string)
              : null,
          contractIntegrations:
            Array.isArray(meta?.contractIntegrations)
              ? (meta.contractIntegrations as Array<{ provider?: string; name?: string; status?: string; envVars?: string[] }>)
              : null,
          contractEnvVars:
            Array.isArray(meta?.contractEnvVars)
              ? (meta.contractEnvVars as Array<{ key?: string; reason?: string; required?: boolean }>)
              : null,
          unresolvedContractDecisions:
            Array.isArray(meta?.unresolvedContractDecisions)
              ? (meta.unresolvedContractDecisions as Array<{ kind?: string; reason?: string } | string>)
              : null,
        });
        const promptStrategy =
          meta?.promptStrategy === "direct" ||
          meta?.promptStrategy === "phase_plan_build_refine" ||
          meta?.promptStrategy === "preserved"
            ? meta.promptStrategy
            : null;
        const promptType =
          meta?.promptType === "audit" ||
          meta?.promptType === "wizard" ||
          meta?.promptType === "freeform" ||
          meta?.promptType === "template" ||
          meta?.promptType === "followup_general" ||
          meta?.promptType === "followup_technical" ||
          meta?.promptType === "unknown"
            ? meta.promptType
            : null;
        const promptBudgetTarget =
          typeof meta?.promptBudgetTarget === "number" ? (meta.promptBudgetTarget as number) : null;
        const promptOriginalLength =
          typeof meta?.promptOriginalLength === "number" ? (meta.promptOriginalLength as number) : null;
        const promptOptimizedLength =
          typeof meta?.promptOptimizedLength === "number" ? (meta.promptOptimizedLength as number) : null;
        if (promptStrategy && promptType && promptBudgetTarget !== null && promptOriginalLength !== null &&
          promptOptimizedLength !== null) {
          // Plan 03 (short): "user" | "auto_repair" — default to "user" so
          // legacy non-streaming responses without the field render as
          // user-driven follow-ups (the previous behaviour).
          const promptSource =
            meta?.promptSource === "auto_repair" ? "auto_repair" : "user";
          appendPromptStrategyPart(setMessages, assistantMessageId, {
            strategy: promptStrategy,
            promptType,
            promptSource,
            budgetTarget: promptBudgetTarget,
            originalLength: promptOriginalLength,
            optimizedLength: promptOptimizedLength,
            reductionRatio:
              typeof meta?.promptReductionRatio === "number" ? (meta.promptReductionRatio as number) : 0,
            reason: typeof meta?.promptStrategyReason === "string" ? (meta.promptStrategyReason as string) : "",
            phaseHints: [],
            complexityScore:
              typeof meta?.promptComplexityScore === "number" ? (meta.promptComplexityScore as number) : 0,
            wasChanged: promptOriginalLength !== promptOptimizedLength,
          });
        }
        const newChatId =
          data.id || data.chatId || data.v0ChatId || (data.chat as Record<string, unknown>)?.id;
        const newLinkedProjectId =
          data.projectId || data.v0ProjectId || data.v0_project_id || null;
        const preflight = readPreviewPreflight(data);
        const latestVersion = data.latestVersion as Record<string, unknown> | undefined;
        const resolvedVersionId =
          data.versionId || latestVersion?.id || latestVersion?.versionId || null;
        const previewPending =
          data?.previewPending === true ||
          latestVersion?.previewPending === true;
        const fromDual =
          resolveInboundPreviewUrl(data as { previewUrl?: unknown; demoUrl?: unknown }) ||
          resolveInboundPreviewUrl(latestVersion as { previewUrl?: unknown; demoUrl?: unknown } | undefined);
        const resolvedDemoUrl = fromDual || null;

        if (!newChatId) {
          throw new Error("No chat ID returned from API");
        }

        setChatId(String(newChatId));
        if (newLinkedProjectId) {
          onLinkedProjectId?.(String(newLinkedProjectId));
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
        toast.success("Sajt skapad!");

        if (resolvedDemoUrl) {
          setCurrentPreviewUrl(resolvedDemoUrl);
          onPreviewRefresh?.();
        }
        setPreviewPending?.(previewPending);
        onGenerationComplete?.({
          chatId: String(newChatId),
          versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
          previewUrl: resolvedDemoUrl ?? undefined,
        });
        mutateVersions();
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
            demoUrl: resolvedDemoUrl,
            preflight,
            assistantMessageId,
            setMessages,
            mutateVersions,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
          });
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      };

      let requestBody: Record<string, unknown> | null = null;
      // Hoisted so the catch block can distinguish between client-initiated
      // aborts (we cancelled this controller) vs server/provider-initiated
      // aborts (controller still un-aborted but `fetch` rejected).
      let streamController: AbortController | null = null;

      try {
        // Deep Brief carries semantic expansion through meta.brief →
        // buildDynamicContext(). If it is absent, keep the raw user text;
        // Core Rules already carry the base constraints, so a mechanical
        // Prompt Assist wrapper would only add noise.
        const hasBrief = Boolean(pendingBriefRef?.current);
        const formattedMessage = initialMessage;
        debugLog("AI", "Prompt formatting result", {
          originalLength: initialMessage.length,
          finalLength: formattedMessage.length,
          changed: formattedMessage.trim() !== initialMessage.trim(),
          briefActive: hasBrief,
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
        if (pendingBriefRef?.current) {
          promptMeta.brief = pendingBriefRef.current;
          promptMeta.promptAssistDeep = true;
        }
        // Wizard-derived meta overrides anything above (e.g. a structured brief
        // seeded from IntakeWizard takes priority over the auto-generated one
        // so canonical ids like primaryCallToAction / industry / mustHave win).
        if (options.meta && typeof options.meta === "object") {
          const { brief: wizardBrief, ...rest } = options.meta as Record<string, unknown>;
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) promptMeta[k] = v;
          }
          if (wizardBrief && typeof wizardBrief === "object") {
            const base = (promptMeta.brief && typeof promptMeta.brief === "object")
              ? (promptMeta.brief as Record<string, unknown>)
              : {};
            promptMeta.brief = { ...base, ...(wizardBrief as Record<string, unknown>) };
          }
        }
        promptMeta.modelId = engineModel;
        promptMeta.modelTier = selectedModelTier;
        promptMeta.modelTierId = canonicalTier;
        promptMeta.buildProfile = MODEL_LABELS[canonicalTier];
        promptMeta.buildProfileId = buildProfileId;

        requestBody = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
          chatPrivacy: chatPrivacy || "private",
          meta: promptMeta,
        };
        if (linkedProjectId) requestBody.projectId = linkedProjectId;
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
        streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer(STREAM_SAFETY_TIMEOUT_DEFAULT_MS);

        const response = await fetch(`${ENGINE_CHATS_API_PREFIX}/stream`, {
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
            buildApiErrorMessage({ response, errorData, fallbackMessage: "Kunde inte starta chatten." }),
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
              onLinkedProjectId,
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
        } else {
          const data = await response.json();
          await handleNonStreamingCreate(data);
        }
        // Brief consumed by server — clear only on success so retries can reuse it.
        if (pendingBriefRef?.current) {
          pendingBriefRef.current = null;
        }
      } catch (error) {
        if (isClientInitiatedAbort(error, streamController)) {
          debugLog("AI", "Create chat stream aborted by client");
          return true;
        }
        if (isAbortLikeError(error)) {
          debugLog("AI", "Create chat stream aborted by server/provider");
          toast.error(
            "Strömmen avbröts av servern eller modellen. Försök igen — om det upprepas, prova en annan modell.",
          );
          return true;
        }

        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          const fallbackController = new AbortController();
          try {
            const fallbackRes = await fetch(ENGINE_CHATS_API_PREFIX, {
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
                  fallbackMessage: "Kunde inte starta chatten.",
                }),
              );
            }
            const data = await fallbackRes.json();
            await handleNonStreamingCreate(data);
            return true;
          } catch (fallbackErr) {
            if (isClientInitiatedAbort(fallbackErr, fallbackController)) {
              debugLog("AI", "Create chat fallback aborted by client");
              return true;
            }
            finalError = fallbackErr;
          }
        }
        console.error("Error creating chat:", finalError);
        const message = finalError instanceof Error ? finalError.message : "Kunde inte starta chatten.";
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
        pendingCreateKeyRef.current = null;
        clearCreateChatLock();
        createChatInFlightRef.current = false;
        setIsCreatingChat(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
      return true;
    },
    [
      isCreatingChat,
      resetBeforeCreateChat,
      selectedModelTier,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      designThemePreset,
      systemPrompt,
      setMessages,
      setChatId,
      chatIdParam,
      router,
      appProjectId,
      linkedProjectId,
      setCurrentPreviewUrl,
      setPreviewBuildError,
      setPreviewProdBuild,
      onPreviewRefresh,
      onGenerationComplete,
      onPreviewSessionMeta,
      onLinkedProjectId,
      mutateVersions,
      buildBuilderParams,
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
      chatPrivacy,
      startStreamSafetyTimer,
      touchStreamSafetyTimer,
      clearStreamSafetyTimer,
      streamAbortRef,
      autoFixHandlerRef,
      lastSentSystemPromptRef,
      setPreviewPending,
    ],
  );

  return { isCreatingChat, createNewChat, pendingCreateKeyRef, createChatInFlightRef, setIsCreatingChat };
}
