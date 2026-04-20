"use client";

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Message } from './message';
import { ModelSelector } from './model-selector';
import { useScrollToBottom } from './use-scroll-to-bottom';

export function Chat() {
  const [model, setModel] = useState('openai/gpt-4o-mini');
  const [containerRef, endRef] = useScrollToBottom<HTMLDivElement>();

  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { model },
    }),
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="border-b p-4">
        <ModelSelector value={model} onChange={setModel} />
      </div>

      <div ref={containerRef} className="flex min-h-[400px] flex-1 flex-col gap-6 p-4">
        {messages.map((message) => (
          <Message
            key={message.id}
            role={message.role}
            content={message.parts
              ?.filter((part) => part.type === 'text')
              .map((part) => ('text' in part ? part.text : ''))
              .join('\n') ?? ''}
          />
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="rounded-md border px-4 py-2"
        >
          Send
        </button>
      </form>
    </div>
  );
}
