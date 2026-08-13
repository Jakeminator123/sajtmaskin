/**
 * Generate scaffold embeddings JSON file.
 *
 * Usage:
 *   npx tsx scripts/embeddings/generate-scaffold-embeddings.ts
 *   npm run scaffolds:embeddings
 *
 * Requires OPENAI_API_KEY. Persists to Vercel Blob when BLOB_READ_WRITE_TOKEN
 * is set; always writes a local cache when the FS is writable.
 * Backoffice buttons pass `--require-blob` so a missing token fails closed
 * instead of looking like a successful local-only write.
 */

import { generateScaffoldEmbeddings } from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";
import {
  getBlobReadWriteToken,
  saveEmbeddingsArtifact,
} from "../../src/lib/gen/embeddings/embeddings-storage";
import { invalidateScaffoldEmbeddingsCache } from "../../src/lib/gen/scaffolds/scaffold-search";
import { loadLocalEnv } from "./load-local-env";
import {
  blobSaveFailedMessage,
  missingBlobTokenMessage,
  parseRequireBlobFlag,
  shouldAbortForLocalOnlySave,
  shouldAbortForMissingBlobToken,
} from "./require-blob";

async function main() {
  loadLocalEnv();
  const requireBlob = parseRequireBlobFlag(process.argv.slice(2));
  if (shouldAbortForMissingBlobToken(requireBlob, getBlobReadWriteToken())) {
    console.error(missingBlobTokenMessage());
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Set it in .env.local or environment.");
    process.exit(1);
  }

  console.info("Generating scaffold embeddings...");

  const result = await generateScaffoldEmbeddings({ apiKey });
  const saved = await saveEmbeddingsArtifact("scaffold", result);
  if (shouldAbortForLocalOnlySave(requireBlob, saved)) {
    console.error(blobSaveFailedMessage(saved));
    process.exit(1);
  }
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
