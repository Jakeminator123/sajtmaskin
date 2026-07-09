import 'server-only';

import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

import { getDb } from '@/lib/rag/db';
import { documentChunks, documents } from '@/lib/rag/db/schema';

// Lazy: the default `openai` provider reads OPENAI_API_KEY at call time only.
// Wire this to the app's content source (CMS sync, admin action, script, or a
// scheduled job) — the dossier ships no ingestion route on purpose. Callers
// should gate on `isRagConfigured()` from `@/lib/rag/config` first.
const EMBEDDING_MODEL = 'text-embedding-3-small';

export function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
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

export async function ingestDocument(input: {
  title: string;
  content: string;
  source?: string;
}) {
  const db = getDb();

  const [document] = await db
    .insert(documents)
    .values({ title: input.title, source: input.source })
    .returning();

  const chunks = chunkText(input.content);

  if (!chunks.length) return document;

  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: chunks,
  });

  await db.insert(documentChunks).values(
    chunks.map((content, index) => ({
      documentId: document.id,
      content,
      embedding: embeddings[index] as number[],
    })),
  );

  return document;
}
