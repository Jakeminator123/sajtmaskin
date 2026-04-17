/**
 * Generate dossier embeddings JSON file.
 *
 * Reads: data/dossiers/_index/master.json (must be built first via
 *        `npx tsx scripts/dossiers/build-dossier-index.ts`)
 * Output: data/dossiers/_index/dossier-embeddings.json
 *
 * Embedding text per dossier:
 *   "{label}\n{description}\n{summary}\nTags: {tags}\nCategory: {category}"
 *
 * Used at runtime by orchestrate.ts (next migration step) to match
 * user prompt + brief against available dossiers via cosine similarity.
 *
 * Usage:
 *   npx tsx scripts/dossiers/generate-dossier-embeddings.ts
 *
 * Requires OPENAI_API_KEY (loaded from .env.local via dotenv).
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import OpenAI from "openai";

const WORKSPACE_ROOT = process.cwd();
const INDEX_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers", "_index");
const MASTER_PATH = join(INDEX_ROOT, "master.json");
const OUTPUT_PATH = join(INDEX_ROOT, "dossier-embeddings.json");

const DOSSIER_EMBEDDING_MODEL = "text-embedding-3-small";
const DOSSIER_EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI accepts up to 2048 inputs per call but stay polite.

interface MasterIndexDossier {
  id: string;
  kind: "integration" | "ui-section";
  category: string;
  label: string;
  description: string;
  summary: string;
  tags: string[];
}

interface MasterIndexFile {
  generatedAt: string;
  totalDossiers: number;
  dossiers: MasterIndexDossier[];
}

interface DossierEmbeddingEntry {
  id: string;
  kind: "integration" | "ui-section";
  category: string;
  embedding: number[];
}

interface DossierEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    sourceMasterGenerated: string;
    count: number;
  };
  embeddings: DossierEmbeddingEntry[];
}

function buildEmbeddingText(dossier: MasterIndexDossier): string {
  return [
    `Dossier: ${dossier.label}`,
    `Kind: ${dossier.kind}`,
    `Category: ${dossier.category}`,
    `Description: ${dossier.description}`,
    `Summary: ${dossier.summary}`,
    `Tags: ${dossier.tags.join(", ")}`,
  ].join("\n");
}

async function embedBatch(
  openai: OpenAI,
  inputs: string[],
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: DOSSIER_EMBEDDING_MODEL,
    input: inputs,
    dimensions: DOSSIER_EMBEDDING_DIMENSIONS,
  });
  if (response.data.length !== inputs.length) {
    throw new Error(
      `Batch embedding count mismatch: expected ${inputs.length}, got ${response.data.length}`,
    );
  }
  return response.data.map((d) => d.embedding);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Set it in .env.local or environment.");
    process.exit(1);
  }

  if (!existsSync(MASTER_PATH)) {
    console.error(`Missing ${MASTER_PATH}. Run build-dossier-index.ts first.`);
    process.exit(1);
  }

  const master: MasterIndexFile = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));
  if (master.totalDossiers === 0) {
    console.error("[embed] master.json has 0 dossiers. Nothing to embed.");
    process.exit(1);
  }

  console.log(`[embed] Embedding ${master.totalDossiers} dossiers`);

  const openai = new OpenAI({ apiKey });
  const allEmbeddings: DossierEmbeddingEntry[] = [];

  for (let i = 0; i < master.dossiers.length; i += BATCH_SIZE) {
    const batch = master.dossiers.slice(i, i + BATCH_SIZE);
    const batchVectors = await embedBatch(
      openai,
      batch.map(buildEmbeddingText),
    );
    for (let j = 0; j < batch.length; j += 1) {
      allEmbeddings.push({
        id: batch[j]!.id,
        kind: batch[j]!.kind,
        category: batch[j]!.category,
        embedding: batchVectors[j]!,
      });
    }
    console.log(`[embed]   batch ${Math.floor(i / BATCH_SIZE) + 1}: +${batch.length}`);
  }

  const output: DossierEmbeddingsFile = {
    _meta: {
      model: DOSSIER_EMBEDDING_MODEL,
      dimensions: DOSSIER_EMBEDDING_DIMENSIONS,
      generated: new Date().toISOString(),
      sourceMasterGenerated: master.generatedAt,
      count: allEmbeddings.length,
    },
    embeddings: allEmbeddings,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`[embed] Wrote ${allEmbeddings.length} embeddings to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
