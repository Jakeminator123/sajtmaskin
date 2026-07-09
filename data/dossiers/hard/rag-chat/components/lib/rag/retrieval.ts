import 'server-only';

import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from 'drizzle-orm';

import { getDb } from '@/lib/db';

// The default `openai` provider reads OPENAI_API_KEY lazily at call time — no
// module-level client construction, no import-time env read. Callers gate on
// `isRagConfigured()` from `@/lib/rag/config` before invoking retrieval.
const EMBEDDING_MODEL = 'text-embedding-3-small';

export type RetrievedChunk = {
  id: string;
  content: string;
  similarity: number;
  documentId: string;
  title: string | null;
  source: string | null;
};

export async function findRelevantChunks(
  query: string,
  limit = 5,
): Promise<RetrievedChunk[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: query,
  });

  // Bind the embedding as a single text parameter cast to ::vector. Numbers are
  // safe to interpolate, but binding keeps the query parameterized end-to-end.
  const vectorLiteral = `[${embedding.join(',')}]`;

  const result = await getDb().execute(sql`
    select
      c.id,
      c.content,
      c.document_id as "documentId",
      d.title,
      d.source,
      1 - (c.embedding <=> ${vectorLiteral}::vector) as similarity
    from document_chunks c
    left join documents d on d.id = c.document_id
    order by c.embedding <=> ${vectorLiteral}::vector
    limit ${limit}
  `);

  const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown[]);
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    content: String(row.content),
    similarity: Number(row.similarity),
    documentId: String(row.documentId),
    title: row.title == null ? null : String(row.title),
    source: row.source == null ? null : String(row.source),
  }));
}
