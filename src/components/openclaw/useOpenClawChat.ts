"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  readActiveOpenClawPowerIds,
  readOpenClawPowers,
  revokeOpenClawBuildConsent,
  useOpenClawStore,
  type OpenClawMessage,
} from "@/lib/openclaw/openclaw-store";
import {
  KOSTNADSFRI_ADVICE_EXHAUSTED_COPY,
  shouldEnforceCampaignAdviceQuota,
  shouldRecordCampaignFollowupInScope,
} from "@/lib/kostnadsfri/agent-campaign-script";
import { collectOpenClawClientContext } from "@/lib/openclaw/client-context";
import {
  consumeGatewayStream,
  logOpenClawChatStreamEnd,
  OPENCLAW_DISPATCH_HEADER,
  OPENCLAW_DISPATCH_NOT_STARTED,
  OPENCLAW_DISPATCH_STARTED,
  OPENCLAW_EMPTY_REPLY_COPY,
  type GatewayErrorDescription,
  type OpenClawDispatchOutcome,
} from "@/lib/openclaw/gateway-response";
import {
  createArmedMandate,
  parseArmingDirective,
  parseStopDirective,
} from "@/lib/openclaw/debug/armed-mandate";
import {
  buildArmedHandshakePrompt,
  decideArmedHandshakeWake,
  hasArmedHandshakeWoken,
  releaseArmedHandshakeWake,
  reserveArmedHandshakeWake,
  settleArmedHandshakeWake,
} from "@/lib/openclaw/debug/armed-continuation";
import { parseOpenClawMessage } from "@/lib/openclaw/text-field-actions";
import {
  readActiveBuilderTarget,
  readBuilderAnchor,
  readBuilderAnchorIndex,
} from "@/lib/openclaw/builder-target";
import { normalizeOpenClawClientMessages } from "@/lib/openclaw/message-validation";
import { composerAllowsAgentBuild, hasScopedComposerChangeRestriction, isReadOnlyComposerRequest } from "@/lib/builder/composer-route";
import type { AgentProposalReference } from "@/lib/builder/composer-route-reference";

