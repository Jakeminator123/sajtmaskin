"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { ModelID } from "@/components/ai/providers";

const modelOptions: ModelID[] = ["grok-2-1212", "grok-2-vision-1212", "grok-beta"];

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelID>("grok-2-1212");

  const { messages, sendMessage, status, stop } = useChat();
  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">AI Chat</h1>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as ModelID)}
          className="rounded border px-3 py-2 text-sm"
        >
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-[320px] rounded border p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Start a conversation.</p>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">{message.role}</div>
                <div className="text-sm whitespace-pre-wrap">
                  {message.parts
                    ?.filter((part) => part.type === "text")
                    .map((part, index) => (
                      <span key={index}>{part.text}</span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || isLoading) return;

          sendMessage(
            { text: input },
            { body: { selectedModel } },
          );
          setInput("");
        }}
        className="flex flex-col gap-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          className="min-h-24 rounded border p-3"
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="rounded border px-4 py-2"
            >
              Stop
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
