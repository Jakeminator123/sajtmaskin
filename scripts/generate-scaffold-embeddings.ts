/**
 * Generate scaffold embeddings JSON file.
 *
 * Usage:
 *   npx tsx scripts/generate-scaffold-embeddings.ts
 *
 * Requires OPENAI_API_KEY in environment.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateScaffoldEmbeddings } from "../src/lib/gen/scaffolds/scaffold-embeddings-core";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  console.info("Generating scaffold embeddings...");

  const result = await generateScaffoldEmbeddings({ apiKey });

  const outPath = resolve(
    "src/lib/gen/scaffolds/scaffold-embeddings.json",
  );
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  console.info(
    `Generated ${result.embeddings.length} scaffold embeddings -> ${outPath}`,
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
