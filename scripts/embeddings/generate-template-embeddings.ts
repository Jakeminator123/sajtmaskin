/**
 * Generate embeddings for all templates using OpenAI text-embedding-3-small.
 *
 * Usage:  npx tsx scripts/embeddings/generate-template-embeddings.ts
 * Or:     npm run templates:embeddings
 *
 * Requires OPENAI_API_KEY. Persists to Vercel Blob when BLOB_READ_WRITE_TOKEN
 * is set; always writes a local cache when the FS is writable.
 * Backoffice buttons pass `--require-blob` so a missing token fails closed.
 */

import {
  generateTemplateEmbeddings,
  TEMPLATE_EMBEDDING_BATCH_SIZE,
  TEMPLATE_EMBEDDING_DIMENSIONS,
  TEMPLATE_EMBEDDING_MODEL,
} from "../../src/lib/templates/template-embeddings-core";
import {
  getBlobReadWriteToken,
  saveEmbeddingsArtifact,
} from "../../src/lib/gen/embeddings/embeddings-storage";
import { loadLocalEnv } from "./load-local-env";
import {
  blobSaveFailedMessage,
  missingBlobTokenMessage,
  parseRequireBlobFlag,
  shouldAbortForLocalOnlySave,
  shouldAbortForMissingBlobToken,
} from "./require-blob";

const MODEL = TEMPLATE_EMBEDDING_MODEL;
const DIMENSIONS = TEMPLATE_EMBEDDING_DIMENSIONS;
const BATCH_SIZE = TEMPLATE_EMBEDDING_BATCH_SIZE;

async function main() {
  loadLocalEnv();
  const requireBlob = parseRequireBlobFlag(process.argv.slice(2));
  if (shouldAbortForMissingBlobToken(requireBlob, getBlobReadWriteToken())) {
    console.error(missingBlobTokenMessage());
    process.exit(1);
  }

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

  const saved = await saveEmbeddingsArtifact("template", output);
  if (shouldAbortForLocalOnlySave(requireBlob, saved)) {
    console.error(blobSaveFailedMessage(saved));
    process.exit(1);
  }

  console.info(`\n✅ Saved ${output.embeddings.length} embeddings (${saved.storage})`);
  if (saved.blobUrl) console.info(`   Blob: ${saved.blobUrl}`);
  if (saved.localPath) console.info(`   Local cache: ${saved.localPath}`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
