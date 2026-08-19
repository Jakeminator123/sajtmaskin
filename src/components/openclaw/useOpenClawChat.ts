"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  readActiveOpenClawPowerIds,
  readOpenClawPowers,
  useOpenClawStore,
  type OpenClawMessage,
} from "@/lib/openclaw/openclaw-store";
import { collectOpenClawClientContext } from "@/lib/openclaw/client-context";
import {
  parseGatewayStream,
  type GatewayErrorDescription,
} from "@/lib/openclaw/gateway-response";
import {
  createArmedMandate,
  parseArmingDirective,
  parseStopDirective,
} from "@/lib/openclaw/debug/armed-mandate";
import { readActiveBuilderTarget } from "@/lib/openclaw/builder-target";
import { normalizeOpenClawClientMessages } from "@/lib/openclaw/message-validation";

function makeId() {
  return `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface OpenClawSendOptions {
  /**
   * Whether this turn may arm or disarm autonomy. Only a message the user
   * actually typed carries that consent — the machine-generated continuation
   * turn passes `false` so a mandate can never renew itself into a loop.
   * Defaults to true.
   */
  allowArming?: boolean;
}

export function useOpenClawChat() {
  const {
    messages,
    isStreaming,
    addMessage,
    updateAssistantMessage,
    clearMessages,
    setStreaming,
    scopeKey,
    setArmedMandate,
  } = useOpenClawStore();
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
  }, [scopeKey]);

  const send = useCallback(
    async (text: string, options?: OpenClawSendOptions) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Read the live values rather than the render-time ones: the continuation
      // loop calls `send` from a timer, and a closure that has not caught up
      // with the store would drop that turn silently. The powers follow the
      // same rule for a sharper reason — a grant the user withdrew a moment ago
      // must not ride along on a turn that is only now being sent.
      const streaming = useOpenClawStore.getState().isStreaming;
      const powers = readOpenClawPowers();

      // Armed autonomy (Mode A): the user's own message is the consent. A stop
      // directive disarms IMMEDIATELY — handled before the streaming guard so
      // the user can cancel an in-flight autonomous run by typing "stopp" even
      // while OpenClaw is still responding. An arming directive creates a
      // bounded mandate. Without BOTH gates — OC_EDIT and the granted power —
      // this never arms.
      if (powers.armedAutonomy && options?.allowArming !== false) {
        if (parseStopDirective(trimmed)) {
          setArmedMandate(null);
        } else if (!streaming) {
          const directive = parseArmingDirective(trimmed);
          if (directive) setArmedMandate(createArmedMandate(directive));
        }
      }

      if (streaming) return;

      const userMsg: OpenClawMessage = {
        id: makeId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      const currentMessages = useOpenClawStore.getState().messages;
      const nextConversation = [...currentMessages, userMsg];
      addMessage(userMsg);

      const placeholderId = makeId();
      addMessage({
        id: placeholderId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        // Bind svaret till builder-målet som gäller NÄR turen skickas — samma
        // kontext som `collectOpenClawClientContext()` ger modellen. Quick-
        // edit-kortet använder detta så ett förslag appliceras mot versionen
        // modellen såg, inte mot vad som råkar vara aktivt vid godkännandet.
        builderTarget: readActiveBuilderTarget(),
      });
      activeAssistantIdRef.current = placeholderId;

      setStreaming(true);
      abortRef.current = new AbortController();

      const apiMessages = normalizeOpenClawClientMessages(
        nextConversation.map((m) => ({ role: m.role, content: m.content })),
      );

      try {
        const res = await fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: collectOpenClawClientContext(),
            // Which extra powers the user granted for THIS turn. The server ANDs
            // the list with its own OC_EDIT, so it can only narrow the edit
            // instructions — never unlock anything the deployment forbids.
            powers: readActiveOpenClawPowerIds(),
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
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
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        let accumulated = "";
        let gatewayError: GatewayErrorDescription | null = null;

        for await (const event of parseGatewayStream(reader)) {
          if (event.type === "error") {
            gatewayError = event.description;
            break;
          }
          accumulated += event.text;
          updateAssistantMessage(placeholderId, accumulated);
        }

        // The gateway answers 200 with a valid stream even when every model in
        // the fallback chain failed, so the reason lives in an error chunk
        // rather than in the HTTP status. Show the classified message —
        // otherwise a provider quota wall is indistinguishable from a silent
        // model. Only `message` is safe here; `detail` names internal models
        // and subscriptions.
        if (gatewayError) {
          updateAssistantMessage(
            placeholderId,
            accumulated
              ? `${accumulated}\n\n${gatewayError.message}`
              : gatewayError.message,
          );
        } else if (!accumulated) {
          updateAssistantMessage(placeholderId, "(Inget svar fran agenten)");
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Keep whatever was already streamed
        } else {
          updateAssistantMessage(placeholderId, "Nagot gick fel. Kontrollera att Sajtagenten ar igaang.");
        }
      } finally {
        setStreaming(false);
        if (activeAssistantIdRef.current === placeholderId) {
          activeAssistantIdRef.current = null;
        }
        abortRef.current = null;
      }
    },
    [addMessage, updateAssistantMessage, setStreaming, setArmedMandate],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Stop also disarms (Codex P2): clicking stop must cancel armed autonomy so
    // the next assistant action can't keep auto-sending under the old mandate —
    // mirroring the typed "stopp" path above.
    setArmedMandate(null);
  }, [setArmedMandate]);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
    setStreaming(false);
    clearMessages();
    // Clearing the conversation must also disarm autonomy (Bugbot): an armed
    // mandate that survived a reset could let a later assistant action auto-send
    // when the user believed autonomy was cleared.
    setArmedMandate(null);
  }, [clearMessages, setStreaming, setArmedMandate]);

  return { messages, isStreaming, send, stop, clearConversation };
}
