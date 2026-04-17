# When to use

Use this dossier when you need a chatbot that can call one or more server-side tools during a single assistant turn and automatically continue after each tool result. Typical cases:

- support assistants that look up account, order, or ticket data
- internal copilots that query docs or business systems
- product UIs where the model should decide when to fetch structured data

Use a simpler text-only chat pattern if you do not need tool execution.

# How to integrate

## 1) Install and configure the SDK

Required env:

```env
OPENAI_API_KEY=sk-...
```

Core packages for this pattern:

```bash
npm install ai @ai-sdk/openai zod
```

If you are building a client chat UI with hooks, also install:

```bash
npm install @ai-sdk/react
```

## 2) Create a server chat route with tools

The key pattern is:

- call `streamText(...)`
- pass `tools`
- set `stopWhen: stepCountIs(n)` so the model can perform multiple tool roundtrips automatically
- return `result.toUIMessageStreamResponse()` for the client UI

```ts
import { openai } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      lookupOrder: tool({
        description: 'Look up an order by ID.',
        inputSchema: z.object({
          orderId: z.string(),
        }),
        execute: async ({ orderId }) => {
          return { orderId, status: 'shipped' };
        },
      }),
      getTracking: tool({
        description: 'Fetch tracking details for an order.',
        inputSchema: z.object({
          orderId: z.string(),
        }),
        execute: async ({ orderId }) => {
          return { orderId, eta: 'today 5:45 PM' };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
```

## 3) Design tools for chaining

Automatic roundtrips work best when tools are:

- narrow in scope
- deterministic
- fast enough for interactive chat
- structured with strict `zod` input schemas

Good example: first tool finds a resource, second tool fetches details.

Bad example: one giant tool that accepts vague free-form instructions and does many unrelated actions.

## 4) Render text and tool results separately in the client

Do not flatten everything into plain markdown. Tool results are structured message parts and should be rendered intentionally.

```tsx
"use client";

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function Chat() {
  const { messages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <p key={index}>{part.text}</p>;
            }

            if (part.type === 'tool-invocation') {
              return (
                <pre key={index}>
                  {JSON.stringify(part.toolInvocation, null, 2)}
                </pre>
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

## 5) Convert structured backend data into domain UI

After the generic flow works, replace raw JSON rendering with components for known tool names. Example:

```tsx
if (part.type === 'tool-invocation' && part.toolInvocation.state === 'result') {
  switch (part.toolInvocation.toolName) {
    case 'lookupOrder':
      return <OrderCard order={part.toolInvocation.result} />;
    case 'getTracking':
      return <TrackingTimeline data={part.toolInvocation.result} />;
  }
}
```

That is the correct place to add custom UI for tools.

# UX rules

- Stream assistant text as it arrives; do not wait for the full answer.
- Show visible loading state for in-progress tool invocations.
- Render tool output in a distinct container from prose.
- Keep tool result UIs concise; the assistant should still summarize what happened in plain language.
- Cap autonomous steps with `stepCountIs(...)` to prevent runaway loops.
- Prefer read-only tools by default; require explicit confirmation before destructive actions.
- Log tool failures server-side and return safe, user-readable fallback text.

# Avoid

- Do not expose secrets or provider clients in client components.
- Do not let tools accept unvalidated free-form payloads when a typed schema is possible.
- Do not rely on template-specific demo data or branded UI as the integration contract.
- Do not assume every message has only text; this pattern depends on multi-part messages.
- Do not omit a stop condition; unlimited tool recursion is risky.
- Do not make tools return huge blobs if a compact structured object will do.

# Verification

1. Add `OPENAI_API_KEY` and start the app.
2. Send a prompt that should require one tool, such as: `What's the weather in Stockholm?`
3. Confirm the assistant streams a response and a structured tool result appears.
4. Send a prompt that should require chained tools, such as: `Find the order and then show tracking for order 12345.`
5. Confirm the backend performs multiple steps within one assistant turn instead of forcing manual resubmission.
6. Confirm the final assistant response incorporates the tool results in natural language.
7. Temporarily throw inside one tool and confirm the UI does not crash and the failure is handled gracefully.
