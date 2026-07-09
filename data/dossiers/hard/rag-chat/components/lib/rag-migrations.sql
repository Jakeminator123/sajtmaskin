-- RAG pgvector migration — run this ONCE against your Postgres BEFORE enabling
-- the chat route. There is NO auto-migration at boot: apply this manually with
-- psql, your provider's SQL console, or a migration tool. Requires a database
-- where the `vector` (pgvector) extension is available.
--
-- The embedding dimension (1536) MUST match the model used in
-- lib/rag/ingest.ts and lib/rag/retrieval.ts (text-embedding-3-small) and the
-- vector column in lib/db/schema.ts. Change all three together if you switch
-- embedding models.

CREATE EXTENSION IF NOT EXISTS vector;
-- gen_random_uuid() is built into Postgres 13+. pgcrypto is a safe fallback for
-- older servers; harmless if already present.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);

-- Approximate nearest-neighbour index for cosine distance (matches the
-- `1 - (embedding <=> query)` similarity in lib/rag/retrieval.ts). Build it
-- AFTER ingesting a representative amount of data — ivfflat needs rows to train
-- its `lists` partitions. Raise `lists` for larger corpora.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
