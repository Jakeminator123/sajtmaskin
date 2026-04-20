"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { defaultGroqModel, groqModels, type GroqModelId } from "@/components/lib/ai/providers";

export function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<GroqModelId>(defaultGroqModel);

  const { messages, sendMessage, status, stop, error } = useChat();
  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">AI Chat</h1>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as GroqModelId)}
          className="rounded border px-3 py-2 text-sm"
        >
          {Object.values(groqModels).map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-[300px] space-y-3 rounded border p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask a question to start the conversation.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-1">
              <div className="text-xs font-medium uppercase text-muted-foreground">{message.role}</div>
              <div className="whitespace-pre-wrap text-sm">
                {message.parts
                  ?.filter((part) => part.type === "text")
                  .map((part, index) => (
                    <span key={index}>{part.text}</span>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || isLoading) return;

          sendMessage(
            { text: input },
            {
              body: { selectedModel },
            },
          );
          setInput("");
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="min-h-32 rounded border px-3 py-2"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
          <button
            type="button"
            onClick={() => stop()}
            disabled={!isLoading}
            className="rounded border px-4 py-2 disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </form>
    </div>
  );
}
