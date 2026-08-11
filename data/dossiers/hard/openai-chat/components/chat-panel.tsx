"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

interface ChatPanelProps {
  title?: string;
  placeholder?: string;
  starterPrompts?: string[];
  className?: string;
}

function messageText(message: {
  parts?: Array<{ type: string; text?: string }>;
}): string {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export function ChatPanel({
  title = "Ask the assistant",
  placeholder = "Type a message…",
  starterPrompts = ["What can you help me with?"],
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  // Stable transport instance — recreating DefaultChatTransport every render
  // can drop in-flight streams.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat({ transport });
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className={className ?? "flex h-[600px] flex-col rounded-lg border bg-background"}>
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Try:</p>
            <ul className="space-y-1">
              {starterPrompts.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => sendMessage({ text: prompt })}
                    className="text-left text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-8 rounded-md bg-primary/10 px-3 py-2 text-sm"
                : "mr-8 rounded-md bg-muted px-3 py-2 text-sm"
            }
          >
            <span className="block text-xs font-medium opacity-60">
              {message.role === "user" ? "You" : "Assistant"}
            </span>
            <p className="whitespace-pre-wrap">{messageText(message)}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text || isStreaming) return;
          sendMessage({ text });
          setInput("");
        }}
        className="flex gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={() => stop()}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
