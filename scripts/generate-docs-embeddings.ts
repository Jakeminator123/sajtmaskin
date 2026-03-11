#!/usr/bin/env npx tsx
/**
 * Generate precomputed embeddings for docs snippets.
 * Run: npx tsx scripts/generate-docs-embeddings.ts
 *
 * Requires OPENAI_API_KEY in environment or .env.local.
 * Output: src/lib/gen/data/docs-embeddings.json
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { generateDocsEmbeddings } from "../src/lib/gen/data/docs-embeddings-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env.local") });

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Set it in .env.local or environment.");
    process.exit(1);
  }

  console.info("Generating docs embeddings...");
  const result = await generateDocsEmbeddings({ apiKey });

  const outPath = resolve(__dirname, "..", "src", "lib", "gen", "data", "docs-embeddings.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  console.info(`Done. ${result._meta.count} embeddings written to ${outPath}`);
  console.info(`Model: ${result._meta.model}, dimensions: ${result._meta.dimensions}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
