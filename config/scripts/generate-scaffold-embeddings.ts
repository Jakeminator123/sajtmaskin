/**
 * Generate embeddings for all runtime scaffolds using OpenAI text-embedding-3-small.
 *
 * Usage:  npx tsx config/scripts/generate-scaffold-embeddings.ts
 * Or:     npm run scaffolds:embeddings
 *
 * Requires OPENAI_API_KEY in environment (or .env.local).
 * Output:  src/lib/gen/scaffolds/scaffold-embeddings.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  generateScaffoldEmbeddings,
  SCAFFOLD_EMBEDDING_MODEL,
  SCAFFOLD_EMBEDDING_DIMENSIONS,
  getScaffoldEmbeddingInputs,
} from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../../src/lib/gen/scaffolds/scaffold-embeddings.json",
);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  const inputs = getScaffoldEmbeddingInputs();
  console.info(
    `Model: ${SCAFFOLD_EMBEDDING_MODEL} (${SCAFFOLD_EMBEDDING_DIMENSIONS} dimensions)`,
  );
  console.info(`Scaffolds: ${inputs.length}`);

  const output = await generateScaffoldEmbeddings({ apiKey });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf-8");

  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.info(
    `Saved ${output.embeddings.length} embeddings to ${OUTPUT_PATH}`,
  );
  console.info(`File size: ${fileSizeMB} MB`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
