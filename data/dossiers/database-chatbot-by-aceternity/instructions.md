# When to use

Use this dossier when the site needs a simple AI chatbot with:

- streamed responses from OpenAI via the Vercel AI SDK
- server-side persistence of completed exchanges in Postgres
- a Next.js App Router backend

This is a good fit for dashboards, internal tools, support assistants, and product UIs that need lightweight chat history storage. It is not a full RAG system, auth system, or multi-tenant chat platform by itself.

# How to integrate

## 1) Install and configure dependencies

Required env vars:

```env
DATABASE_URL="postgres://..."
OPENAI_API_KEY="sk-..."
```

Required packages:

```bash
npm install ai @ai-sdk/openai @neondatabase/serverless
```

## 2) Create the database table

Run SQL like this against your Postgres database:

```sql
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_history_created_at_idx
  ON chat_history (created_at DESC);
```

## 3) Add a reusable Neon data-access module

```ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function insertChatHistory(params: {
  userMessage: string;
  assistantMessage: string;
}) {
  const { userMessage, assistantMessage } = params;

  await sql`
    INSERT INTO chat_history (
      user_message,
      assistant_message,
      created_at
    ) VALUES (
      ${userMessage}, ${assistantMessage}, NOW())
  `;
}
```

Keep all database access on the server.

## 4) Add the chat API route

Use an App Router route handler that streams the assistant response and saves the final exchange after completion.

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { insertChatHistory } from "@/lib/chat-history";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai("gpt-4-turbo"),
    system: "You are a helpful assistant. Answer in markdown.",
    messages,
    onFinish: async ({ text }) => {
      try {
        const lastUserMessage = [...messages]
          .reverse()
          .find((message: { role: string; content: string }) => message.role === "user");

        if (!lastUserMessage?.content || !text) return;

        await insertChatHistory({
          userMessage: lastUserMessage.content,
          assistantMessage: text,
        });
      } catch (error) {
        console.error("Error saving chat history", error);
      }
    },
  });

  return result.toDataStreamResponse();
}
```

Notes:

- Save only after the model finishes so you store the completed assistant response.
- Use the most recent `role === "user"` message rather than assuming the last array item is always the user.
- Keep the system prompt generic; rewrite it to match the site's product and tone.

## 5) Add a history read route if the UI needs previous chats

```ts
import { NextResponse } from "next/server";
import { listChatHistory } from "@/lib/chat-history";

export async function GET() {
  const history = await listChatHistory(50);
  return NextResponse.json({ history });
}
```

## 6) Build your own UI around the route

Do not reuse the template's branded widget blindly. Instead, create a site-appropriate client component and connect it to `/api/chat`.

Typical client usage:

```tsx
"use client";

import { useChat } from "ai/react";

export function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
  });

  return (
    <div>
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong> {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask something..." />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

If you render markdown, sanitize or constrain supported elements based on your app's security posture.

# UX rules

- Match the chat UI to the app's existing design system; avoid dropping in branded demo visuals.
- Show clear loading/streaming state while the assistant is responding.
- Let users distinguish user vs assistant messages instantly.
- Preserve line breaks and markdown formatting if the assistant is instructed to answer in markdown.
- Add an explicit empty state if no chat history exists.
- If history is shown, sort newest-first in the API or oldest-first in the UI intentionally; do not mix both.
- If the app is authenticated, scope history per user before shipping.

# Avoid

- Do not expose `DATABASE_URL` or direct Neon calls in client components.
- Do not assume `messages[messages.length - 1]` is always the latest user message.
- Do not keep provider-specific branding like "Neon" or "Aceternity" unless the user asked for it.
- Do not hardcode a model without checking current provider/model availability and pricing.
- Do not treat this as production-grade memory, analytics, or conversation search; it stores simple message pairs only.
- Do not skip schema creation; the route depends on `chat_history` existing.
- Do not rely on template metadata, landing-page copy, or decorative background components for the integration.

# Verification

## Smoke test

1. Set `DATABASE_URL` and `OPENAI_API_KEY`.
2. Create the `chat_history` table.
3. Start the app.
4. Send a message to `POST /api/chat` through the UI or with a test client.
5. Confirm the response streams successfully.
6. Confirm a row appears in `chat_history` after completion.

## Example request shape

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Explain what serverless Postgres is." }
    ]
  }'
```

## Example DB check

```sql
SELECT id, user_message, assistant_message, created_at
FROM chat_history
ORDER BY created_at DESC
LIMIT 5;
```

## Failure cases to test

- missing `DATABASE_URL`
- missing `OPENAI_API_KEY`
- table does not exist
- OpenAI request fails
- DB insert fails after a successful model response

The route should still return the model response even if persistence fails, while logging the database error server-side.