function makeId() {
  return `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface OpenClawSendOptions {
  /** Trusted local composer intent. Missing metadata never authorizes start_build. */
  allowBuild?: boolean;
  /** Explicit Fråga/no-change cancels older pending automatic work too. */
  restrictBuild?: boolean;
  /** Existing advice selected by the user, bound to its original chat/version. */
  proposalReference?: AgentProposalReference;
  /** Positive transport acceptance, independent of the eventual model reply. */
  onDispatchAccepted?: () => void;
  /**
   * Whether this turn may arm or disarm autonomy. Only a message the user
   * actually typed carries that consent — the machine-generated continuation
   * turn passes `false` so a mandate can never renew itself into a loop.
   * Defaults to true.
   */
  allowArming?: boolean;
  /**
   * Whether a successful campaign-advice turn burns one of the five client-side
   * rounds. Armed continuation wake-ups pass `false` so a machine resume cannot
   * spend the invited customer's quota. Defaults to true.
   */
  countTowardCampaignQuota?: boolean;
  /**
   * Machine-generated turn (continuation, handshake wake, post-build digest).
   * The model still receives it as a user turn, but the chat renders it as a
   * status row instead of a user bubble (`agent-message-kind.ts`).
   */
  internal?: boolean;
  /** Internal receipt for the armed-handshake reservation. */
  onDispatchOutcome?: (outcome: OpenClawDispatchOutcome) => void;
  /** A stable snapshot after this turn finishes or is cancelled, before another
   * turn can change the store. Also called for nested handshake turns. */
  onConversationSettled?: (messages: readonly OpenClawMessage[]) => void;
}

interface ActiveTurn {
  scopeKey: string;
  assistantId: string;
  controller: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  onSettled?: OpenClawSendOptions["onConversationSettled"];
}

export function useOpenClawChat() {
  const {
    messages,
    isStreaming,
    addMessage,
    updateAssistantMessage,
    setAssistantDelivery,
    clearMessages,
    setStreaming,
    setArmedMandate,
    consumeCampaignAdviceRound,
  } = useOpenClawStore();
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const sendRef = useRef<
    ((text: string, options?: OpenClawSendOptions) => Promise<void>) | null
  >(null);

  const cancelActiveTurn = useCallback(
    (previousMessages?: readonly OpenClawMessage[]) => {
      const turn = activeTurnRef.current;
      if (!turn) return;
      // Release ownership before aborting: the old promise may settle after a
      // new send has already acquired the composer, even within the same scope.
      activeTurnRef.current = null;
      turn.controller.abort();
      void turn.reader?.cancel().catch(() => undefined);
      const state = useOpenClawStore.getState();
      if (state.scopeKey === turn.scopeKey)
        setAssistantDelivery(turn.assistantId, "interrupted");
      const snapshot = previousMessages
        ? previousMessages.map((message) =>
            message.id === turn.assistantId
              ? { ...message, delivery: "interrupted" as const }
              : message,
          )
        : state.scopeKey === turn.scopeKey
          ? useOpenClawStore.getState().messages
          : null;
      if (snapshot) turn.onSettled?.(snapshot);
      if (useOpenClawStore.getState().scopeKey === turn.scopeKey)
        setStreaming(false);
    },
    [setStreaming, setAssistantDelivery],
  );

  useEffect(() => {
    // Observe scope changes synchronously. A render effect for the old scope
    // could otherwise run after a new send and abort that new request instead.
    const unsubscribe = useOpenClawStore.subscribe((state, previous) => {
      if (state.scopeKey !== previous.scopeKey)
        cancelActiveTurn(previous.messages);
    });
    return () => {
      unsubscribe();
      cancelActiveTurn();
    };
  }, [cancelActiveTurn]);

  const send = useCallback(
    async (text: string, options?: OpenClawSendOptions) => {
      let dispatchOutcome: OpenClawDispatchOutcome = "not-started";
      let dispatchOutcomeReported = false;
      const reportDispatchOutcome = () => {
        if (dispatchOutcomeReported) return;
        dispatchOutcomeReported = true;
        options?.onDispatchOutcome?.(dispatchOutcome);
      };
      const trimmed = text.trim();
      if (!trimmed) {
        reportDispatchOutcome();
        return;
      }

      const buildRestricted = !options?.internal &&
        (options?.restrictBuild === true || isReadOnlyComposerRequest(trimmed));
      if (!options?.internal && (buildRestricted || hasScopedComposerChangeRestriction(trimmed))) {
        revokeOpenClawBuildConsent();
      }

      // Read the live values rather than the render-time ones: the continuation
      // loop calls `send` from a timer, and a closure that has not caught up
      // with the store would drop that turn silently. The powers follow the
      // same rule for a sharper reason — a grant the user withdrew a moment ago
      // must not ride along on a turn that is only now being sent.
      const streaming = useOpenClawStore.getState().isStreaming;
      const powers = readOpenClawPowers();
      const armingDirective = !options?.internal && options?.allowArming !== false && !buildRestricted
        ? parseArmingDirective(trimmed) : null;
      const explicitFollowupOrder = powers.armedAutonomy && armingDirective?.mode === "followups" &&
        /^(?:gör|gora|kör|kor|skapa|starta|påbörja|utför|generera|do|run|create|start|launch)(?:\s|$)/iu.test(trimmed);

      // Armed autonomy (Mode A): the user's own message is the consent. A stop
      // directive disarms IMMEDIATELY — handled before the streaming guard so
      // the user can cancel an in-flight autonomous run by typing "stopp" even
      // while OpenClaw is still responding. An arming directive creates a
      // bounded mandate. Without BOTH gates — OC_EDIT and the granted power —
      // this never arms.
      if (powers.armedAutonomy && options?.allowArming !== false && !buildRestricted) {
        if (parseStopDirective(trimmed)) {
          setArmedMandate(null);
        } else if (!streaming) {
          if (armingDirective && (armingDirective.mode === "review_next" || explicitFollowupOrder)) {
            setArmedMandate(createArmedMandate(armingDirective));
          }
        }
      }

      if (streaming) {
        reportDispatchOutcome();
        return;
      }

      const clientContext = collectOpenClawClientContext();
      const campaignScript = useOpenClawStore.getState().campaignScript;
      const shouldChargeQuota =
        options?.countTowardCampaignQuota !== false &&
        shouldEnforceCampaignAdviceQuota(clientContext, campaignScript);
      if (shouldChargeQuota && (campaignScript?.remaining ?? 0) <= 0) {
        addMessage({
          id: makeId(),
          role: "user",
          content: trimmed,
          timestamp: Date.now(),
        });
        addMessage({
          id: makeId(),
          role: "assistant",
          content: KOSTNADSFRI_ADVICE_EXHAUSTED_COPY,
          timestamp: Date.now(),
        });
        options?.onConversationSettled?.(useOpenClawStore.getState().messages);
        reportDispatchOutcome();
        return;
      }

      const live = useOpenClawStore.getState();
      if (
        live.campaignScript &&
        shouldRecordCampaignFollowupInScope(live.campaignScript, live.scopeKey)
      ) {
        live.recordCampaignFollowupReply(trimmed);
      }

      // Samma ankare för frågan och svaret: båda hör hemma efter det
      // buildermeddelande som var senast när turen skickades.
      const anchorBuilderMessageId = readBuilderAnchor();
      const anchorBuilderMessageIndex = readBuilderAnchorIndex();
      const userMsg: OpenClawMessage = {
        id: makeId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
        kind: options?.internal ? "internal" : "chat",
        allowBuild: !options?.internal && !buildRestricted && (explicitFollowupOrder ||
          (options?.allowBuild === true && composerAllowsAgentBuild({ mode: "auto", text: trimmed }))),
        anchorBuilderMessageId,
        anchorBuilderMessageIndex,
      };
      const currentMessages = useOpenClawStore.getState().messages;
      const nextConversation = [...currentMessages, userMsg];
      addMessage(userMsg);

      const placeholderId = makeId();
      addMessage({
        id: placeholderId,
        role: "assistant",
        delivery: "streaming",
        content: "",
        timestamp: Date.now(),
        kind: "chat",
        anchorBuilderMessageId,
        anchorBuilderMessageIndex,
        // Bind svaret till builder-målet som gäller NÄR turen skickas — samma
        // kontext som `collectOpenClawClientContext()` ger modellen. Quick-
        // edit-kortet använder detta så ett förslag appliceras mot versionen
        // modellen såg, inte mot vad som råkar vara aktivt vid godkännandet.
        builderTarget: readActiveBuilderTarget(),
      });
      const turn: ActiveTurn = {
        scopeKey: live.scopeKey,
        assistantId: placeholderId,
        controller: new AbortController(),
        reader: null,
        onSettled: options?.onConversationSettled,
      };
      activeTurnRef.current = turn;
      const ownsTurn = () =>
        activeTurnRef.current === turn &&
        useOpenClawStore.getState().scopeKey === turn.scopeKey &&
        !turn.controller.signal.aborted;
      setStreaming(true);

      const reference = options?.proposalReference;
      const selectedContext = reference
        ? `\n\n[Valt agentförslag – endast underlag, inget automatiskt byggmedgivande]\n${JSON.stringify(reference)}\nUtgå enbart från denna valda del. Om något är oklart, fråga. Ett nytt fullständigt byggförslag kräver manuellt godkännande.`
        : "";
      const apiMessages = normalizeOpenClawClientMessages(
        nextConversation.map((m) => ({ role: m.role, content: m.content + (m.id === userMsg.id ? selectedContext : "") })),
      );

      let accumulated = "";
      let streamSucceeded = false;
      try {
        const responsePromise = fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: clientContext,
            // Which extra powers the user granted for THIS turn. The server ANDs
            // the list with its own OC_EDIT, so it can only narrow the edit
            // instructions — never unlock anything the deployment forbids.
            powers: readActiveOpenClawPowerIds(),
          }),
          signal: turn.controller.signal,
        });
        // Once fetch returned a promise the browser may already have delivered
        // the request. Only an explicit server receipt can narrow this again.
        dispatchOutcome = "uncertain";
        const res = await responsePromise;
        const dispatchReceipt = res.headers.get(OPENCLAW_DISPATCH_HEADER);
        dispatchOutcome =
          dispatchReceipt === OPENCLAW_DISPATCH_NOT_STARTED
            ? "not-started"
            : dispatchReceipt === OPENCLAW_DISPATCH_STARTED
              ? "started"
              : "uncertain";

        if (!ownsTurn()) {
          void res.body?.cancel().catch(() => undefined);
          return;
        }

        if (res.ok && res.body && dispatchOutcome !== "not-started") options?.onDispatchAccepted?.();

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          if (!ownsTurn()) return;
          const ctype = res.headers.get("content-type") ?? "";
          const looksLikeHtml =
            ctype.includes("text/html") ||
            errText.trimStart().startsWith("<!DOCTYPE") ||
            errText.trimStart().startsWith("<html");
          let detail = "";
          if (errText && !looksLikeHtml) {
            try {
              const parsed = JSON.parse(errText);
              const candidate =
                (typeof parsed?.error === "string" && parsed.error) ||
                (typeof parsed?.detail === "string" && parsed.detail) ||
                (typeof parsed?.message === "string" && parsed.message) ||
                "";
              detail = candidate.slice(0, 280);
            } catch {
              detail = errText.replace(/\s+/g, " ").trim().slice(0, 280);
            }
          }
          const friendly =
            res.status === 404
              ? "Sajtagent-tjansten svarar inte just nu (404). Kontrollera att dev-servern och OpenClaw-gatewayen ar igang."
              : res.status === 503
                ? "Sajtagenten ar tillfalligt avstangd (503)."
                : res.status >= 500
                  ? `Sajtagenten kunde inte svara (${res.status}). Forsok igen om en stund.`
                  : `Hm, jag fick ett fel (${res.status}). Forsok igen om en stund.`;
          updateAssistantMessage(
            placeholderId,
            detail ? `${friendly}\n\n${detail}` : friendly,
          );
          return;
        }

        const reader = res.body.getReader();
        turn.reader = reader;
        const streamError: { current: GatewayErrorDescription | null } = {
          current: null,
        };

        const streamSummary = await consumeGatewayStream(reader, (event) => {
          if (!ownsTurn()) return;
          if (event.type === "error") {
            streamError.current = event.description;
            return;
          }
          accumulated += event.text;
          updateAssistantMessage(placeholderId, accumulated);
        });
        if (!ownsTurn()) return;
        const gatewayError = streamError.current;

        // The gateway answers 200 with a valid stream even when every model in
        // the fallback chain failed, so the reason lives in an error chunk
        // rather than in the HTTP status. Show the classified message —
        // otherwise a provider quota wall is indistinguishable from a silent
        // model. Only `message` is safe here; `detail` names internal models
        // and subscriptions.
        if (gatewayError) {
          const hasIncompleteAction =
            parseOpenClawMessage(accumulated).hasIncompleteAction;
          updateAssistantMessage(
            placeholderId,
            hasIncompleteAction
              ? `${gatewayError.message}\n\n${accumulated}`
              : accumulated
                ? `${accumulated}\n\n${gatewayError.message}`
                : gatewayError.message,
          );
        } else if (!accumulated) {
          // Keep the fallback out of `accumulated`. A1's handshake wake
          // keys on a hunt-only reply; an empty or truncated stream must
          // not look like one and start a wake loop.
          updateAssistantMessage(placeholderId, OPENCLAW_EMPTY_REPLY_COPY);
        } else {
          streamSucceeded = true;
        }

        const parsedEnd = parseOpenClawMessage(accumulated);
        logOpenClawChatStreamEnd({
          accumulatedChars: accumulated.length,
          visibleChars: parsedEnd.visibleContent.length,
          hasIncompleteAction: parsedEnd.hasIncompleteAction,
          leftoverChars: streamSummary.leftoverChars,
          ended: streamSummary.ended,
          sawDone: streamSummary.sawDoneMarker,
          aborted: false,
          contentForms: streamSummary.contentForms,
          errorKind: gatewayError?.kind ?? streamSummary.errorKind,
        });

        // Charge only after a stream that produced visible assistant text.
        // HTTP errors, abort, empty streams, error envelopes and a truncated
        // action-only body must not burn a campaign round.
        if (
          shouldChargeQuota &&
          streamSucceeded &&
          parsedEnd.visibleContent.length > 0
        ) {
          consumeCampaignAdviceRound();
        }
      } catch (e) {
        const aborted =
          turn.controller.signal.aborted ||
          (e instanceof DOMException && e.name === "AbortError");
        if (aborted) {
          // Keep whatever was already streamed
        } else if (ownsTurn()) {
          updateAssistantMessage(
            placeholderId,
            "Nagot gick fel. Kontrollera att Sajtagenten ar igaang.",
          );
        }
        const parsedEnd = parseOpenClawMessage(accumulated);
        logOpenClawChatStreamEnd({
          accumulatedChars: accumulated.length,
          visibleChars: parsedEnd.visibleContent.length,
          hasIncompleteAction: parsedEnd.hasIncompleteAction,
          leftoverChars: 0,
          ended: false,
          sawDone: false,
          aborted,
          contentForms: [],
          errorKind: null,
        });
      } finally {
        if (ownsTurn()) {
          activeTurnRef.current = null;
          setAssistantDelivery(
            placeholderId,
            streamSucceeded ? "complete" : "interrupted",
          );
          turn.onSettled?.(useOpenClawStore.getState().messages);
          setStreaming(false);
        }
        // The parser may finish at [DONE] before the HTTP body closes.
        void turn.reader?.cancel().catch(() => undefined);
        reportDispatchOutcome();
      }

      // Path (b): a confirmation-only `start_bug_hunt` never sends or watches.
      // Wake once with `allowArming: false` so the first fill can be authored.
      // The wake must not create, renew or extend the mandate.
      if (
        accumulated &&
        !turn.controller.signal.aborted &&
        useOpenClawStore.getState().scopeKey === turn.scopeKey
      ) {
        const liveAfter = useOpenClawStore.getState();
        const mandate = liveAfter.armedMandate;
        const parsed = parseOpenClawMessage(accumulated);
        const decision = decideArmedHandshakeWake({
          actionType: parsed.action?.type ?? null,
          mandate,
          editEnabled: readOpenClawPowers().armedAutonomy,
          alreadyWoken: mandate
            ? hasArmedHandshakeWoken(mandate.createdAt)
            : false,
          openClawStreaming: liveAfter.isStreaming,
          streamSucceeded,
        });
        if (decision.kind === "wake" && mandate) {
          const reservation = reserveArmedHandshakeWake(mandate.createdAt);
          const nestedSend = sendRef.current;
          if (reservation && nestedSend) {
            let receiptReported = false;
            try {
              await nestedSend(
                buildArmedHandshakePrompt({ remaining: mandate.remaining }),
                {
                  allowArming: false,
                  countTowardCampaignQuota: false,
                  internal: true,
                  onConversationSettled: options?.onConversationSettled,
                  onDispatchOutcome: (outcome) => {
                    receiptReported = true;
                    if (outcome === "not-started") {
                      releaseArmedHandshakeWake(reservation);
                    } else {
                      settleArmedHandshakeWake(reservation);
                    }
                  },
                },
              );
            } finally {
              // No receipt means an exceptional/unknown path, never safe retry.
              if (!receiptReported) settleArmedHandshakeWake(reservation);
            }
          } else if (reservation) {
            releaseArmedHandshakeWake(reservation);
          }
        }
      }
    },
    [
      addMessage,
      updateAssistantMessage,
      setAssistantDelivery,
      setStreaming,
      setArmedMandate,
      consumeCampaignAdviceRound,
    ],
  );
  sendRef.current = send;

  const stop = useCallback(() => {
    cancelActiveTurn();
    // Stop also disarms (Codex P2): clicking stop must cancel armed autonomy so
    // the next assistant action can't keep auto-sending under the old mandate —
    // mirroring the typed "stopp" path above.
    setArmedMandate(null);
  }, [cancelActiveTurn, setArmedMandate]);

  const clearConversation = useCallback(() => {
    cancelActiveTurn();
    clearMessages();
    // Clearing the conversation must also disarm autonomy (Bugbot): an armed
    // mandate that survived a reset could let a later assistant action auto-send
    // when the user believed autonomy was cleared.
    setArmedMandate(null);
  }, [cancelActiveTurn, clearMessages, setArmedMandate]);

  return { messages, isStreaming, send, stop, clearConversation };
}
