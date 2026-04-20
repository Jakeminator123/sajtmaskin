# When to use

Use this dossier when the site needs a built-in AI chat interface backed by xAI models in a Next.js App Router project. It is a good fit for support assistants, internal tools, product copilots, and general-purpose chat surfaces where streaming responses matter.

# How to integrate

## 1) Install required packages

```bash
npm install ai @ai-sdk/react @ai-sdk/xai
```

## 2) Add environment variables

```env
XAI_API_KEY=your_xai_api_key
```

The API key must stay server-side. Do not expose it in client components.

## 3) Create an xAI provider wrapper

Create a small shared server module for model selection.

```ts
import { createXai } from "@ai-sdk/xai";

export const modelIds = ["grok-2-1212", "grok-2-vision-1212", "grok-beta"] as const;
export type ModelID = (typeof modelIds)[number];

const xai = createXai({ apiKey: process.env.XAI_API_KEY });

export const defaultModel: ModelID = "grok-2-1212";

export function getLanguageModel(modelId: ModelID = defaultModel) {
  return xai(modelId);
}
```

## 4) Add the streaming chat API route

In App Router, expose a POST route that accepts UI messages and an optional selected model.

```ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { defaultModel, getLanguageModel, type ModelID } from "@/components/ai/providers";

export const maxDuration = 30;

type ChatRequestBody = {
  messages: UIMessage[];
  selectedModel?: ModelID;
};

export async function POST(req: Request) {
  const { messages, selectedModel }: ChatRequestBody = await req.json();

  const result = streamText({
    model: getLanguageModel(selectedModel ?? defaultModel),
    system: "You are a helpful assistant.",
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error) => {
      if (error instanceof Error && /rate limit/i.test(error.message)) {
        return "Rate limit exceeded. Please try again later.";
      }
      console.error(error);
      return "An error occurred.";
    },
  });
}
```

Important integration notes:
- Use `convertToModelMessages(messages)` before calling `streamText`.
- Keep the xAI model instance creation on the server.
- Pass `selectedModel` through the request body if the UI allows model switching.
- Set `maxDuration` if deploying to environments with function execution limits.

## 5) Add a client chat component

Use `useChat` from `@ai-sdk/react` and submit the chosen model in the request body.

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("grok-2-1212");
  const { messages, sendMessage, status, stop } = useChat();

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        sendMessage({ text: input }, { body: { selectedModel } });
        setInput("");
      }}
    >
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit" disabled={isLoading}>Send</button>
      {isLoading && <button type="button" onClick={() => stop()}>Stop</button>}
    </form>
  );
}
```

## 6) Optional: add tools only if the product actually needs them

The source template used a weather tool and multi-step agent flow. Treat that as optional. If you add tools, keep them narrowly scoped and validate inputs. Do not ship demo tools by default.

# UX rules

- Stream tokens into the UI; do not block until the full answer is complete.
- Always show loading and stop states while a response is streaming.
- If model switching is exposed, keep the selector simple and send the chosen model with each request.
- Show a plain-language error for rate limits and generic failures.
- Preserve chat history in component state at minimum; add persistence only if the product requires it.
- Make the empty state useful but generic; avoid template branding or vendor marketing copy.

# Avoid

- Do not expose `XAI_API_KEY` in client code or public env vars.
- Do not keep template-only UI like deploy buttons, analytics wiring, branded metadata, or marketing sections.
- Do not reference missing template modules such as custom provider wrappers, header components, or demo tools unless you also add them.
- Do not hardwire the integration to Vercel-specific UI components; the AI SDK pattern is portable.
- Do not enable arbitrary tool calling without clear product requirements and input validation.

# Verification

## Manual checks

1. Set `XAI_API_KEY` in `.env.local`.
2. Start the app and open the page containing the chat component.
3. Send a message and confirm the response streams incrementally.
4. If model selection is enabled, switch models and confirm the route receives the selected value.
5. Trigger an invalid or exhausted API key scenario and confirm the UI shows a friendly error.

## Quick API test

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "selectedModel": "grok-2-1212",
    "messages": [{"id":"1","role":"user","parts":[{"type":"text","text":"Hello"}]}]
  }'
```

Expected result: a streaming response from the route rather than a buffered JSON blob.

## Production readiness checks

- Confirm the deployment environment includes `XAI_API_KEY`.
- Confirm the route runs in a runtime that supports streaming.
- Confirm any model list shown in the UI matches models your xAI account can access.
- Confirm logs do not leak prompts, secrets, or raw provider errors to end users.
