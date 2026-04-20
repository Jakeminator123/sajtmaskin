"use client";

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ToolResult } from './tool-result';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-4">
        {messages.map((message) => (
          <div key={message.id} className="rounded-lg border p-4">
            <div className="mb-2 text-xs uppercase text-muted-foreground">
              {message.role}
            </div>

            <div className="flex flex-col gap-3">
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return (
                    <div key={index} className="whitespace-pre-wrap text-sm">
                      {part.text}
                    </div>
                  );
                }

                if (part.type === 'tool-invocation') {
                  return <ToolResult key={index} part={part} />;
                }

                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something that may require tools..."
        />
        <button
          type="submit"
          disabled={status === 'streaming' || !input.trim()}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}
