"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/builder/types";

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

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

function collectSiteContext(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  return window.__SITEMASKIN_CONTEXT ?? null;
}

async function streamOpenClawToMessages(
  res: Response,
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  if (!res.ok || !res.body) {
    const friendly =
      res.status === 503
        ? "Sajtagenten är inte aktiverad just nu. Skriv istället vad du vill ändra i chatten nedan."
        : res.status === 404
          ? "Sajtagenten är inte tillgänglig just nu. Skriv vad du vill ändra i chatten nedan."
          : `Kunde inte nå Sajtagenten (${res.status}). Försök igen.`;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: friendly, isStreaming: false }
          : m,
      ),
    );
    return "";
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

  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? { ...m, content: accumulated || "(Inget svar från Sajtagenten)", isStreaming: false }
        : m,
    ),
  );
  return accumulated;
}

export function useBuilderHelpChat() {
  const [isHelpStreaming, setIsHelpStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendHelpMessage = useCallback(
    async (
      text: string,
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
      currentMessages?: ChatMessage[],
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

      const helpHistory = (currentMessages ?? [])
        .filter((m) => m.isHelpMessage && !m.isStreaming && m.content)
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4_000) }));

      try {
        const res = await fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...helpHistory, { role: "user", content: trimmed }],
            context: collectSiteContext(),
          }),
          signal: abortRef.current.signal,
        });
        await streamOpenClawToMessages(res, assistantId, setMessages);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Något gick fel med Sajtagenten. Försök igen.", isStreaming: false }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
          );
        }
      } finally {
        setIsHelpStreaming(false);
        abortRef.current = null;
      }
    },
    [isHelpStreaming],
  );

  const sendCoachMessage = useCallback(
    async (
      text: string,
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
      options?: { silent?: boolean },
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isHelpStreaming) return;

      if (!options?.silent) {
        const userMsg: ChatMessage = {
          id: makeHelpId(),
          role: "user",
          content: trimmed,
          isHelpMessage: true,
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      const assistantId = makeHelpId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        isHelpMessage: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsHelpStreaming(true);
      abortRef.current = new AbortController();

      const context = collectSiteContext();

      try {
        const res = await fetch("/api/openclaw/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: trimmed }],
            context,
          }),
          signal: abortRef.current.signal,
        });
        const result = await streamOpenClawToMessages(res, assistantId, setMessages);
        return result;
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Något gick fel med Sajtagenten. Försök igen.", isStreaming: false }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
          );
        }
        return undefined;
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

  return { isHelpStreaming, sendHelpMessage, sendCoachMessage, cancelHelp };
}
