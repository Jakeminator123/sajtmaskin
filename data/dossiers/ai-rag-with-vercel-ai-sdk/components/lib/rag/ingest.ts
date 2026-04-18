import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { db } from '@/lib/db';
import { documentChunks, documents } from '@/lib/db/schema';

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://gateway.ai.vercel.com/v1'
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

export async function ingestDocument(input: {
  title: string;
  content: string;
  source?: string;
}) {
  const [document] = await db
    .insert(documents)
    .values({ title: input.title, source: input.source })
    .returning();

  const chunks = chunkText(input.content);

  if (!chunks.length) return document;

  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: chunks
  });

  await db.insert(documentChunks).values(
    chunks.map((content, index) => ({
      documentId: document.id,
      content,
      embedding: embeddings[index] as number[]
    }))
  );

  return document;
}
