# When to use

Use this dossier when you need a basic AI chat interface in a Next.js App Router app and want low-latency text generation from Groq using the Vercel AI SDK.

Good fits:
- in-app support/chat assistants
- internal tools with conversational querying
- dashboard copilots
- simple public chatbot experiences

Do **not** use this dossier if you need durable chat history, authentication, per-user quotas, RAG, or provider abstraction across many model vendors without adding those separately.

# How to integrate

## 1) Install dependencies

```bash
npm install ai @ai-sdk/react @ai-sdk/groq
```

## 2) Add environment variables

```env
GROQ_API_KEY=your_groq_api_key
```

The Groq SDK reads `GROQ_API_KEY` from the server environment. Never expose it to the client.

## 3) Create a Groq model helper

Create a shared server-safe model config:

```ts
import { groq } from "@ai-sdk/groq";

export const groqModels = {
  fast: "llama-3.1-8b-instant",
  balanced: "llama-3.3-70b-versatile",
} as const;

export type GroqModelId = (typeof groqModels)[keyof typeof groqModels];
export const defaultGroqModel: GroqModelId = groqModels.fast;

export function getGroqModel(modelId: GroqModelId = defaultGroqModel) {
  return groq(modelId);
}
```

## 4) Add the App Router chat API route

Create `app/api/chat/route.ts` and stream responses from Groq:

```ts
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getGroqModel, type GroqModelId, defaultGroqModel } from "@/components/lib/ai/providers";

export const maxDuration = 30;

export async function POST(request: Request) {
  const {
    messages,
    selectedModel,
  }: {
    messages: UIMessage[];
    selectedModel?: GroqModelId;
  } = await request.json();

  const result = streamText({
    model: getGroqModel(selectedModel ?? defaultGroqModel),
    system: "You are a helpful assistant.",
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

Key points:
- Use `convertToModelMessages(messages)` before passing messages to `streamText`.
- Keep the route server-only.
- Set `maxDuration` if deploying to environments with execution limits.

## 5) Add the client chat UI

Use `useChat()` in a client component:

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useChat();

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        sendMessage({ text: input });
        setInput("");
      }}
    >
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts
              ?.filter((part) => part.type === "text")
              .map((part, i) => <span key={i}>{part.text}</span>)}
          </div>
        ))}
      </div>

      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit" disabled={isLoading}>Send</button>
      <button type="button" onClick={() => stop()} disabled={!isLoading}>Stop</button>
    </form>
  );
}
```

If you expose model selection in the UI, pass it in the request body:

```tsx
sendMessage(
  { text: input },
  { body: { selectedModel } }
);
```

## 6) Render the chat component on a page

```tsx
import { Chat } from "@/components/components/chat";

export default function Page() {
  return (
    <main className="p-6">
      <Chat />
    </main>
  );
}
```

# UX rules

- Stream responses; do not block until the full answer is complete.
- Show clear loading state while status is `submitted` or `streaming`.
- Include a visible stop/cancel action during generation.
- Preserve line breaks in assistant messages with `whitespace-pre-wrap` or markdown rendering.
- If model selection is exposed, default to a fast low-cost model and label choices clearly.
- Surface friendly rate-limit and provider-failure messages to users.
- Keep the first version stateless unless the product explicitly needs saved conversation history.

# Avoid

- Do not call Groq directly from the client.
- Do not put `GROQ_API_KEY` in `NEXT_PUBLIC_*` env vars.
- Do not keep template-specific demo UI like deploy buttons, branded metadata, or landing-page content.
- Do not reference missing aliases like `@/ai/tools` or `@/ai/providers` unless you create them.
- Do not assume tool calling, telemetry, evals, or OpenTelemetry are required for a basic chatbot.
- Do not add long-lived memory/storage unless the product asks for it.

# Verification

Check these before shipping:

1. `GROQ_API_KEY` is set in the deployment environment.
2. `POST /api/chat` returns a streamed response, not a buffered JSON payload.
3. The client uses `useChat()` in a `"use client"` component.
4. Sending a message produces assistant output incrementally.
5. Stopping generation cancels the active stream.
6. Invalid or missing request bodies return a safe error instead of crashing.
7. Rate-limit/provider failures show a user-friendly message.

Minimal manual smoke test:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "id": "1", "role": "user", "parts": [{ "type": "text", "text": "Write one sentence about Groq." }] }
    ]
  }'
```

Expected result: a streamed text/event-stream response from the route, and the same route should work through the browser chat UI.
