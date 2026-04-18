# When to use

Use this dossier when the site needs a chat or text-generation interface that can switch between OpenAI, Google, and Anthropic models without changing the rest of the app architecture.

Typical fits:
- Internal tools with a model picker
- AI dashboards comparing providers
- Chat interfaces where admins or users choose cost/speed/quality tradeoffs
- Apps that want one `/api/chat` endpoint but multiple model backends

Do not use this dossier if the app only ever needs one fixed model; a plain single-provider AI SDK setup is simpler.

# How to integrate

## 1) Install and configure providers

Required env vars:

```env
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Use these packages:
- `ai`
- `@ai-sdk/openai`
- `@ai-sdk/google`
- `@ai-sdk/anthropic`
- `zod`
- optionally `@ai-sdk/react` for client chat hooks

## 2) Create a provider registry

Define one shared registry that maps stable app-facing model ids to provider SDK models.

```ts
import { customProvider } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

export const providerRegistry = customProvider({
  languageModels: {
    'openai/gpt-4o-mini': openai('gpt-4o-mini'),
    'google/gemini-2.0-flash': google('gemini-2.0-flash'),
    'anthropic/claude-3-5-sonnet': anthropic('claude-3-5-sonnet-latest'),
  },
});
```

Important pattern:
- The string key is your app contract.
- The provider call on the right is the actual SDK model.
- Keep these keys stable even if you later upgrade the underlying model version.

## 3) Validate the selected model server-side

Never trust the client-provided model id directly.

```ts
const AVAILABLE_MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash',
  'anthropic/claude-3-5-sonnet',
] as const;

function isAvailableModel(model: string): model is (typeof AVAILABLE_MODELS)[number] {
  return AVAILABLE_MODELS.includes(model as (typeof AVAILABLE_MODELS)[number]);
}
```

Fallback to a safe default when invalid.

## 4) Stream from one API route

Use one route that accepts `messages` and an optional `model`.

```ts
import { streamText, convertToModelMessages } from 'ai';

export async function POST(req: Request) {
  const { messages, model } = await req.json();
  const selectedModel = isAvailableModel(model) ? model : 'openai/gpt-4o-mini';

  const result = streamText({
    model: providerRegistry.languageModel(selectedModel),
    messages: convertToModelMessages(messages),
    system: 'You are a helpful assistant.',
  });

  return result.toUIMessageStreamResponse();
}
```

Notes:
- `convertToModelMessages` is the safe path when the client sends AI SDK UI messages.
- `toUIMessageStreamResponse()` is the standard response for `useChat`/AI SDK client transport.
- Export `maxDuration` if your deployment platform needs longer server execution for streaming.

## 5) Send the selected model from the client

If using `@ai-sdk/react`, pass the model in the request body.

```tsx
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const [model, setModel] = useState('openai/gpt-4o-mini');

const chat = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: { model },
  }),
});
```

Provide a simple select input bound to the same `model` state.

## 6) Render messages safely

This dossier includes a minimal message component using markdown rendering. Keep rendering conservative.

```tsx
<Message role={message.role} content={textContent} />
```

If messages are stored as structured `parts`, extract text parts explicitly rather than assuming a single `content` string.

## 7) Optional: reasoning extraction middleware

If you use providers/models that emit hidden reasoning wrapped in tags, add middleware at the registry level.

```ts
import { customProvider, extractReasoningMiddleware } from 'ai';

const providerRegistry = customProvider({
  languageModels: {
    'openai/gpt-4o-mini': openai('gpt-4o-mini'),
  },
  middleware: {
    reasoning: extractReasoningMiddleware({ tagName: 'think' }),
  },
});
```

Only expose reasoning in the UI if the product explicitly needs it and the provider policy allows it.

# UX rules

- Always show the currently selected model in the composer or header.
- Use human-readable labels like `GPT-4o mini` and `Claude 3.5 Sonnet`, not raw ids alone.
- If the app targets non-technical users, hide providers that are experimental or expensive.
- Preserve message history when switching models only if that behavior is intentional and clearly communicated.
- Disable duplicate submits while streaming.
- Auto-scroll to the latest message during streaming.
- If a provider key is missing, fail with a clear server error and optionally hide that provider in the UI.
- Prefer one default model optimized for cost and latency; treat premium models as opt-in.

# Avoid

- Do not expose raw API keys or instantiate provider SDK calls in client components.
- Do not allow arbitrary model ids from the browser without an allowlist.
- Do not hardcode provider-specific behavior deep in the chat UI; keep provider differences behind the registry.
- Do not rely on template demo data like order-tracking mocks; it is unrelated to this integration.
- Do not assume all providers support the same features, token limits, tool calling behavior, or response speed.
- Do not make provider logos/icons required for functionality; they are optional polish.
- Do not add analytics, KV storage, or persistence unless the product actually needs them.

# Verification

## Functional checks

1. Start the app with all three API keys present.
2. Open the chat UI.
3. Select OpenAI, send a prompt, and confirm a streamed response arrives.
4. Switch to Google, send the same prompt, and confirm the route still works.
5. Switch to Anthropic, send a prompt, and confirm the route still works.
6. Try sending an invalid model id manually; confirm the server falls back or rejects safely.

## Code checks

- Registry exists in one shared server module.
- API route calls `providerRegistry.languageModel(selectedModel)`.
- Client sends only the selected registry key, not provider SDK objects.
- Model id is validated on the server.
- No provider API key usage exists in client bundles.

## UX checks

- Current model is visible before submit.
- Streaming messages remain readable and auto-scroll correctly.
- Assistant/user styling is distinct.
- Markdown output does not break layout on long responses or code blocks.
