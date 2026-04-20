"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { defaultModel, modelIds, type modelID } from "@/ai/providers";

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<modelID>(defaultModel);

  const { messages, sendMessage, status, stop } = useChat({
    api: "/api/chat",
    onError: (error) => {
      console.error(error);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="model" className="text-sm font-medium">
          Model
        </label>
        <select
          id="model"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as modelID)}
          className="rounded border px-2 py-1 text-sm"
          disabled={isLoading}
        >
          {modelIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-[300px] space-y-4 rounded border p-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            <div className="text-xs uppercase text-gray-500">{message.role}</div>
            <div className="whitespace-pre-wrap text-sm">
              {message.parts
                ?.filter((part) => part.type === "text")
                .map((part, index) => (
                  <span key={index}>{part.text}</span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (!text || isLoading) return;
          sendMessage({ text }, { body: { selectedModel } });
          setInput("");
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          className="min-h-32 rounded border p-3"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || input.trim().length === 0}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Send
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
