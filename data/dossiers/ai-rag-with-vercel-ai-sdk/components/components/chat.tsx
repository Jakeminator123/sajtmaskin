'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat'
    })
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">
              {message.role}
            </div>
            <div className="whitespace-pre-wrap">
              {message.parts
                ?.filter((part) => part.type === 'text')
                .map((part, index) => (
                  <span key={index}>{part.text}</span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your content..."
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="rounded-md border px-4 py-2"
        >
          {status === 'streaming' ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
