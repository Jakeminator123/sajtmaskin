# When to use

Use this dossier when you need a **chat interface in a Next.js App Router app** that can:

- stream assistant text token-by-token
- return **React Server Component UI** from the server
- call model tools that render structured UI instead of plain text
- keep a server-side AI conversation state

This is specifically for the **Vercel AI SDK RSC pattern** (`ai/rsc`). Use it for app-shells, dashboards, internal copilots, support assistants, and task-oriented chat. Do **not** use it for static marketing pages with no interactive chat.

# How to integrate

## 1. Install required packages

Use the provider packages already declared by the dossier:

```bash
npm install ai @ai-sdk/openai zod streamdown framer-motion
```

If the app does not already have them:

```bash
npm install d3-scale react-use sonner @vercel/analytics @vercel/kv
```

Only keep optional packages if the final build actually uses them.

## 2. Add environment variables

Create `.env.local`:

```env
OPENAI_API_KEY=sk-...
```

## 3. Create the server AI definition

Add `components/lib/ai.ts`.

This file is the core integration point. It should:

- create the AI provider with `createAI`
- define a server action such as `submitUserMessage`
- use `streamUI(...)` for model responses
- maintain server-side conversation state with `getMutableAIState`
- stream text through `createStreamableValue`
- optionally expose tools that return React UI

Minimal pattern:

```tsx
import { createAI, getMutableAIState, streamUI, createStreamableValue } from "ai/rsc";
import { openai } from "@ai-sdk/openai";

async function submitUserMessage(input: string) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();
  const textStream = createStreamableValue("");

  const result = await streamUI({
    model: openai("gpt-4o-mini"),
    messages: [...aiState.get().messages, { role: "user", content: input }],
    text: ({ content, done }) => {
      if (done) textStream.done();
      else textStream.update(content);

      return <TextStreamMessage content={textStream.value} />;
    },
  });

  return result.value;
}
```

## 4. Wrap the route tree in the AI provider

Mount the provider high enough that the chat client can call `useActions()` and `useUIState()`.

```tsx
import { AIProvider } from "@/components/components/ai-provider";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AIProvider>{children}</AIProvider>;
}
```

## 5. Render the chat client

Use a client component that:

- reads server actions with `useActions<typeof AI>()`
- stores rendered UI messages with `useUIState<typeof AI>()`
- pushes the user message immediately for optimistic UI
- appends the server-returned React node when the action resolves

Pattern:

```tsx
"use client";

import { useActions, useUIState } from "ai/rsc";
import type { AI } from "@/components/lib/ai";

const [messages, setMessages] = useUIState<typeof AI>();
const { submitUserMessage } = useActions<typeof AI>();
```

Then render a transcript and form input.

## 6. Keep message rendering generic

`components/components/message.tsx` is the useful part of this dossier.

- `TextStreamMessage` renders a `StreamableValue` using `useStreamableValue`
- `Message` renders static assistant/user transcript items
- `Streamdown` is used to safely display markdown-like responses during streaming

## 7. Add tools only when they return useful UI

The RSC value here is **server-rendered UI blocks**, not just text. Keep tools narrow and deterministic.

Example tool definition:

```tsx
tools: {
  showMetric: {
    description: "Render a named metric card",
    parameters: z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }),
    generate: async ({ label, value, description }) => {
      return (
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
          {description ? <p className="text-sm">{description}</p> : null}
        </div>
      );
    },
  },
}
```

# UX rules

- Show the user message immediately after submit.
- Stream assistant text progressively; do not wait for the full completion.
- Keep generated UI compact and task-specific.
- Prefer 1-2 small cards, tables, or status blocks instead of large dashboards from a single prompt.
- Provide empty, loading, and error states.
- Keep the chat input fixed, obvious, and keyboard-friendly.
- Preserve transcript readability; assistant and user messages must be visually distinct.
- If markdown is rendered, ensure prose, code, and lists remain legible in both light and dark themes.

# Avoid

- Do not keep template-specific smart-home demo components like camera views, hub cards, or mock usage datasets unless the user explicitly wants that domain.
- Do not import from app-specific paths such as `@/app/(preview)/actions` in reusable dossier files.
- Do not rely on deprecated or unstable app-local wrappers when plain `ai/rsc` APIs work.
- Do not let the model generate arbitrary large UI trees from vague prompts.
- Do not mix unrelated concerns like analytics, KV persistence, or attachments unless the user asked for them.
- Do not expose provider secrets to the client.
- Do not use this dossier if the app only needs plain text chat via API routes; use a non-RSC AI chat pattern instead.

# Verification

## Manual checks

1. Start the app with `OPENAI_API_KEY` set.
2. Open the page containing `<Chat />`.
3. Submit a plain text prompt like:

```text
Summarize what this app does in three bullet points.
```

Expected result:

- the user message appears immediately
- assistant text streams in progressively
- markdown renders correctly

4. Submit a tool-oriented prompt like:

```text
Show a metric card for monthly revenue of $12,400 with a note that it is up 8%.
```

Expected result:

- the model calls the tool
- a server-rendered UI card appears in the transcript
- no client-side fetch is required for the generated card

## Code-level checks

- `components/lib/ai.ts` contains `createAI(...)`
- the submit action includes a top-level `"use server"`
- the tree is wrapped in `<AIProvider>`
- chat UI uses `useActions` and `useUIState` from `ai/rsc`
- streamed text uses `createStreamableValue` and `useStreamableValue`
- no remaining imports reference removed demo-only files

## Failure modes to fix

- **Hooks throw because no provider exists**: mount `AIProvider` above the chat component.
- **Nothing streams**: confirm `textStream.update(...)` is called before `done`.
- **Provider auth errors**: verify `OPENAI_API_KEY` is present server-side.
- **Build errors from app-specific imports**: remove template-only imports and replace with dossier-local modules.
