/**
 * Generate embeddings for all templates using OpenAI text-embedding-3-small.
 *
 * Usage:  npx tsx scripts/generate-template-embeddings.ts
 * Or:     npm run templates:embeddings
 *
 * Requires OPENAI_API_KEY in environment (or .env.local).
 * Output:  src/lib/templates/template-embeddings.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  generateTemplateEmbeddings,
  TEMPLATE_EMBEDDING_BATCH_SIZE,
  TEMPLATE_EMBEDDING_DIMENSIONS,
  TEMPLATE_EMBEDDING_MODEL,
} from "../src/lib/templates/template-embeddings-core";

const MODEL = TEMPLATE_EMBEDDING_MODEL;
const DIMENSIONS = TEMPLATE_EMBEDDING_DIMENSIONS;
const BATCH_SIZE = TEMPLATE_EMBEDDING_BATCH_SIZE;
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../src/lib/templates/template-embeddings.json",
);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  console.info(`🧠 Model: ${MODEL} (${DIMENSIONS} dimensions)`);

  const output = await generateTemplateEmbeddings({
    apiKey,
    batchSize: BATCH_SIZE,
    onBatchProgress: ({ batch, totalBatches, batchSize }) => {
      console.info(`  Batch ${batch}/${totalBatches} (${batchSize} templates)...`);
    },
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf-8");

  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.info(`\n✅ Saved ${output.embeddings.length} embeddings to ${OUTPUT_PATH}`);
  console.info(`   File size: ${fileSizeMB} MB`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
