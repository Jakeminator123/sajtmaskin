# When to use

Use this dossier when you want a Next.js app to:

- call multiple LLM providers through **Vercel AI Gateway** instead of wiring each provider SDK directly
- stream chat responses with the **AI SDK**
- expose only a curated set of models to the frontend
- keep gateway credentials on the server

This is a backend-focused integration. It gives you the API routes and model-allowlist pattern; your app can add any chat UI on top.

# How to integrate

## 1) Install dependencies

Required packages:

```bash
npm install ai @ai-sdk/gateway next zod
```

If you already use React chat hooks, also install:

```bash
npm install @ai-sdk/react
```

## 2) Add the gateway client

Create `lib/gateway.ts`:

```ts
import { createGateway } from '@ai-sdk/gateway';

export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
```

Do not instantiate the gateway client in browser code.

## 3) Define an explicit model allowlist

Create `lib/constants.ts`:

```ts
export const DEFAULT_MODEL = 'openai/gpt-5-nano';

export const SUPPORTED_MODELS = [
  'amazon/nova-lite',
  'amazon/nova-micro',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3-flash',
  'google/gemma2-9b-it',
  'meta/llama-3.1-8b',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
];
```

Use an allowlist even if the gateway can discover more models dynamically.

## 4) Add the chat API route

Create `app/api/chat/route.ts`:

```ts
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { gateway } from '@/lib/gateway';
import { DEFAULT_MODEL, SUPPORTED_MODELS } from '@/lib/constants';

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    modelId = DEFAULT_MODEL,
  }: { messages: UIMessage[]; modelId?: string } = await req.json();

  if (!SUPPORTED_MODELS.includes(modelId)) {
    return new Response(
      JSON.stringify({ error: `Model ${modelId} is not supported` }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const result = streamText({
    model: gateway(modelId),
    messages: convertToModelMessages(messages),
    onError: (error) => {
      console.error('Error while streaming.', error);
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Notes:

- `convertToModelMessages` converts UI-layer messages into model-compatible format.
- `toUIMessageStreamResponse()` returns a streaming response that works with AI SDK chat clients.
- Keep this route server-only.

## 5) Add the model-list API route

Create `app/api/models/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { gateway } from '@/lib/gateway';
import { SUPPORTED_MODELS } from '@/lib/constants';

export async function GET() {
  const allModels = await gateway.getAvailableModels();

  return NextResponse.json({
    models: allModels.models.filter((model) =>
      SUPPORTED_MODELS.includes(model.id),
    ),
  });
}
```

This lets the frontend populate a model picker without exposing unsupported models.

## 6) Add the environment variable

```env
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_api_key
```

Keep this server-side only.

## 7) Connect a frontend chat client

Example with `@ai-sdk/react`:

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export function ChatExample() {
  const [modelId, setModelId] = useState('openai/gpt-5-nano');
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
    body: { modelId },
  });

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask something" />
        <button type="submit" disabled={status === 'streaming'}>
          Send
        </button>
      </form>

      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>{' '}
            {message.parts?.map((part, i) =>
              part.type === 'text' ? <span key={i}>{part.text}</span> : null,
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

If the selected model can change during a session, update the request body accordingly.

# UX rules

- Always present only models returned by `/api/models` or by your own allowlist.
- Show which model is active before the user submits a prompt.
- Stream partial output in the UI; do not wait for full completion if using AI SDK chat flows.
- Surface clear retry/error states for unsupported model IDs, rate limits, and upstream failures.
- Provide a sensible default model so chat works without configuration.
- If you expose multiple models, keep labels human-readable but send the canonical gateway `model.id` to the API.

# Avoid

- Do not call `createGateway` in client components.
- Do not trust arbitrary `modelId` values from the browser; validate against `SUPPORTED_MODELS`.
- Do not expose all gateway-discovered models directly to users unless you intentionally support them.
- Do not hardcode demo-specific system prompts unless the product actually needs them.
- Do not couple this integration to theme providers, font setup, or branded demo UI.
- Do not put provider-specific SDK calls in the route when the gateway abstraction is the point of the integration.

# Verification

## Manual checks

1. Start the app with `AI_GATEWAY_API_KEY` configured.
2. Request the model list:

```bash
curl http://localhost:3000/api/models
```

Expected: JSON with only your allowed models.

3. Test chat streaming:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "modelId": "openai/gpt-5-nano",
    "messages": [
      { "id": "1", "role": "user", "parts": [{ "type": "text", "text": "Say hello in one sentence." }] }
    ]
  }'
```

Expected: a streamed response rather than a single buffered JSON payload.

4. Test invalid model rejection:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "modelId": "not-a-real-model",
    "messages": []
  }'
```

Expected: HTTP 400 with an error JSON body.

## Implementation checks

- `AI_GATEWAY_API_KEY` is only referenced in server code.
- `app/api/chat/route.ts` uses `streamText()` and returns `toUIMessageStreamResponse()`.
- `app/api/models/route.ts` filters gateway models through `SUPPORTED_MODELS`.
- The frontend sends canonical model IDs, not display labels.
