"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { collectOpenClawTextFieldContext } from "@/lib/openclaw/text-field-actions";

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

function makeId() {
  return `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function collectContext(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const baseContext = window.__SITEMASKIN_CONTEXT ?? null;
  const textFields = collectOpenClawTextFieldContext();
  if (!baseContext && textFields.length === 0) return null;
  return {
    ...(baseContext ?? {}),
    ...(textFields.length > 0 ? { textFields } : {}),
  };
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
      if (!trimmed || isStreaming) return;

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
            context: collectContext(),
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          updateAssistantMessage(
            placeholderId,
            `Hm, jag fick ett fel (${res.status}). Forsok igen om en stund.${errText ? `\n\n${errText}` : ""}`,
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
    [isStreaming, addMessage, updateAssistantMessage, setStreaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
    setStreaming(false);
    clearMessages();
  }, [clearMessages, setStreaming]);

  return { messages, isStreaming, send, stop, clearConversation };
}
