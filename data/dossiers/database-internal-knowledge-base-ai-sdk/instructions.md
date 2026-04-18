# When to use

Use this dossier when the site needs a private chat or assistant that answers from internal documents instead of only the model's general knowledge. Typical use cases:

- employee handbook or operations assistant
- support/internal docs search with chat answers
- product manuals, SOPs, PDF archives, or policy documents
- authenticated app areas where users ask questions over proprietary content

This dossier is for **RAG in Next.js with the AI SDK**, using:

- OpenAI for generation and embeddings
- Postgres + pgvector for chunk storage and similarity search
- optional Blob storage for raw uploaded files
- optional auth protection around ingestion and chat routes

# How to integrate

## 1) Install and configure dependencies

Core packages already implied by this dossier:

```bash
npm install ai @ai-sdk/openai drizzle-orm postgres @langchain/textsplitters pdf-parse
npm install -D drizzle-kit
```

Required env:

```env
OPENAI_API_KEY=...
POSTGRES_URL=...
```

Optional, if storing raw files in Vercel Blob:

```env
BLOB_READ_WRITE_TOKEN=...
```

If the app already has auth, restrict ingestion routes and any internal-only chat surface.

## 2) Create the database schema

Use a `documents` table plus a `document_chunks` table with a `vector(1536)` embedding column for `text-embedding-3-small`.

Example Drizzle schema:

```ts
import { index, integer, jsonb, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  mimeType: text("mime_type"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentIdIdx: index("document_chunks_document_id_idx").on(table.documentId),
    embeddingIdx: index("document_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);
```

Important: Postgres must have the `vector` extension enabled.

Example SQL migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 3) Add a shared DB client

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const client = postgres(process.env.POSTGRES_URL!, { prepare: false });
export const db = drizzle(client);
```

## 4) Ingest documents into chunks + embeddings

For PDFs, parse the file text, split it into chunks, embed each chunk, and store the rows.

Example ingestion flow:

```ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 200,
});

const chunks = await splitter.splitText(fullDocumentText);

for (const [index, chunk] of chunks.entries()) {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: chunk,
  });

  // insert chunk + embedding into document_chunks
}
```

The included PDF utility is server-only:

```ts
import pdf from "pdf-parse";

export async function getPdfContentFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdf(buffer);
  return data.text;
}
```

Use Blob or another object store if users upload files and you need durable raw file storage before extraction.

## 5) Retrieve relevant chunks at chat time

Embed the latest user question, run a vector similarity search, then inject the matched chunks into the model's system context.

Example retrieval logic:

```ts
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { desc, sql } from "drizzle-orm";

const { embedding: queryEmbedding } = await embed({
  model: openai.embedding("text-embedding-3-small"),
  value: userQuery,
});

const similarity = sql<number>`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;

const chunks = await db
  .select({
    content: documentChunks.content,
    sourceUrl: documentChunks.sourceUrl,
    similarity,
  })
  .from(documentChunks)
  .where(sql`${similarity} > 0.6`)
  .orderBy(desc(similarity))
  .limit(6);
```

## 6) Build the AI SDK chat route

The most important pattern is: **retrieve first, then pass context to `streamText`**.

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const query = latestUserMessage?.content?.trim();

  if (!query) {
    return new Response("Missing user query", { status: 400 });
  }

  const chunks = await findRelevantChunks(query);
  const context = chunks
    .map((chunk, i) => `[${i + 1}] ${chunk.sourceUrl ?? "internal"}\n${chunk.content}`)
    .join("\n\n");

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: [
      "Answer using the internal knowledge base context.",
      "If the answer is not supported by the context, say you do not know.",
      `Context:\n\n${context}`,
    ].join("\n\n"),
    messages,
  });

  return result.toDataStreamResponse();
}
```

## 7) Protect internal routes

If this is truly internal knowledge, do not leave ingestion endpoints public. At minimum:

- require authentication for ingestion/admin routes
- consider auth for chat routes too
- separate public marketing pages from internal KB routes
- log who uploaded or changed documents if auditability matters

## 8) Keep provider concerns separated

Recommended split:

- `lib/db/*` for schema/client
- `lib/ingest/*` for parsing/chunking/embedding
- `lib/ai/*` for retrieval and prompt assembly
- `app/api/chat/route.ts` for runtime chat orchestration only

# UX rules

- Clearly label answers as based on internal docs.
- Show citations or source links when possible.
- If retrieval returns weak/no matches, say so instead of fabricating an answer.
- Provide a path to improve content quality: “Upload document”, “Re-index”, or “Contact admin”.
- For internal tools, include document freshness metadata if stale answers are risky.
- Stream the answer, but avoid streaming hidden chain-of-thought or raw retrieval scores.
- If the app supports uploads, show ingestion progress and failure states for large PDFs.

# Avoid

- Do not answer from model knowledge when the KB has no supporting context.
- Do not store embeddings in JSON arrays when pgvector is available.
- Do not expose raw internal documents through public URLs unless explicitly intended.
- Do not use client-side PDF parsing for sensitive files; keep extraction on the server.
- Do not hardcode template branding, navbars, demo metadata, or auth assumptions into this integration.
- Do not mix ingestion logic directly into UI components.
- Do not forget that embedding dimensions must match the model used to generate them.

# Verification

- Confirm `POSTGRES_URL` and `OPENAI_API_KEY` are set.
- Confirm `CREATE EXTENSION vector` has been run in the database.
- Run Drizzle migrations successfully.
- Ingest at least one known PDF/document and verify chunk rows are created.
- Query the DB and confirm embeddings exist in `document_chunks`.
- Ask a question whose answer is explicitly present in the ingested document.
- Ask a question not covered by the documents; the assistant should say it does not know.
- If auth is enabled, verify anonymous users cannot ingest or access internal routes.
- If Blob is used, verify uploaded files are persisted and their text is extractable.
