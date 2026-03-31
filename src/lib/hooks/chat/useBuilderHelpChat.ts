"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/builder/types";

function makeHelpId() {
  return `help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function useBuilderHelpChat() {
  const [isHelpStreaming, setIsHelpStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendHelpMessage = useCallback(
    async (
      text: string,
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isHelpStreaming) return;

      const userMsg: ChatMessage = {
        id: makeHelpId(),
        role: "user",
        content: trimmed,
        isHelpMessage: true,
      };

      const assistantId = makeHelpId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        isHelpMessage: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsHelpStreaming(true);
      abortRef.current = new AbortController();

      const apiMessages = [{ role: "user" as const, content: trimmed }];

      try {
        const res = await fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, context: null }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `Kunde inte nå Sajtagenten (${res.status}). Försök igen.`,
                    isStreaming: false,
                  }
                : m,
            ),
          );
          return;
        }

        const reader = res.body.getReader();
        let accumulated = "";

        for await (const chunk of parseSSE(reader)) {
          accumulated += chunk;
          const snapshot = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: snapshot } : m,
            ),
          );
        }

        if (!accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "(Inget svar från Sajtagenten)", isStreaming: false }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m,
            ),
          );
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "Något gick fel med Sajtagenten. Försök igen.",
                    isStreaming: false,
                  }
                : m,
            ),
          );
        }
      } finally {
        setIsHelpStreaming(false);
        abortRef.current = null;
      }
    },
    [isHelpStreaming],
  );

  const cancelHelp = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { isHelpStreaming, sendHelpMessage, cancelHelp };
}
