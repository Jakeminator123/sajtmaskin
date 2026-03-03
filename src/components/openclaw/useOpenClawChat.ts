"use client";

import { useCallback, useRef } from "react";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";

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
  return window.__SITEMASKIN_CONTEXT ?? null;
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
  const { messages, isStreaming, addMessage, updateLastAssistant, setStreaming } =
    useOpenClawStore();
  const abortRef = useRef<AbortController | null>(null);

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
      addMessage(userMsg);

      const placeholderId = makeId();
      addMessage({
        id: placeholderId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });

      setStreaming(true);
      abortRef.current = new AbortController();

      const apiMessages = messages
        .concat(userMsg)
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
          updateLastAssistant(
            `Hm, jag fick ett fel (${res.status}). Forsok igen om en stund.${errText ? `\n\n${errText}` : ""}`,
          );
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        let accumulated = "";

        for await (const chunk of parseSSE(reader)) {
          accumulated += chunk;
          updateLastAssistant(accumulated);
        }

        if (!accumulated) {
          updateLastAssistant("(Inget svar fran agenten)");
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Keep whatever was already streamed
        } else {
          updateLastAssistant("Nagot gick fel. Kontrollera att Sajtagenten ar igaang.");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, addMessage, updateLastAssistant, setStreaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isStreaming, send, stop };
}
