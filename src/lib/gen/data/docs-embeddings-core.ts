/**
 * Precomputed embedding infrastructure for docs snippets.
 * Same pattern as scaffold-embeddings-core.ts — generate once, load at runtime.
 */
import OpenAI from "openai";
import { DOCS_SNIPPETS, type DocSnippet } from "./docs-snippets";

export const DOCS_EMBEDDING_MODEL = "text-embedding-3-small";
export const DOCS_EMBEDDING_DIMENSIONS = 1536;

export interface DocsEmbeddingEntry {
  id: string;
  embedding: number[];
}

export interface DocsEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: DocsEmbeddingEntry[];
}

function buildEmbeddingText(snippet: DocSnippet): string {
  return [
    `Title: ${snippet.title}`,
    `Category: ${snippet.category}`,
    `Keywords: ${snippet.keywords.join(", ")}`,
    `Content: ${snippet.content.slice(0, 600)}`,
  ].join("\n");
}

export function getDocsEmbeddingInputs(): Array<{ id: string; text: string }> {
  return DOCS_SNIPPETS.map((s) => ({
    id: s.id,
    text: buildEmbeddingText(s),
  }));
}

export async function generateDocsEmbeddings(options: {
  apiKey: string;
  model?: string;
  dimensions?: number;
}): Promise<DocsEmbeddingsFile> {
  const model = options.model ?? DOCS_EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? DOCS_EMBEDDING_DIMENSIONS;
  const openai = new OpenAI({ apiKey: options.apiKey });
  const inputs = getDocsEmbeddingInputs();

  const response = await openai.embeddings.create({
    model,
    input: inputs.map((i) => i.text),
    dimensions,
  });

  if (response.data.length !== inputs.length) {
    throw new Error(
      `Embedding count mismatch: expected ${inputs.length}, got ${response.data.length}`,
    );
  }

  const embeddings: DocsEmbeddingEntry[] = inputs.map((input, idx) => ({
    id: input.id,
    embedding: response.data[idx].embedding,
  }));

  return {
    _meta: {
      model,
      dimensions,
      generated: new Date().toISOString(),
      count: embeddings.length,
    },
    embeddings,
  };
}
