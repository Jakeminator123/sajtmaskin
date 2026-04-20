# When to use

Use this dossier when you need an assistant or chat UI that answers from your own content, docs, policies, knowledge base, or internal records. Choose it when the app needs:

- grounded answers from indexed content
- streaming chat responses in Next.js
- PostgreSQL-backed storage for chunks and embeddings
- a clear ingestion + retrieval + generation pipeline

Do **not** use this dossier for a plain LAG-free chatbot, a marketing-only demo, or if there is no content source to index.

# How to integrate

## 1) Install and configure the core stack

Required environment variables:

```bash
DATABASE_URL=postgres://...
AI_GATEWAY_API_KEY=...
```

Use a typed env module so both Drizzle config and server code read the same values:

```ts
// lib/env.mjs
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AI_GATEWAY_API_KEY: z.string().min(1),
  },
  experimental__runtimeEnv: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  },
});
```

Keep Drizzle configured against the Postgres database:

```ts
// drizzle.config.ts
import type { Config } from 'drizzle-kit';
import { env } from '@/lib/env.mjs';

export default {
  schema: './lib/db/schema',
  dialect: 'postgresql',
  out: './lib/db/migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;
```

## 2) Create schema for documents and embedded chunks

A minimal schema:

```ts
import { pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Important: this pattern assumes Postgres with the `pgvector` extension enabled.

## 3) Add ingestion that chunks content and stores embeddings

RAG is only useful if your content is indexed first.

```ts
import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://gateway.ai.vercel.com/v1',
});

export function chunkText(text: string, chunkSize = 1200, overlap = 200) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
```

Then embed and insert each chunk into `document_chunks`. Re-ingest when source content changes.

## 4) Add retrieval before generation

At request time, embed the user query and run vector similarity search:

```ts
import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { sql } from 'drizzle-orm';

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://gateway.ai.vercel.com/v1',
});

export async function findRelevantChunks(query: string) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });

  const embeddingSql = sql.raw(`'[${embedding.join(',')}]'`);

  return db.execute(sql`
    select id, content, 1 - (embedding <=> ${embeddingSql}::vector) as similarity
    from document_chunks
    order by embedding <=> ${embeddingSql}::vector
    limit 5
  `);
}
```

Only pass the most relevant chunks into the model prompt. Keep the context window small and high-signal.

## 5) Stream responses from an API route

Use `streamText` in a route handler:

```ts
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const query = latestUserMessage?.content?.map?.((p: any) => p.type === 'text' ? p.text : '').join(' ') || '';

  const chunks = await findRelevantChunks(query);
  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    system: 'Answer using the provided context. If unsupported by context, say you do not know.',
    messages,
    prompt: context ? `Relevant context:\n\n${context}` : undefined,
  });

  return result.toDataStreamResponse();
}
```

## 6) Connect a client chat UI with `useChat`

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});
```

This dossier does not require a specific visual design. Reuse the app’s own form, cards, typography, and layout system.

# UX rules

- Make it explicit that answers are based on indexed content.
- Show loading/streaming state while the model is responding.
- If retrieval returns weak or no context, prefer a graceful “I don’t know” response over hallucination.
- If the product depends on trust, show sources, titles, or snippets from retrieved documents.
- Allow re-indexing or content refresh if the underlying knowledge base changes.
- Keep empty state copy practical: explain what the assistant can answer about.

# Avoid

- Do not ship template-branded overview cards, vendor logos, or tutorial copy.
- Do not use RAG without an ingestion path; a chat UI alone is not enough.
- Do not dump entire documents into the prompt on every request.
- Do not store embeddings in an incompatible schema dimension.
- Do not answer confidently when retrieval found no support.
- Do not expose server-only credentials to the client.

# Verification

1. Confirm env vars are present and readable on the server.
2. Confirm Postgres is reachable and `pgvector` is enabled.
3. Run Drizzle migrations and verify `documents` and `document_chunks` exist.
4. Ingest at least one test document.
5. Ask a question that should be answerable from the indexed content.
6. Ask a question that is not covered and verify the assistant declines instead of inventing.
7. Verify the `/api/chat` route streams tokens instead of waiting for a full response.
8. If sources are shown in the UI, confirm they match the retrieved content.
