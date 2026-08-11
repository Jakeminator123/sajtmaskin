/**
 * Download embedding artifacts from Vercel Blob / public manifest into local cache.
 *
 * Usage:
 *   npx tsx scripts/embeddings/sync-embeddings-from-blob.ts
 *   npm run embeddings:sync
 *
 * Prefers BLOB_READ_WRITE_TOKEN; falls back to config/embeddings-blob-manifest.json
 * public URLs (no secrets — used by CI).
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import {
  EMBEDDINGS_ARTIFACTS,
  EMBEDDINGS_BLOB_MANIFEST_REL,
  getEmbeddingsBlobManifestPath,
  syncEmbeddingsArtifactFromBlob,
  type EmbeddingsArtifactId,
} from "../../src/lib/gen/embeddings/embeddings-storage";

async function hasManifestUrls(): Promise<boolean> {
  try {
    const raw = await fs.readFile(getEmbeddingsBlobManifestPath(), "utf-8");
    const data = JSON.parse(raw) as { artifacts?: Record<string, { url?: string }> };
    return Object.values(data.artifacts ?? {}).some((a) => Boolean(a?.url));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await hasManifestUrls()) && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.error(
      `Need BLOB_READ_WRITE_TOKEN or a populated ${EMBEDDINGS_BLOB_MANIFEST_REL}.`,
    );
    process.exit(1);
  }

  const ids = Object.keys(EMBEDDINGS_ARTIFACTS) as EmbeddingsArtifactId[];
  let failed = 0;
  for (const id of ids) {
    const result = await syncEmbeddingsArtifactFromBlob(id);
    if (!result.ok) {
      console.error(`[sync] ${id}: ${result.error}`);
      failed += 1;
      continue;
    }
    console.info(`[sync] ${id} → ${result.localPath ?? "(memory only)"}`);
  }
  if (failed > 0) process.exit(1);
  console.info("[sync] done");
}

main().catch((err) => {
  console.error("[sync] failed:", err);
  process.exit(1);
});
