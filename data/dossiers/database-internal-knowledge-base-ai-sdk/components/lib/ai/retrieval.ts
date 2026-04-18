import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";

export async function embedText(value: string) {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value,
  });

  return embedding;
}

export async function findRelevantChunks(query: string, limit = 6) {
  const queryEmbedding = await embedText(query);

  const similarity = sql<number>`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;

  const rows = await db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      content: documentChunks.content,
      sourceUrl: documentChunks.sourceUrl,
      chunkIndex: documentChunks.chunkIndex,
      similarity,
    })
    .from(documentChunks)
    .where(sql`${similarity} > 0.6`)
    .orderBy(desc(similarity))
    .limit(limit);

  return rows;
}

export function buildContext(chunks: Array<{ content: string; sourceUrl?: string | null }>) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.sourceUrl ? `Source: ${chunk.sourceUrl}\n` : "";
      return `[${index + 1}]\n${source}${chunk.content}`;
    })
    .join("\n\n");
}
