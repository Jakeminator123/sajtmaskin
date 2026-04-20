import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentChunks } from '@/lib/db/schema';

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://gateway.ai.vercel.com/v1'
});

export type RetrievedChunk = {
  id: string;
  content: string;
  similarity: number;
};

export async function findRelevantChunks(query: string, limit = 5): Promise<RetrievedChunk[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query
  });

  const embeddingSql = sql.raw(`'[${embedding.join(',')}]'`);

  const rows = await db.execute(sql`
    select
      id,
      content,
      1 - (embedding <=> ${embeddingSql}::vector) as similarity
    from document_chunks
    order by embedding <=> ${embeddingSql}::vector
    limit ${limit}
  `);

  return rows.map((row: any) => ({
    id: row.id,
    content: row.content,
    similarity: Number(row.similarity)
  }));
}
