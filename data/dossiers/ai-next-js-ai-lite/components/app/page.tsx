'use client';

import { useChat } from '@ai-sdk/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>AI Chat</h1>

      <div style={{ display: 'grid', gap: 12, marginTop: 24, marginBottom: 24 }}>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          name="prompt"
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something..."
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
