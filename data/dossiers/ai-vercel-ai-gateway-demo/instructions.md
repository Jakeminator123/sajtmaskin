# When to use

Use this dossier when you need a Next.js App Router backend for AI chat that:

- streams responses to the browser
- routes requests through Vercel AI Gateway
- supports selecting from a controlled list of models
- keeps provider credentials on the server

This is best for app-shell and dashboard-style products where you already have, or plan to build, a custom chat UI.

# How to integrate

## 1. Install dependencies

Required packages:

```bash
npm install ai @ai-sdk/gateway
```

If you are building a React chat UI with the AI SDK hooks:

```bash
npm install @ai-sdk/react
```

## 2. Add the gateway client

Create a shared server-only gateway helper:

```ts
// lib/gateway.ts
import { createGateway } from "@ai-sdk/gateway";

export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
```

## 3. Define an allowlist of models

Do not accept arbitrary model IDs from the client. Keep a small server-side allowlist:

```ts
// lib/constants.ts
export const DEFAULT_MODEL = "openai/gpt-5-nano";

export const SUPPORTED_MODELS = [
  "amazon/nova-lite",
  "amazon/nova-micro",
  "anthropic/claude-haiku-4.5",
  "google/gemini-3-flash",
  "google/gemma2-9b-it",
  "meta/llama-3.1-8b",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
];
```

Adjust this list to the exact models your product supports.

## 4. Add the streaming chat route

Create an App Router route handler:

```ts
// app/api/chat/route.ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { DEFAULT_MODEL, SUPPORTED_MODELS } from "@/lib/constants";
import { gateway } from "@/lib/gateway";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    modelId = DEFAULT_MODEL,
  }: { messages: UIMessage[]; modelId: string } = await req.json();

  if (!SUPPORTED_MODELS.includes(modelId)) {
    return new Response(
      JSON.stringify({ error: `Model ${modelId} is not supported` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const result = streamText({
    model: gateway(modelId),
    messages: convertToModelMessages(messages),
    onError: (error) => {
      console.error("AI stream error", error);
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Notes:

- `convertToModelMessages` adapts UI messages into provider-ready messages.
- `toUIMessageStreamResponse()` returns the stream format expected by AI SDK chat clients.
- Keep prompts and policy logic on the server.

## 5. Optionally expose available models

If your UI includes a model picker, expose only the server-approved models:

```ts
// app/api/models/route.ts
import { NextResponse } from "next/server";
import { gateway } from "@/lib/gateway";
import { SUPPORTED_MODELS } from "@/lib/constants";

export async function GET() {
  const allModels = await gateway.getAvailableModels();

  return NextResponse.json({
    models: allModels.models.filter((model) =>
      SUPPORTED_MODELS.includes(model.id)
    ),
  });
}
```

This lets the UI render friendly choices without hardcoding model metadata client-side.

## 6. Call the route from your UI

With `@ai-sdk/react`, a minimal client component looks like:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export function Chat() {
  const [modelId, setModelId] = useState("openai/gpt-5-nano");

  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "/api/chat",
    body: { modelId },
  });

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button disabled={status === "streaming"}>Send</button>
      </form>

      <ul>
        {messages.map((message) => (
          <li key={message.id}>
            <strong>{message.role}:</strong> {message.parts?.map((part, i) =>
              part.type === "text" ? <span key={i}>{part.text}</span> : null
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

If you do not need a model picker, omit `/api/models` and keep the model fixed on the server.

## 7. Environment variables

Add:

```bash
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_api_key
```

Never expose this key to the client.

# UX rules

- Stream tokens as they arrive; do not block until the full completion is finished.
- If users can choose a model, only show models returned by `/api/models` or a server-owned allowlist.
- Provide a visible loading/streaming state while generation is in progress.
- Show a clear retry path for transient errors.
- Keep model selection optional; default to one reliable low-latency model.
- Preserve conversation history in the UI when sending follow-up messages.

# Avoid

- Do not call `gateway(modelId)` directly from the client.
- Do not trust arbitrary `modelId` values from request bodies without validating against `SUPPORTED_MODELS`.
- Do not put gateway API keys in `NEXT_PUBLIC_` env vars.
- Do not couple this integration to a template-specific layout, theme provider, or demo landing page.
- Do not fetch all models on every render from the client if a static allowlist is sufficient.
- Do not hardcode a demo system prompt unless the product explicitly needs one.

# Verification

## Server checks

1. Confirm `AI_GATEWAY_API_KEY` is present.
2. Start the app and request the model list:

```bash
curl http://localhost:3000/api/models
```

Expect a JSON payload with only allowed model IDs.

3. Send a chat request:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "openai/gpt-5-nano",
    "messages": [
      { "id": "1", "role": "user", "parts": [{ "type": "text", "text": "Say hello in one sentence." }] }
    ]
  }'
```

Expect a streamed response.

4. Send an unsupported model:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"modelId":"not-supported","messages":[]}'
```

Expect HTTP 400.

## UI checks

- Submitting a prompt updates the assistant message incrementally.
- Switching models changes the backend request body but still works only for allowlisted IDs.
- Network errors produce a user-visible error state rather than a silent failure.
