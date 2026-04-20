# When to use

Use this dossier when the site needs a simple AI feature in a Next.js App Router app: chat, Q&A, prompt-based writing, or lightweight assistant behavior.

This is the right fit when you want:
- streaming responses from a server route
- a minimal chat UI using the AI SDK hooks
- one model provider and one route to start

Do not use this dossier by itself for:
- retrieval-augmented generation with vector databases
- multi-step agents or tool execution workflows
- provider-agnostic abstractions across many model vendors unless you plan to extend it

# How to integrate

## 1) Install dependencies

Use the AI SDK core, the React hooks package, and at least one model provider. A common default is OpenAI.

```bash
npm install ai @ai-sdk/react @ai-sdk/openai
```

## 2) Add environment variables

```env
OPENAI_API_KEY=your_api_key_here
```

Do not expose provider API keys to the browser. Keep them server-side only.

## 3) Create the App Router API route

Create `app/api/chat/route.ts`:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
  });

  return result.toDataStreamResponse();
}
```

Notes:
- `streamText` is the key primitive for streaming text responses.
- `toDataStreamResponse()` returns the format expected by the AI SDK client hooks.
- `maxDuration` is useful on serverless platforms where execution time must be declared.

## 4) Add a minimal client chat page or component

```tsx
'use client';

import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <main>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong> {message.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
```

By default, `useChat()` posts to `/api/chat`.

## 5) Add basic guardrails in the route

In production, validate the request body and set conservative model parameters.

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const body = await req.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (!messages.length) {
    return new Response('Missing messages', { status: 400 });
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    temperature: 0.7,
  });

  return result.toDataStreamResponse();
}
```

## 6) If the app needs generation, not chat

For a single prompt form, still use a server route. Accept a prompt, construct a message array server-side, and stream the response back.

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return new Response('Missing prompt', { status: 400 });
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt,
  });

  return result.toDataStreamResponse();
}
```

# UX rules

- Always show loading/streaming state while the model is responding.
- Keep the input usable and obvious; disable submit only when empty or while sending if duplicate submissions are a problem.
- Preserve message history in UI state for conversational flows.
- Render assistant output progressively when streaming is enabled.
- Show a friendly fallback when the API fails: brief error text and a retry path.
- Make it clear what the AI can do; do not imply unsupported capabilities.
- If collecting user data, show appropriate privacy copy before sending prompts to a model provider.

# Avoid

- Do not call model providers directly from client components.
- Do not include unrelated middleware from auth, i18n, analytics, or logging templates as part of this dossier.
- Do not hardcode provider secrets in source files.
- Do not assume model output is safe HTML; render as text unless you explicitly sanitize.
- Do not ship without request validation, rate limiting, and abuse controls on public-facing deployments.
- Do not overcomplicate the first version with agent frameworks if a single route and chat hook are enough.

# Verification

## Local verification

1. Set `OPENAI_API_KEY`.
2. Start the app.
3. Open the chat page.
4. Submit a prompt like `Write a one-sentence welcome message for a SaaS dashboard.`
5. Confirm:
   - the browser sends a POST request to `/api/chat`
   - the route returns a streaming response
   - the assistant message appears in the UI

## Failure-path verification

Temporarily remove the API key and confirm the app fails safely.

Expected behavior:
- the request does not succeed silently
- the UI shows an error or failure state
- no provider secret is exposed to the client

## Production-readiness checks

Before shipping, verify:
- request body validation exists
- rate limiting or auth protects expensive endpoints
- model choice and token usage match budget
- errors are logged on the server
- prompts and outputs are not stored unless the product explicitly needs that behavior
