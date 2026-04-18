# When to use

Use this dossier when a site needs an AI chat surface powered by DeepInfra in a Next.js App Router project, especially when you want token streaming via the Vercel AI SDK instead of manually handling SSE.

Good fits:
- in-app assistants inside dashboards or app shells
- support/chat copilots
- internal tools with model selection
- simple AI demos where the server owns the API key

Do not use this dossier for:
- static marketing pages with no interactive AI feature
- retrieval-heavy chat systems that require vector search, memory, auth, or per-user persistence unless you add those separately

# How to integrate

## 1) Install dependencies

```bash
npm install ai @ai-sdk/react @ai-sdk/deepinfra zod
```

## 2) Add environment variables

```env
DEEPINFRA_API_KEY=your_deepinfra_api_key
```

Keep the key server-side only. Never expose it in client components.

## 3) Create the DeepInfra provider config

Create `ai/providers.ts`:

```ts
import { createDeepInfra } from "@ai-sdk/deepinfra";

const deepinfra = createDeepInfra({
  apiKey: process.env.DEEPINFRA_API_KEY,
});

export const modelIds = [
  "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "meta-llama/Meta-Llama-3.1-70B-Instruct",
] as const;

export type modelID = (typeof modelIds)[number];

export const defaultModel: modelID = modelIds[0];

export const model = {
  languageModel: (id: modelID) => deepinfra(id),
};
```

Use a typed allowlist of model IDs. Do not accept arbitrary client-provided model strings.

## 4) Add the chat route

Create `app/api/chat/route.ts`:

```ts
import { model, type modelID } from "@/ai/providers";
import { weatherTool } from "@/ai/tools";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  UIMessage,
} from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    selectedModel,
  }: { messages: UIMessage[]; selectedModel: modelID } = await req.json();

  const result = streamText({
    model: model.languageModel(selectedModel),
    system: "You are a helpful assistant.",
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getWeather: weatherTool,
    },
    experimental_telemetry: {
      isEnabled: false,
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error) => {
      if (error instanceof Error && error.message.includes("Rate limit")) {
        return "Rate limit exceeded. Please try again later.";
      }

      console.error(error);
      return "An error occurred.";
    },
  });
}
```

Important integration points:
- `convertToModelMessages(messages)` converts UI messages into provider-ready model messages
- `toUIMessageStreamResponse()` returns the streaming format expected by `useChat`
- `selectedModel` must be validated by TypeScript and constrained by your allowlist
- `maxDuration` matters on serverless platforms for long-running streams

## 5) Add optional tools on the server

Create `ai/tools.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get mock weather data for a given city.",
  inputSchema: z.object({
    city: z.string().min(1),
  }),
  execute: async ({ city }) => {
    return {
      city,
      temperatureC: 22,
      condition: "sunny",
    };
  },
});
```

If you do not need tools, remove the `tools` block from `streamText`.

## 6) Add a client chat component

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { defaultModel, modelIds, type modelID } from "@/ai/providers";

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<modelID>(defaultModel);

  const { messages, sendMessage, status, stop } = useChat({
    api: "/api/chat",
    onError: (error) => {
      console.error(error);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || isLoading) return;
        sendMessage({ text }, { body: { selectedModel } });
        setInput("");
      }}
    >
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value as modelID)}
        disabled={isLoading}
      >
        {modelIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask something..."
      />

      <button type="submit" disabled={isLoading}>Send</button>
      <button type="button" onClick={() => stop()} disabled={!isLoading}>
        Stop
      </button>

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
    </form>
  );
}
```

The key client pattern is:

```ts
sendMessage({ text: input }, { body: { selectedModel } });
```

That extra `body` payload is how model selection reaches the server route.

# UX rules

- Stream tokens into the UI; do not block until full completion unless the product explicitly needs it.
- Show clear loading/streaming state and a visible stop button.
- Disable model switching while a response is streaming.
- Keep first-run UX simple: one input, one send action, optional model picker.
- Surface friendly fallback messages for rate limits and transient provider failures.
- If showing reasoning, ensure the product actually wants it; otherwise set `sendReasoning: false`.
- Keep API keys and provider setup on the server only.
- Prefer a small allowlist of supported models rather than freeform model input.

# Avoid

- Do not import template-only components like project overviews, branded headers, deploy buttons, or custom marketing UI.
- Do not trust arbitrary `selectedModel` strings from the client without constraining them to known IDs.
- Do not call DeepInfra directly from the browser.
- Do not leave tool execution enabled if the tools are placeholders and not useful in the product.
- Do not hardcode template metadata like "Vercel x DeepInfra Chatbot" into page titles or descriptions unless that is truly the app name.
- Do not assume the route can stream forever; respect deployment timeouts.

# Verification

## Local smoke test

1. Set `DEEPINFRA_API_KEY`.
2. Start the app.
3. Open the page with the chat component.
4. Send a prompt like:

```text
Say hello in one sentence.
```

Expected result:
- request goes to `/api/chat`
- response streams progressively
- no API key appears in the client bundle or network payload

## Model selection test

Send the same prompt with two different models from the dropdown.

Expected result:
- server receives `selectedModel`
- route uses `model.languageModel(selectedModel)`
- responses complete successfully for both allowlisted models

## Tool test

Prompt:

```text
What is the weather in Stockholm?
```

Expected result:
- the model may call `getWeather`
- the server executes the tool
- the final streamed response incorporates tool output

## Error handling test

Temporarily use an invalid `DEEPINFRA_API_KEY` or force a provider error.

Expected result:
- server does not expose raw stack traces to users
- client shows a friendly failure state
- server logs contain the real error for debugging

## Production checks

- confirm environment variable is configured in deployment
- confirm route timeout is compatible with `maxDuration`
- confirm no client component references `process.env.DEEPINFRA_API_KEY`
- confirm model IDs used in UI exist in the provider allowlist
