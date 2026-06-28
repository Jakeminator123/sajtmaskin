"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { collectOpenClawClientContext } from "@/lib/openclaw/client-context";
import {
  createArmedMandate,
  parseArmingDirective,
  parseStopDirective,
} from "@/lib/openclaw/debug/armed-mandate";

function makeId() {
  return `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse SSE chunks from an OpenAI-compatible streaming response.
 * Yields content delta strings.
 */
async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string") yield delta;
      } catch {
        // skip malformed chunks
      }
    }
  }
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
    debugEnabled,
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Debug-mode armed autonomy (Mode A): the user's own message is the
      // consent. A stop directive disarms IMMEDIATELY — handled before the
      // streaming guard so the user can cancel an in-flight autonomous run by
      // typing "stopp" even while OpenClaw is still responding. An arming
      // directive creates a bounded mandate. Outside OC_DEBUG this never arms.
      if (debugEnabled) {
        if (parseStopDirective(trimmed)) {
          setArmedMandate(null);
        } else if (!isStreaming) {
          const directive = parseArmingDirective(trimmed);
          if (directive) setArmedMandate(createArmedMandate(directive));
        }
      }

      if (isStreaming) return;

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
      });
      activeAssistantIdRef.current = placeholderId;

      setStreaming(true);
      abortRef.current = new AbortController();

      const apiMessages = nextConversation
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: collectOpenClawClientContext(),
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

        for await (const chunk of parseSSE(reader)) {
          accumulated += chunk;
          updateAssistantMessage(placeholderId, accumulated);
        }

        if (!accumulated) {
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
    [isStreaming, addMessage, updateAssistantMessage, setStreaming, debugEnabled, setArmedMandate],
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
