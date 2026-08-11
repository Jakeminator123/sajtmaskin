/**
 * Generate scaffold embeddings JSON file.
 *
 * Usage:
 *   npx tsx scripts/embeddings/generate-scaffold-embeddings.ts
 *   npm run scaffolds:embeddings
 *
 * Requires OPENAI_API_KEY. Persists to Vercel Blob when BLOB_READ_WRITE_TOKEN
 * is set; always writes a local cache when the FS is writable.
 */

import "dotenv/config";
import { generateScaffoldEmbeddings } from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";
import { saveEmbeddingsArtifact } from "../../src/lib/gen/embeddings/embeddings-storage";
import { invalidateScaffoldEmbeddingsCache } from "../../src/lib/gen/scaffolds/scaffold-search";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Set it in .env.local or environment.");
    process.exit(1);
  }

  console.info("Generating scaffold embeddings...");

  const result = await generateScaffoldEmbeddings({ apiKey });
  const saved = await saveEmbeddingsArtifact("scaffold", result);
  invalidateScaffoldEmbeddingsCache();

  console.info(
    `Generated ${result.embeddings.length} scaffold embeddings (${saved.storage})`,
  );
  if (saved.blobUrl) console.info(`  Blob: ${saved.blobUrl}`);
  if (saved.localPath) console.info(`  Local cache: ${saved.localPath}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
