# When to use

- Use for a site assistant that answers from the app's OWN indexed content — docs, policies, posts, product records, a knowledge base.
- Use only on explicit RAG / "chat with our documents" intent. A plain conversational chatbot with no retrieval is the `ai-chat` capability (openai-chat), NOT this dossier.
- Use only when the project can provide a pgvector-capable Postgres and a real ingestion/indexing path.
- Good fit for documentation sites, content sites, support portals, and internal knowledge tools.

# How to integrate

- Install the listed AI SDK, Drizzle, and Postgres dependencies.
- Add `OPENAI_API_KEY` and `DATABASE_URL` as server-only environment variables (never `NEXT_PUBLIC_*`).
- Enable pgvector and create the tables: run the shipped `lib/rag-migrations.sql` ONCE against your Postgres (psql, the provider's SQL console, or a migration tool). There is NO auto-migration at boot — the app never runs DDL on startup.
- Demo mode is built in (mock: canned): when `OPENAI_API_KEY` or `DATABASE_URL` is missing or a preview placeholder, `/api/chat` streams a canned demo reply over the SAME UI-message stream protocol — never a 500. Do not invent your own fallback.
- Gate server-side RAG surfaces on `isRagConfigured()` from `@/lib/rag/config` (placeholder-guards on BOTH keys) and mount `<Chat ragConfigured={isRagConfigured()} />` from a Server Component so the discreet "RAG i demo-läge" notice renders when unconfigured.
- Access the database ONLY through `getDb()` / `getPool()` from `@/lib/db` — never construct a Pool or Drizzle client yourself, and never at module level.
- Wire `ingestDocument()` to the app's content source (CMS sync, admin action, script, or a scheduled job). The dossier ships no ingestion route on purpose.
- Keep `/api/chat` a server-only route; the chat streaming protocol uses the AI SDK UI-message transport (`convertToModelMessages` + `toUIMessageStreamResponse`).

# UX rules

- Tell users the assistant answers from indexed site content.
- Show a clear loading/streaming state while the answer is generated.
- Prefer "I don't know" when retrieved context is missing or weak.
- If trust matters, show source titles/snippets/links (retrieval returns `title`, `source`, and `documentId` alongside each chunk).
- Provide practical empty-state copy explaining what the assistant can answer about.
- Make re-indexing / content refresh possible when source content changes.

# Avoid

- Do not use this for a plain chatbot that does not need retrieval (that is `ai-chat`).
- Do not construct env-dependent OpenAI or database clients at import time — the route, retrieval, and ingest use the lazy default provider and `getDb()`.
- Do not ship it without an ingestion flow; an empty vector table produces poor answers.
- Do not dump whole documents into prompts; retrieve a small set of high-signal chunks.
- Do not mismatch embedding dimensions between the model, the schema, and the migration (all 1536 for text-embedding-3-small).
- Do not run the migration automatically at boot, and do not expose server-only keys to the client.
- Do not replace the built-in canned demo fallback with a hard error or your own mock.

# Verification

- With `OPENAI_API_KEY` or `DATABASE_URL` missing (or a preview/placeholder stub): the chat renders, shows the "RAG i demo-läge" notice, and streams the canned demo reply — no 500, no crash.
- Confirm both env vars hold real values for real answers.
- Confirm Postgres is reachable and pgvector is enabled; run `lib/rag-migrations.sql` and verify `documents` and `document_chunks` exist.
- Ingest at least one test document and verify embeddings are stored.
- Ask a question covered by the indexed document and confirm a grounded answer streams back; ask an uncovered question and confirm the assistant declines.
- Check that `POST /api/chat` returns a streaming UI-message response for the installed AI SDK version.
