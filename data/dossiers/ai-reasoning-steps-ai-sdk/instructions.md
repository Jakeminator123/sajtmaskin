# When to use

Use this dossier when the site needs a chatbot or assistant that shows **structured reasoning progress** while generating an answer.

Good fits:
- support/chat assistants that should show progress like "Checking context" or "Comparing options"
- internal tools where users benefit from seeing high-level intermediate steps
- AI workflows built with the **Vercel AI SDK** and a Next.js App Router API route

Do **not** use this if you only need plain chat streaming with no intermediate UI state.

# How to integrate

## 1) Add the required environment variable

```env
OPENAI_API_KEY=sk-...
```

## 2) Keep the reasoning step schema shared between server and client

```ts
// components/lib/schema.ts
import { z } from 'zod';

export const reasoningStepSchema = z.object({
  title: z.string().describe('The title of the reasoning step'),
  content: z.string().describe('The content of the reasoning step.'),
  nextStep: z
    .enum(['continue', 'finalAnswer'])
    .describe('Whether to continue with another step or provide the final answer'),
});

export type ReasoningStep = z.infer<typeof reasoningStepSchema>;
```

## 3) Define a tool that returns reasoning steps verbatim

```ts
// components/lib/reasoning-tool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { reasoningStepSchema } from './schema';

export const addReasoningStep = tool({
  description:
    'Emit a structured reasoning step for the UI before continuing or producing the final answer.',
  inputSchema: reasoningStepSchema,
  execute: async (input: z.infer<typeof reasoningStepSchema>) => input,
});
```

The key idea: the tool is not for external side effects. It is a typed mechanism for the model to send **display-safe progress updates** to the UI.

## 4) Use `streamText` with the reasoning tool and multi-step stopping

```ts
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, stepCountIs, streamText, UIMessage } from 'ai';
import { addReasoningStep } from '@/components/lib/reasoning-tool';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    messages: convertToModelMessages(messages),
    system:
      'Be concise and helpful. When useful, call addReasoningStep before the final answer. Do not reveal hidden chain-of-thought; only provide short, user-safe summaries.',
    tools: {
      addReasoningStep,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
```

Notes:
- Use `stepCountIs(...)` to allow multiple model/tool turns.
- Keep the step count small; reasoning-step UIs get noisy quickly.
- The tool payload should be short and presentation-ready.

## 5) Render both final content and reasoning steps in the message UI

The kept `message.tsx` shows the core pattern:
- render streamed markdown content
- inspect `toolInvocations`
- render `ReasoningStep` for `addAReasoningStep` / reasoning-step tool results

If you adapt the tool name, keep server and client naming aligned.

Example rendering pattern:

```tsx
{toolInvocations?.map((toolInvocation) => {
  if (toolInvocation.state !== 'result') return null;
  if (toolInvocation.toolName !== 'addReasoningStep') return null;

  return <ReasoningStep key={toolInvocation.toolCallId} step={toolInvocation.result} />;
})}
```

## 6) Use a small dedicated reasoning-step component

```tsx
// components/components/reasoning-step.tsx
'use client';

import type { ReasoningStep } from '@/components/lib/schema';

export function ReasoningStep({ step }: { step: ReasoningStep }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-medium">{step.title}</div>
      <div className="mt-1 text-sm whitespace-pre-wrap">{step.content}</div>
    </div>
  );
}
```

# UX rules

- Show reasoning steps as **high-level progress summaries**, not raw chain-of-thought.
- Keep each step short: ideally 1 title + 1 concise sentence.
- Visually separate reasoning steps from the assistant's final answer.
- Do not require reasoning steps for every reply; only use them when they add clarity.
- Final answer should still stand on its own even if reasoning steps are hidden or removed.
- If streaming text and tool results together, preserve order so the conversation feels coherent.

# Avoid

- Do not present hidden internal reasoning, token-by-token thought traces, or private deliberation.
- Do not store reasoning steps as business-critical state unless you explicitly need audit/history.
- Do not use verbose multi-step reasoning for simple factual answers.
- Do not mismatch tool names between server and client. The provided component currently checks tool invocation names explicitly.
- Do not keep template-specific demo data like orders, tracking, or branded icons.

# Verification

1. Start the app with `OPENAI_API_KEY` set.
2. Send a prompt that benefits from intermediate progress, for example:

```text
Compare three approaches for launching a B2B SaaS MVP and recommend one.
```

3. Confirm that:
- the API streams a normal assistant response
- one or more reasoning-step tool invocations appear before or alongside the final answer
- each reasoning step matches the schema: `title`, `content`, `nextStep`
- the final answer is still complete and readable on its own

4. Test a simple prompt:

```text
What is 2 + 2?
```

Confirm the assistant can answer directly without unnecessary reasoning-step noise.

5. If reasoning steps do not render, check:
- tool name matches on both server and client
- tool invocation state is `result`
- `ReasoningStep` component import path is correct
- your route returns `toUIMessageStreamResponse()`
