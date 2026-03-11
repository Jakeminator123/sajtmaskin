import OpenAI from "openai";
import { getAllScaffolds } from "./registry";
import type { ScaffoldManifest } from "./types";

export const SCAFFOLD_EMBEDDING_MODEL = "text-embedding-3-small";
export const SCAFFOLD_EMBEDDING_DIMENSIONS = 1536;

export interface ScaffoldEmbeddingEntry {
  id: string;
  embedding: number[];
}

export interface ScaffoldEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: ScaffoldEmbeddingEntry[];
}

function buildEmbeddingText(scaffold: ScaffoldManifest): string {
  const filePaths = scaffold.files.map((f) => f.path).join(", ");
  return [
    `Scaffold: ${scaffold.label}`,
    `Family: ${scaffold.family}`,
    `Description: ${scaffold.description}`,
    `Tags: ${scaffold.tags.join(", ")}`,
    `Build intents: ${scaffold.buildIntents.join(", ")}`,
    `Prompt hints: ${scaffold.promptHints.join("; ")}`,
    `Quality checklist: ${scaffold.qualityChecklist?.join("; ") ?? ""}`,
    `Upgrade targets: ${scaffold.research?.upgradeTargets.join("; ") ?? ""}`,
    `Reference templates: ${
      scaffold.research?.referenceTemplates
        .map((template) => `${template.title} (${template.categorySlug})`)
        .join("; ") ?? ""
    }`,
    `Files: ${filePaths}`,
  ].join("\n");
}

export function getScaffoldEmbeddingInputs(): Array<{ id: string; text: string }> {
  return getAllScaffolds().map((s) => ({
    id: s.id,
    text: buildEmbeddingText(s),
  }));
}

export interface GenerateScaffoldEmbeddingsOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
}

export async function generateScaffoldEmbeddings(
  options: GenerateScaffoldEmbeddingsOptions,
): Promise<ScaffoldEmbeddingsFile> {
  const model = options.model ?? SCAFFOLD_EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? SCAFFOLD_EMBEDDING_DIMENSIONS;
  const openai = new OpenAI({ apiKey: options.apiKey });
  const inputs = getScaffoldEmbeddingInputs();

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

  const embeddings: ScaffoldEmbeddingEntry[] = inputs.map((input, idx) => ({
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
