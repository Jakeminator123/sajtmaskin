"use client";

import { FormEvent, useState, useTransition } from "react";
import { useActions, useUIState } from "ai/rsc";
import { Message } from "@/components/components/message";
import type { AI } from "@/components/lib/ai";

export function Chat() {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;

    setInput("");

    startTransition(async () => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          display: <Message role="user" content={value} />,
        },
      ]);

      const response = await submitUserMessage(value);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          display: response,
        },
      ]);
    });
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="flex min-h-[320px] flex-col gap-4 rounded-xl border p-4">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Ask a question to start the conversation.
          </div>
        ) : (
          messages.map((message) => <div key={message.id}>{message.display}</div>)
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          {isPending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
