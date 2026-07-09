'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

import { RagConfigNotice } from './rag-config-notice';

/**
 * RAG chat UI. Fully rewritable — restyle layout, avatars, message rendering,
 * autoscroll, empty state, etc. Keep the `useChat` + `DefaultChatTransport`
 * wiring pointed at `/api/chat` (the streaming protocol depends on it).
 *
 * Pass `ragConfigured={isRagConfigured()}` from a Server Component so the
 * discreet demo notice shows in the design preview / when env is missing
 * (mock: canned — the route still streams a believable demo reply). When the
 * flag is omitted the notice is hidden (assume configured).
 */
export function Chat({ ragConfigured }: { ragConfigured?: boolean }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  return (
    <div className="flex flex-col gap-4">
      {ragConfigured === false && <RagConfigNotice />}

      <div className="space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ställ en fråga så svarar assistenten utifrån vårt indexerade innehåll.
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">
              {message.role === 'user' ? 'Du' : 'Assistent'}
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
          placeholder="Fråga om vårt innehåll…"
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="rounded-md border px-4 py-2"
        >
          {status === 'streaming' ? 'Tänker…' : 'Skicka'}
        </button>
      </form>
    </div>
  );
}
