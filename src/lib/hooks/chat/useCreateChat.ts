import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildInitBuildChoicesInstructions,
  buildInitBuildChoicesMeta,
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
} from "@/lib/builder/init-build-choices";
import { resolvePromptAssistProvider, isPromptAssistOff } from "@/lib/builder/prompt-assist";
import { normalizePlanArtifact } from "@/lib/gen/plan/schema";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
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
    setBuildIntent,
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
    applyPreviewHandoff,
    onVersionStatusRefresh,
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
        toast.error("Please enter a message to start a new chat");
        return false;
      }

      const baseSystemPrompt = systemPromptOverride ?? systemPrompt;
      const baseScaffoldMode = options.scaffoldModeOverride ?? scaffoldMode;
      const baseScaffoldId = options.scaffoldIdOverride ?? scaffoldId;

      // Byggval (init controls): strukturerade signaler för denna skapning,
      // lästa från den delade storen (samma källa som panelens UI-state).
      // Sajttypsvalet blir manuellt scaffold-val ENDAST när varken explicit
      // override eller header-valet redan pekat ut en scaffold — prioritet:
      // explicit override > header-manual > Byggval > auto.
      const activeInitChoices = getCurrentInitBuildChoices();
      const initChoicesMeta = buildInitBuildChoicesMeta(activeInitChoices);
      // Komplexitet går strukturerat (meta.complexityHint → BuildSpec) OCH
      // som sektionsdirektiv; färgläge/ton saknar pipeline-fält och åker som
      // svenska direktiv i custom-instructions-kanalen (body.system →
      // customInstructions → dynamic context) — aldrig i chattens input.
      // Medveten bieffekt: ett aktivt val räknas som custom system prompt
      // och stänger av simple-website-fastlanen (klassificeraren läser
      // hasCustomSystem) — rimligt, valet ÄR en medveten konfiguration.
      const initChoicesInstructions = buildInitBuildChoicesInstructions(activeInitChoices);
      const effectiveSystemPrompt = [baseSystemPrompt?.trim(), initChoicesInstructions]
        .filter(Boolean)
        .join("\n\n");
      let effectiveScaffoldMode = baseScaffoldMode;
      let effectiveScaffoldId = baseScaffoldId;
      if (
        initChoicesMeta.scaffoldId &&
        (baseScaffoldMode ?? "auto") === "auto" &&
        !baseScaffoldId
      ) {
        effectiveScaffoldMode = "manual";
        effectiveScaffoldId = initChoicesMeta.scaffoldId;
      }
      // Byggval's Hemsida/App choice is a deliberate act and outranks the intent
      // derived from the landing entry the user happened to arrive through.
      const effectiveBuildIntent = initChoicesMeta.buildIntent ?? buildIntent;
      // Persist into builder state + URL so follow-ups keep the same intent.
      // Without this, auth-pages (allowed for both) can flip back to website.
      if (
        initChoicesMeta.buildIntentExplicit &&
        (effectiveBuildIntent === "website" || effectiveBuildIntent === "app")
      ) {
        setBuildIntent?.(effectiveBuildIntent);
      }

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
          buildIntent: effectiveBuildIntent,
          buildIntentExplicit: Boolean(initChoicesMeta.buildIntentExplicit),
          planMode: options.planMode,
          promptAssistMode,
          promptAssistModel,
          promptAssistDeep,
          paletteState,
          // Byggval-hints skiljer jobb åt även när text/system är identiska.
          pageCountHint: initChoicesMeta.pageCountHint ?? null,
          styleKeywordsHint: initChoicesMeta.styleKeywordsHint ?? null,
          styleChoiceHint: initChoicesMeta.styleChoiceHint ?? null,
          toneKeywordsHint: initChoicesMeta.toneKeywordsHint ?? null,
          colorModeHint: initChoicesMeta.colorModeHint ?? null,
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
              buildIntent: effectiveBuildIntent,
            });
            router.replace(`/builder?${p.toString()}`);
          }
          toast.success("Återansluter till pågående skapning");
          // Ingen store-reset här: den URSPRUNGLIGA skapningen läste storen
          // synkront och äger livscykeln — den nollställer själv när (och
          // bara när) den gav en riktig artefakt. En eager reset vid
          // reconnect kunde annars tömma valen medan originalet fortfarande
          // streamar eller slutade tomt.
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

      // Returns whether a version was persisted — Byggval resets only then.
      const handleNonStreamingCreate = async (
        data: Record<string, unknown>,
      ): Promise<{ hasRecoveredArtifact: boolean; versionId: string | null }> => {
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
          mutedCapabilityLabels: Array.isArray(meta?.mutedCapabilityLabels)
            ? (meta.mutedCapabilityLabels as string[])
            : null,
          fileEvidenceCapabilities: Array.isArray(meta?.fileEvidenceCapabilities)
            ? (meta.fileEvidenceCapabilities as string[])
            : null,
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
          data.id || data.chatId || (data.chat as Record<string, unknown>)?.id;
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
            buildIntent: effectiveBuildIntent,
          });
          router.replace(`/builder?${p.toString()}`);
        }
        if (pendingCreateKeyRef.current) {
          updateCreateChatLockChatId(pendingCreateKeyRef.current, String(newChatId));
        }
        toast.success("Sajt skapad!");

        if (resolvedDemoUrl) {
          if (applyPreviewHandoff) {
            applyPreviewHandoff({
              url: resolvedDemoUrl,
              versionId: resolvedVersionId ? String(resolvedVersionId) : null,
            });
          } else {
            setCurrentPreviewUrl(resolvedDemoUrl);
          }
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
            onComplete: onVersionStatusRefresh,
          });
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
        // Spegla SSE-vägens "riktig artefakt"-signal för empty-output-hantering,
        // men Byggval-reset styrs separat via version (se createProducedVersion).
        const planArtifact = normalizePlanArtifact(data.planArtifact);
        const hasPlanArtifact = Boolean(
          planArtifact && (planArtifact.steps.length > 0 || planArtifact.blockers.length > 0),
        );
        const canonicalDemoUrl =
          resolvedDemoUrl && !isCompatibilityShimPreviewUrl(resolvedDemoUrl)
            ? resolvedDemoUrl
            : null;
        return {
          hasRecoveredArtifact: Boolean(
            resolvedVersionId ||
              canonicalDemoUrl ||
              data.awaitingInput === true ||
              hasPlanArtifact,
          ),
          versionId: resolvedVersionId ? String(resolvedVersionId) : null,
        };
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
        if (effectiveBuildIntent) promptMeta.buildIntent = effectiveBuildIntent;
        if (initChoicesMeta.buildIntentExplicit) promptMeta.buildIntentExplicit = true;
        if (buildMethod) promptMeta.buildMethod = buildMethod;
        if (effectiveScaffoldMode) promptMeta.scaffoldMode = effectiveScaffoldMode;
        if (effectiveScaffoldMode !== "off" && effectiveScaffoldId) {
          promptMeta.scaffoldId = effectiveScaffoldId;
        }
        if (appProjectId) promptMeta.appProjectId = appProjectId;
        if (designThemePreset) promptMeta.designTheme = designThemePreset;
        if (themeColors) promptMeta.themeColors = themeColors;
        if (paletteState?.selections?.length) promptMeta.palette = paletteState;
        if (initChoicesMeta.pageCountHint) {
          promptMeta.pageCountHint = initChoicesMeta.pageCountHint;
        }
        if (initChoicesMeta.styleKeywordsHint?.length) {
          promptMeta.styleKeywordsHint = initChoicesMeta.styleKeywordsHint;
        }
        if (initChoicesMeta.styleChoiceHint) {
          promptMeta.styleChoiceHint = initChoicesMeta.styleChoiceHint;
        }
        if (initChoicesMeta.toneKeywordsHint?.length) {
          promptMeta.toneKeywordsHint = initChoicesMeta.toneKeywordsHint;
        }
        if (initChoicesMeta.colorModeHint) {
          promptMeta.colorModeHint = initChoicesMeta.colorModeHint;
        }
        if (initChoicesMeta.complexityHint) {
          promptMeta.complexityHint = initChoicesMeta.complexityHint;
        }
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
          const recoveredChatId =
            typeof errorData?.chatId === "string" ? errorData.chatId.trim() : "";
          if (recoveredChatId) {
            setChatId(recoveredChatId);
            const params = buildBuilderParams({
              chatId: recoveredChatId,
              project: appProjectId ?? undefined,
              buildIntent: effectiveBuildIntent,
            });
            router.replace(`/builder?${params.toString()}`);
            if (pendingCreateKeyRef.current) {
              updateCreateChatLockChatId(pendingCreateKeyRef.current, recoveredChatId);
            }
          }
          const lockReason = errorData?.reason;
          if (
            lockReason === "generation_lock_unavailable" ||
            lockReason === "generation_in_progress"
          ) {
            toast.error(
              typeof errorData?.message === "string" && errorData.message.trim()
                ? errorData.message
                : "Kunde inte starta generationen just nu. Försök igen om en stund.",
            );
            return Boolean(recoveredChatId);
          }
          throw new Error(
            buildApiErrorMessage({ response, errorData, fallbackMessage: "Failed to create chat" }),
          );
        }

        const contentType = response.headers.get("content-type") || "";
        // Byggval nollställs först när en riktig version landat — awaitingInput
        // och planartefakt behåller valen till det första bygget.
        let createdVersionId: string | null = null;
        if (contentType.includes("text/event-stream")) {
          const streamResult = await handleSseStream(
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
              // Force Byggval-effective intent into SSE URL writes. Without this
              // the shared builder falls back to stale React state (landing
              // website) while setBuildIntent is still settling — reload then
              // restores the wrong mode.
              buildBuilderParams: (entries) =>
                buildBuilderParams({
                  ...entries,
                  buildIntent: effectiveBuildIntent,
                }),
              router,
              appProjectId,
              pendingCreateKeyRef,
              onLinkedProjectId,
              setCurrentPreviewUrl,
              setPreviewBuildError,
              setPreviewProdBuild,
              setPreviewPending,
              applyPreviewHandoff,
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
          createdVersionId = streamResult.versionIdFromStream;
        } else {
          const data = await response.json();
          const nonStreamResult = await handleNonStreamingCreate(data);
          createdVersionId = nonStreamResult.versionId;
        }
        // Brief consumed by server — clear only on success so retries can reuse it.
        if (pendingBriefRef?.current) {
          pendingBriefRef.current = null;
        }
        // Byggval consumed — clear only after the first real version so plan /
        // clarifying rounds keep scaffold, style, tone, pages, and color mode.
        if (createdVersionId) {
          resetInitBuildChoices();
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
                  fallbackMessage: "Failed to create chat",
                }),
              );
            }
            const data = await fallbackRes.json();
            const fallbackResult = await handleNonStreamingCreate(data);
            // Lyckad skapning via fallback — samma konsumtion som happy path.
            if (pendingBriefRef?.current) {
              pendingBriefRef.current = null;
            }
            if (fallbackResult.versionId) {
              resetInitBuildChoices();
            }
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
        const message = finalError instanceof Error ? finalError.message : "Failed to create chat";
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
      applyPreviewHandoff,
      onVersionStatusRefresh,
      onGenerationComplete,
      onPreviewSessionMeta,
      onLinkedProjectId,
      mutateVersions,
      buildBuilderParams,
      buildIntent,
      setBuildIntent,
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
