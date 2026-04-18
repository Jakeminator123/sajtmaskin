import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";
import { embedText } from "@/lib/ai/retrieval";
import { getPdfContentFromUrl } from "@/utils/pdf";

export async function ingestPdfFromUrl(input: {
  title: string;
  url: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}) {
  const text = await getPdfContentFromUrl(input.url);

  const [document] = await db
    .insert(documents)
    .values({
      title: input.title,
      sourceUrl: input.url,
      mimeType: input.mimeType ?? "application/pdf",
      metadata: input.metadata ?? {},
    })
    .returning();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitText(text);

  const rows = await Promise.all(
    chunks.map(async (content, chunkIndex) => ({
      documentId: document.id,
      chunkIndex,
      content,
      sourceUrl: input.url,
      embedding: await embedText(content),
    })),
  );

  if (rows.length > 0) {
    await db.insert(documentChunks).values(rows);
  }

  return {
    documentId: document.id,
    chunkCount: rows.length,
  };
}
