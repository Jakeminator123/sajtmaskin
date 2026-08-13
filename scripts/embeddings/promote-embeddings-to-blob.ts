/**
 * Upload local embedding JSON caches to Vercel Blob (and optionally untrack/delete).
 *
 * Usage:
 *   npx tsx scripts/embeddings/promote-embeddings-to-blob.ts
 *   npm run embeddings:promote
 *   npm run embeddings:promote -- --only=template,scaffold
 *   npm run embeddings:promote -- --delete-local
 *   npm run embeddings:promote -- --untrack
 *
 * Requires BLOB_READ_WRITE_TOKEN.
 */
import { loadLocalEnv } from "./load-local-env";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import {
  EMBEDDINGS_ARTIFACTS,
  getBlobReadWriteToken,
  getEmbeddingsLocalPath,
  invalidateEmbeddingsArtifactCache,
  saveEmbeddingsArtifact,
  type EmbeddingsArtifactId,
} from "../../src/lib/gen/embeddings/embeddings-storage";

function parseOnly(argv: string[]): EmbeddingsArtifactId[] | null {
  const flag = argv.find((a) => a.startsWith("--only="));
  if (!flag) return null;
  const raw = flag.slice("--only=".length);
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as EmbeddingsArtifactId[];
  for (const id of ids) {
    if (!(id in EMBEDDINGS_ARTIFACTS)) {
      throw new Error(`Unknown artifact id: ${id}`);
    }
  }
  return ids;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const argv = process.argv.slice(2);
  const deleteLocal = argv.includes("--delete-local");
  const untrack = argv.includes("--untrack");
  const only = parseOnly(argv);
  const ids = (only ??
    (Object.keys(EMBEDDINGS_ARTIFACTS) as EmbeddingsArtifactId[]));

  if (!getBlobReadWriteToken()) {
    console.error("BLOB_READ_WRITE_TOKEN required.");
    process.exit(1);
  }

  let uploaded = 0;
  for (const id of ids) {
    const localPath = getEmbeddingsLocalPath(id);
    let raw: string;
    try {
      raw = await fs.readFile(localPath, "utf-8");
    } catch {
      console.warn(`[promote] skip ${id}: no local file at ${localPath}`);
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`[promote] invalid JSON for ${id}:`, err);
      process.exit(1);
    }

    const saved = await saveEmbeddingsArtifact(id, data);
    invalidateEmbeddingsArtifactCache(id);
    uploaded += 1;
    console.info(`[promote] ${id} → ${saved.storage} ${saved.blobUrl ?? ""}`);

    if (deleteLocal) {
      await fs.unlink(localPath).catch(() => undefined);
      console.info(`[promote] deleted local ${localPath}`);
    }
  }

  if (untrack) {
    const tracked = ids
      .map((id) => EMBEDDINGS_ARTIFACTS[id].localRelPath)
      .filter(Boolean);
    try {
      execFileSync("git", ["rm", "--cached", "--ignore-unmatch", ...tracked], {
        stdio: "inherit",
      });
    } catch (err) {
      console.error("[promote] git rm --cached failed:", err);
      process.exit(1);
    }
  }

  if (uploaded === 0) {
    console.error("[promote] nothing uploaded — place local JSON caches first.");
    process.exit(1);
  }
  console.info(`[promote] done (${uploaded} artifact(s))`);
}

main().catch((err) => {
  console.error("[promote] failed:", err);
  process.exit(1);
});
