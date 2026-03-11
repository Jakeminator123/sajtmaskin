import OpenAI from "openai";
import { getTemplateLibraryEntries } from "./catalog";
import type { TemplateLibraryEntry } from "./types";

export const TEMPLATE_LIBRARY_EMBEDDING_MODEL = "text-embedding-3-small";
export const TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS = 1536;

export interface TemplateLibraryEmbeddingEntry {
  id: string;
  embedding: number[];
}

export interface TemplateLibraryEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: TemplateLibraryEmbeddingEntry[];
}

function buildEmbeddingText(entry: TemplateLibraryEntry): string {
  return [
    `Template: ${entry.title}`,
    `Category: ${entry.categoryName} (${entry.categorySlug})`,
    `Description: ${entry.description}`,
    `Verdict: ${entry.verdict}`,
    `Quality score: ${entry.qualityScore}`,
    `Scaffold families: ${entry.recommendedScaffoldFamilies.join(", ")}`,
    `Strengths: ${entry.strengths.join(", ")}`,
    `Signals: ${Object.entries(entry.signals)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(", ")}`,
    `Stack tags: ${entry.stackTags.join(", ")}`,
    `Summary: ${entry.summary}`,
  ].join("\n");
}

export function getTemplateLibraryEmbeddingInputs(): Array<{ id: string; text: string }> {
  return getTemplateLibraryEntries().map((entry) => ({
    id: entry.id,
    text: buildEmbeddingText(entry),
  }));
}

export async function generateTemplateLibraryEmbeddings(options: {
  apiKey: string;
  model?: string;
  dimensions?: number;
}): Promise<TemplateLibraryEmbeddingsFile> {
  const model = options.model ?? TEMPLATE_LIBRARY_EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS;
  const openai = new OpenAI({ apiKey: options.apiKey });
  const inputs = getTemplateLibraryEmbeddingInputs();

  const response = await openai.embeddings.create({
    model,
    input: inputs.map((entry) => entry.text),
    dimensions,
  });

  if (response.data.length !== inputs.length) {
    throw new Error(`Embedding count mismatch: expected ${inputs.length}, got ${response.data.length}`);
  }

  return {
    _meta: {
      model,
      dimensions,
      generated: new Date().toISOString(),
      count: inputs.length,
    },
    embeddings: inputs.map((entry, index) => ({
      id: entry.id,
      embedding: response.data[index].embedding,
    })),
  };
}
