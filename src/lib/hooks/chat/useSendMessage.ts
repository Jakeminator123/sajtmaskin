import { useCallback } from "react";
import { toast } from "sonner";
import { MODEL_LABELS, canonicalizeModelId, canonicalModelIdToOwnModelId, getBuildProfileId } from "@/lib/models/catalog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { PROMPT_SOURCE_UI_PART_TYPE } from "@/lib/builder/types";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type {
  AutoFixPayload,
  MessageOptions,
  ChatMessagingParams,
  SendMessageOutcome,
} from "./types";
import {
  appendAttachmentPrompt,
  appendToolPartToMessage,
  buildApiErrorMessage,
  isAbortLikeError,
  isClientInitiatedAbort,
  isNetworkError,
} from "./helpers";
import { runPostGenerationChecks, abortPostChecksForChat } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import { readPreviewPreflight } from "./post-checks-preview";
import { handleSseStream } from "./stream-handlers";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { runF3FinalizeAction } from "@/lib/builder/f3-finalize-action";
import { dispatchF3Requirements, dispatchF3Status } from "@/lib/builder/project-env-events";
import {
  buildInitBuildChoicesInstructions,
  buildInitBuildChoicesMeta,
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
} from "@/lib/builder/init-build-choices";

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
    buildIntent,
    setBuildIntent,
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
    applyPreviewHandoff,
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
    async (
      messageText: string,
      options: MessageOptions = {},
    ): Promise<SendMessageOutcome> => {
      if (!messageText?.trim()) {
        return { status: "rejected", reason: "empty_message", turnRecorded: false };
      }

      if (!chatId) {
        if (!(await createNewChat(messageText, options))) {
          return { status: "rejected", reason: "create_chat_failed", turnRecorded: false };
        }
        return { status: "started", via: "new_chat" };
      }

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      /**
       * Settle a rejection the server did NOT write down (`turnRecorded:
       * false`): the stale-base 409 and the tier-3 412 both return ahead of
       * `addMessage`, so the optimistic user row is a client-only ghost. It is
       * dropped and only the assistant notice explaining the refusal stays,
       * because the caller keeps its draft for that outcome — the prompt must
       * live in exactly ONE place. Keeping both copies invites a duplicate
       * turn; hiding a row the server DID persist reappears on reload. Both
       * were reported on #610, which is why the two decisions derive from the
       * one `turnRecorded` field instead of being judged per call site.
       */
      const settleRejectedTurn = (assistantContent: string) => {
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== userMessageId)
            .map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: m.content?.trim() || assistantContent,
                    isStreaming: false,
                  }
                : m,
            ),
        );
      };

      // 5-2 stale-base gate (client half), delad mellan stream-vägen och
      // /messages-nätverksfallbacken (backlog PR #355-triage #20): servern har
      // redan en nyare version än den requesten byggdes mot — visa
      // reload-UX:en + refresha versionslistan i stället för generiskt fel.
      const handleStaleBaseVersion = (
        status: number,
        errorData: Record<string, unknown> | null,
      ): boolean => {
        if (status !== 409 || errorData?.reason !== "stale_base_version") return false;
        toast.error(
          "En nyare version finns. Ladda om sidan för att fortsätta från den senaste versionen.",
        );
        mutateVersions();
        settleRejectedTurn(
          "En nyare version finns – ladda om för att bygga vidare på den senaste versionen.",
        );
        return true;
      };
      const handleGenerationInProgress = (
        status: number,
        errorData: Record<string, unknown> | null,
      ): boolean => {
        if (status !== 409 || errorData?.reason !== "generation_in_progress") return false;
        toast.error("En generation pågår redan. Vänta tills den är klar.");
        settleRejectedTurn("En generation pågår redan — vänta tills den är klar.");
        return true;
      };
      const handleGenerationLockUnavailable = (
        status: number,
        errorData: Record<string, unknown> | null,
      ): boolean => {
        if (status !== 503 || errorData?.reason !== "generation_lock_unavailable") return false;
        toast.error("Kunde inte starta generationen just nu. Försök igen om en stund.");
        settleRejectedTurn("Kunde inte starta generationen just nu — försök igen om en stund.");
        return true;
      };
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

      // Auto-repair sends (client post-check) carry a `sourceKind: "autofix"`
      // discriminator. Mirror it onto the optimistic row's uiParts so the
      // message renders as a collapsed system row (Spår 03 Steg 4) instead of
      // a user bubble even before the server round-trip confirms it — the
      // server persists the same marker (see chat-message-stream/handler.ts).
      const isAutoRepairSend = options.promptSourceMeta?.sourceKind === "autofix";
      setPreviewBuildError?.(null);
      setPreviewProdBuild?.(null);
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          content: messageText,
          uiParts: isAutoRepairSend
            ? [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }]
            : undefined,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          uiParts: [],
        },
      ]);

      const handleNonStreamingSend = async (data: Record<string, unknown>): Promise<string | null> => {
        const latestVersion = data?.latestVersion as Record<string, unknown> | undefined;
        const previewResolved =
          resolveInboundPreviewUrl(data as { previewUrl?: unknown; demoUrl?: unknown }) ||
          resolveInboundPreviewUrl(
            latestVersion as
              | { previewUrl?: unknown; demoUrl?: unknown }
              | undefined,
          );
        const preflight = readPreviewPreflight(data);
        const resolvedVersionId =
          data?.versionId || latestVersion?.id || latestVersion?.versionId || null;
        if (previewResolved) {
          const n = normalizePreviewUrl(previewResolved);
          if (n && !isCompatibilityShimPreviewUrl(n)) {
            if (applyPreviewHandoff) {
              applyPreviewHandoff({
                url: n,
                versionId: resolvedVersionId ? String(resolvedVersionId) : null,
              });
            } else {
              setCurrentPreviewUrl(n);
            }
          }
        }
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
        return resolvedVersionId ? String(resolvedVersionId) : null;
      };

      let requestBody: Record<string, unknown> | null = null;
      // Hoisted so the catch block can distinguish between client-initiated
      // aborts (we cancelled this controller) vs server/provider-initiated
      // aborts (controller still un-aborted but `fetch` rejected).
      let streamController: AbortController | null = null;
      // Hoisted for the /messages fallback path (same Byggval reset rule).
      const isFirstBuildAfterGate = !activeVersionId;

      try {
        // Follow-ups are delta operations; keep the user's wording intact.
        // Shared requirements live in Core Rules and snapshot context.
        const formattedMessage = messageText;
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        // First codegen after plan/contract: chat exists but no version yet.
        // Re-forward Byggval hints so the answering turn does not ignore the
        // welcome-panel choices kept in the store until the first version.
        const activeInitChoices = isFirstBuildAfterGate
          ? getCurrentInitBuildChoices()
          : null;
        const initChoicesMeta = activeInitChoices
          ? buildInitBuildChoicesMeta(activeInitChoices)
          : null;
        const initChoicesInstructions = activeInitChoices
          ? buildInitBuildChoicesInstructions(activeInitChoices)
          : "";
        let effectiveScaffoldMode = options.scaffoldModeOverride ?? scaffoldMode;
        let effectiveScaffoldId = options.scaffoldIdOverride ?? scaffoldId;
        if (
          initChoicesMeta?.scaffoldId &&
          (effectiveScaffoldMode ?? "auto") === "auto" &&
          !effectiveScaffoldId
        ) {
          effectiveScaffoldMode = "manual";
          effectiveScaffoldId = initChoicesMeta.scaffoldId;
        }
        const effectiveBuildIntent = initChoicesMeta?.buildIntent ?? buildIntent;
        if (
          initChoicesMeta?.buildIntentExplicit &&
          (effectiveBuildIntent === "website" || effectiveBuildIntent === "app")
        ) {
          setBuildIntent?.(effectiveBuildIntent);
        }
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
        if (effectiveBuildIntent) promptMeta.buildIntent = effectiveBuildIntent;
        if (initChoicesMeta?.buildIntentExplicit) promptMeta.buildIntentExplicit = true;
        if (buildMethod) promptMeta.buildMethod = buildMethod;
        if (effectiveScaffoldMode) promptMeta.scaffoldMode = effectiveScaffoldMode;
        if (effectiveScaffoldMode !== "off" && effectiveScaffoldId) {
          promptMeta.scaffoldId = effectiveScaffoldId;
        }
        if (appProjectId) promptMeta.appProjectId = appProjectId;
        if (designThemePreset) promptMeta.designTheme = designThemePreset;
        if (themeColors) promptMeta.themeColors = themeColors;
        if (paletteState?.selections?.length) promptMeta.palette = paletteState;
        if (initChoicesMeta?.pageCountHint) {
          promptMeta.pageCountHint = initChoicesMeta.pageCountHint;
        }
        if (initChoicesMeta?.styleKeywordsHint?.length) {
          promptMeta.styleKeywordsHint = initChoicesMeta.styleKeywordsHint;
        }
        if (initChoicesMeta?.styleChoiceHint) {
          promptMeta.styleChoiceHint = initChoicesMeta.styleChoiceHint;
        }
        if (initChoicesMeta?.toneKeywordsHint?.length) {
          promptMeta.toneKeywordsHint = initChoicesMeta.toneKeywordsHint;
        }
        if (initChoicesMeta?.colorModeHint) {
          promptMeta.colorModeHint = initChoicesMeta.colorModeHint;
        }
        if (initChoicesMeta?.complexityHint) {
          promptMeta.complexityHint = initChoicesMeta.complexityHint;
        }
        if (options.planMode) promptMeta.planMode = true;
        if (options.promptSourceMeta) {
          promptMeta.promptSourceKind = options.promptSourceMeta.sourceKind;
          promptMeta.promptSourceTechnical = options.promptSourceMeta.isTechnical;
          promptMeta.promptSourcePreservePayload = options.promptSourceMeta.preservePayload;
        }
        if (promptAssistModel) promptMeta.promptAssistModel = promptAssistModel;
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
        // OpenClaw prepared-prompt fast lane: top-level body tag (NOT meta —
        // the prompt-log meta already has a different `promptSource` key from
        // strategyMeta). Server-side it is honored only when OC_EDIT is on
        // and the prompt passes the deterministic structure check.
        if (options.promptSource) {
          requestBody.promptSource = options.promptSource;
        }
        const effectiveSystemPrompt = [systemPrompt?.trim(), initChoicesInstructions]
          .filter(Boolean)
          .join("\n\n");
        const trimmedSystem = effectiveSystemPrompt.trim();
        const shouldSendSystem =
          Boolean(trimmedSystem) &&
          (isFirstBuildAfterGate || trimmedSystem !== lastSentSystemPromptRef.current);
        if (trimmedSystem && shouldSendSystem) {
          requestBody.system = trimmedSystem;
          lastSentSystemPromptRef.current = trimmedSystem;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }

        abortPostChecksForChat(chatId);
        streamAbortRef.current?.abort();
        streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer(STREAM_SAFETY_TIMEOUT_DEFAULT_MS);

        const streamRequestStartedAt = Date.now();
        let response = await fetch(`${engineChatBaseUrl(chatId)}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: streamController.signal,
        });

        // 5-2 stale-base auto-rebase (fast-edit robustness, 2026-07-23): a 409
        // here means another writer (client autofix, accepted server repair,
        // parallel tab) advanced the chat head after this client's last
        // refresh. Instead of failing the user's prompt with a "reload the
        // page" toast, retry ONCE with the server's latest version as explicit
        // base — pinning the base skips the gate by design (same mechanism the
        // F3/autofix overrides use). If the head moves AGAIN between retry and
        // gate, the second 409 falls through to the reload toast below.
        if (response.status === 409 && !usedEngineBaseVersionOverride) {
          const staleData = (await response
            .clone()
            .json()
            .catch(() => null)) as Record<string, unknown> | null;
          if (handleGenerationInProgress(response.status, staleData)) {
            return { status: "rejected", reason: "generation_in_progress", turnRecorded: false };
          }
          const latestVersionIdFromServer =
            staleData?.reason === "stale_base_version" &&
            typeof staleData.latestVersionId === "string"
              ? staleData.latestVersionId.trim()
              : "";
          if (latestVersionIdFromServer) {
            promptMeta.engineBaseVersionId = latestVersionIdFromServer;
            promptMeta.engineLatestKnownVersionId = latestVersionIdFromServer;
            debugLog("AI", "Stale base auto-rebase: retrying against latest version", {
              latestVersionId: latestVersionIdFromServer,
            });
            toast.message("Byggde vidare på senaste versionen", {
              description:
                "En nyare version hade hunnit skapas — din ändring appliceras på den i stället.",
            });
            mutateVersions();
            response = await fetch(`${engineChatBaseUrl(chatId)}/stream`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
              signal: streamController.signal,
            });
          }
        }

        if (!response.ok) {
          let errorData: Record<string, unknown> | null = null;
          try {
            errorData = (await response.json()) as Record<string, unknown>;
          } catch {
            // ignore
          }
          if (handleGenerationLockUnavailable(response.status, errorData)) {
            return { status: "rejected", reason: "generation_lock_unavailable", turnRecorded: false };
          }
          if (
            response.status === 412 &&
            errorData?.error === "tier3_env_not_ready" &&
            typeof errorData.parentVersionId === "string" &&
            Array.isArray(errorData.missingByIntegration)
          ) {
            dispatchF3Requirements({
              parentVersionId: errorData.parentVersionId,
              chatId,
              requestStartedAt: streamRequestStartedAt,
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
            settleRejectedTurn(
              "F3 kräver riktiga build-nycklar. Fyll i dem i kravytan och fortsätt integrationsbygget.",
            );
            return {
              status: "rejected",
              reason: "tier3_env_not_ready",
              turnRecorded: false,
            };
          }
          if (
            response.status === 409 &&
            errorData?.error === "f3_deterministic_release_required" &&
            typeof errorData.parentVersionId === "string"
          ) {
            // The nested finalize is its own gate round — its verdict
            // supersedes saves made during the ORIGINAL stream request, so
            // its 412 must carry its own start time (Bugbot on #525).
            const finalizeRequestStartedAt = Date.now();
            // The gate persists the user row only on the approve-continuation
            // path, so it reports which case this is rather than letting the
            // client guess (`f3-readiness-gate.ts`). Absent/false means the
            // optimistic bubble is a ghost, as on the "Bygg integrationer"
            // auto-kick path.
            const userTurnPersisted = errorData?.userTurnPersisted === true;
            const release = await runF3FinalizeAction({
              chatId,
              parentVersionId: errorData.parentVersionId,
            });
            // Each finalize verdict gets its own outcome (bugbot on #610): the
            // nested round is NOT uniformly "settled". Only a deterministic
            // release consumed the prompt; `missing_env` is the same situation
            // as the direct 412 above (nothing built, requirements surface
            // opened, user fills keys and retries) and `llm_ready` sends the
            // user to the preview panel — both must keep the draft.
            let content: string;
            let outcome: SendMessageOutcome;
            if (release.kind === "deterministic_release") {
              outcome = { status: "settled", as: "f3_deterministic_release" };
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
                // Restlistan R1: inget toast-larm för ett underkänt ReleaseGate.
                // Verdiktet står i chattmeddelandet ovan, och den diskreta
                // statusraden bär länken till versionsdiagnostiken — den här
                // lanen har ingen `onStatus`-callback, så den går via eventet.
                debugLog("engine", "ReleaseGate underkänd", {
                  chatId,
                  versionId: release.versionId,
                  failedChecks: release.failedChecks,
                  promoteError: release.promoteError ?? null,
                  retryable: release.retryable,
                });
                dispatchF3Status({
                  chatId,
                  versionId: release.versionId,
                  tone: release.promoteError || release.retryable ? "warning" : "error",
                  title:
                    release.promoteError || release.retryable
                      ? "ReleaseGate väntar på ett nytt försök"
                      : "ReleaseGate behöver åtgärdas",
                  description: content,
                });
              }
            } else if (release.kind === "missing_env") {
              dispatchF3Requirements({
                parentVersionId: release.parentVersionId,
                chatId,
                requestStartedAt: finalizeRequestStartedAt,
                projectId: release.projectId,
                missingByIntegration: release.missingByIntegration,
              });
              content =
                "F3 kräver riktiga build-nycklar. Fyll i dem i kravytan och försök igen.";
              toast.warning("F3 saknar obligatoriska env-värden.");
              outcome = {
                status: "rejected",
                reason: "tier3_env_not_ready",
                turnRecorded: userTurnPersisted,
              };
            } else if (release.kind === "llm_ready") {
              content =
                "F3-specen kräver nu ett vanligt integrationsbygge. Starta det igen från previewpanelen.";
              toast.warning("F3-kontrollen kunde inte slutföras.");
              outcome = {
                status: "rejected",
                reason: "f3_build_required",
                turnRecorded: userTurnPersisted,
              };
            } else {
              content = release.message;
              toast.warning("F3-kontrollen kunde inte slutföras.");
              outcome = { status: "failed", message: release.message };
            }
            // Same single rule as everywhere else: a rejection the server did
            // not write down drops the ghost row so the prompt lives only in the
            // caller's draft; anything else keeps the bubble.
            if (outcome.status === "rejected" && !outcome.turnRecorded) {
              settleRejectedTurn(content);
            } else {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content, isStreaming: false }
                    : message,
                ),
              );
            }
            return outcome;
          }
          // 5-2 stale-base gate (client half) — delad hanterare, se ovan.
          if (handleGenerationLockUnavailable(response.status, errorData)) {
            return { status: "rejected", reason: "generation_lock_unavailable", turnRecorded: false };
          }
          if (handleGenerationInProgress(response.status, errorData)) {
            return { status: "rejected", reason: "generation_in_progress", turnRecorded: false };
          }
          if (handleStaleBaseVersion(response.status, errorData)) {
            return { status: "rejected", reason: "stale_base_version", turnRecorded: false };
          }
          throw new Error(
            buildApiErrorMessage({
              response,
              errorData,
              fallbackMessage: "Failed to send message",
            }),
          );
        }

        const streamResult = await handleSseStream(
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
            applyPreviewHandoff,
            onVersionStatusRefresh,
            onGenerationComplete,
            onPreviewSessionMeta,
            mutateVersions,
            enableImageMaterialization,
            autoFixHandlerRef,
            promptAssistModel,
            promptAssistDeep,
          },
          streamController.signal,
        );
        // Byggval consumed on the answering turn — clear once a real version
        // lands so abandoned plan/contract choices cannot leak into the next
        // new chat in the same SPA session.
        if (isFirstBuildAfterGate && streamResult?.versionIdFromStream) {
          resetInitBuildChoices();
        }
        return { status: "started", via: "stream" };
      } catch (error) {
        if (isClientInitiatedAbort(error, streamController)) {
          debugLog("AI", "Streaming send aborted by client");
          return { status: "aborted", by: "client" };
        }
        if (isAbortLikeError(error)) {
          // Abort-shaped error that did NOT originate from our controller →
          // server/provider/proxy tore the stream down. Surface as a toast
          // so the user doesn't think the half-rendered output is final.
          debugLog("AI", "Streaming send aborted by server/provider");
          toast.error(
            "Strömmen avbröts av servern eller modellen. Försök igen — om det upprepas, prova en annan modell.",
          );
          return { status: "aborted", by: "server" };
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
              // PR #355-triage #20: fallbacken ska ge samma stale-base-reload-UX
              // som stream-vägen — inte ett generiskt "Failed to send message".
              if (handleGenerationLockUnavailable(fallbackRes.status, errorData)) {
                return { status: "rejected", reason: "generation_lock_unavailable", turnRecorded: false };
              }
              if (handleGenerationInProgress(fallbackRes.status, errorData)) {
                return { status: "rejected", reason: "generation_in_progress", turnRecorded: false };
              }
              if (handleStaleBaseVersion(fallbackRes.status, errorData)) {
                return { status: "rejected", reason: "stale_base_version", turnRecorded: false };
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
            const fallbackVersionId = await handleNonStreamingSend(data);
            if (isFirstBuildAfterGate && fallbackVersionId) {
              resetInitBuildChoices();
            }
            return { status: "started", via: "messages_fallback" };
          } catch (fallbackErr) {
            if (isClientInitiatedAbort(fallbackErr, fallbackController)) {
              debugLog("AI", "Streaming send fallback aborted by client");
              return { status: "aborted", by: "client" };
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
        return { status: "failed", message };
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
      applyPreviewHandoff,
      onVersionStatusRefresh,
      onDeterministicF3Settled,
      onGenerationComplete,
      onPreviewSessionMeta,
      selectedModelTier,
      buildIntent,
      setBuildIntent,
      buildMethod,
      scaffoldMode,
      scaffoldId,
      themeColors,
      paletteState,
      promptAssistModel,
      promptAssistDeep,
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
