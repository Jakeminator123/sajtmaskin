/**
 * Idiot-proof embeddings gate:
 * 1) Fail if embedding JSON is git-tracked
 * 2) Validate committed Blob URL manifest (schema)
 * 3) Sync Blob/public URLs → local cache (auto-heal missing files)
 * 4) Verify all three artifacts load + scaffold id parity
 *
 * Usage:
 *   npx tsx scripts/embeddings/ensure-embeddings.ts
 *   npm run embeddings:ensure
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import type { ScaffoldEmbeddingsFile } from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";
import {
  EMBEDDINGS_ARTIFACTS,
  EMBEDDINGS_BLOB_MANIFEST_REL,
  getEmbeddingsBlobKey,
  getEmbeddingsBlobManifestPath,
  getEmbeddingsLocalPath,
  invalidateEmbeddingsArtifactCache,
  loadEmbeddingsArtifact,
  syncEmbeddingsArtifactFromBlob,
  type EmbeddingsArtifactId,
  type EmbeddingsBlobManifest,
} from "../../src/lib/gen/embeddings/embeddings-storage";

const SCHEMA_REL = "docs/schemas/strict/embeddings-blob-manifest.schema.json";
const REQUIRED_IDS = Object.keys(EMBEDDINGS_ARTIFACTS) as EmbeddingsArtifactId[];

function fail(msg: string): never {
  console.error(`[embeddings:ensure] ${msg}`);
  process.exit(1);
}

function runUntrackedGate(): void {
  execFileSync(process.execPath, ["scripts/embeddings/check-embeddings-not-tracked.mjs"], {
    stdio: "inherit",
  });
}

async function validateManifestShape(manifest: EmbeddingsBlobManifest): Promise<void> {
  // Lightweight schema check without ajv dependency — keep gate fast/keyless.
  if (!manifest?._meta?.updatedAt) fail("manifest missing _meta.updatedAt");
  if (!manifest.artifacts) fail("manifest missing artifacts");
  for (const id of REQUIRED_IDS) {
    const entry = manifest.artifacts[id];
    if (!entry) fail(`manifest missing artifacts.${id}`);
    if (entry.key !== getEmbeddingsBlobKey(id)) {
      fail(`manifest artifacts.${id}.key expected ${getEmbeddingsBlobKey(id)}, got ${entry.key}`);
    }
    if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(entry.url)) {
      fail(`manifest artifacts.${id}.url is not a Vercel Blob URL`);
    }
    if (!entry.updatedAt) fail(`manifest artifacts.${id}.updatedAt missing`);
  }

  // Ensure schema file exists (documentation/contract anchor).
  try {
    await fs.access(path.resolve(SCHEMA_REL));
  } catch {
    fail(`schema missing: ${SCHEMA_REL}`);
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
    // Some Blob stores reject HEAD — fall back to ranged GET.
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  runUntrackedGate();

  let raw: string;
  try {
    raw = await fs.readFile(getEmbeddingsBlobManifestPath(), "utf-8");
  } catch {
    fail(
      `${EMBEDDINGS_BLOB_MANIFEST_REL} missing. Run: npm run embeddings:promote (requires BLOB_READ_WRITE_TOKEN)`,
    );
  }

  let manifest: EmbeddingsBlobManifest;
  try {
    manifest = JSON.parse(raw) as EmbeddingsBlobManifest;
  } catch (err) {
    fail(`manifest is not valid JSON: ${err instanceof Error ? err.message : err}`);
  }

  await validateManifestShape(manifest);

  for (const id of REQUIRED_IDS) {
    const url = manifest.artifacts[id]!.url;
    if (!(await headOk(url))) {
      fail(`Blob URL unreachable for ${id}: ${url}`);
    }
  }
  console.info("[embeddings:ensure] manifest URLs reachable");

  for (const id of REQUIRED_IDS) {
    const synced = await syncEmbeddingsArtifactFromBlob(id);
    if (!synced.ok) fail(`sync failed for ${id}: ${synced.error}`);
    invalidateEmbeddingsArtifactCache(id);
    const data = await loadEmbeddingsArtifact(id);
    if (!data || typeof data !== "object") {
      fail(`${id} embeddings failed to load after sync (${getEmbeddingsLocalPath(id)})`);
    }
    const embeddings = (data as { embeddings?: unknown }).embeddings;
    if (!Array.isArray(embeddings) || embeddings.length === 0) {
      fail(`${id} embeddings array empty after sync`);
    }
    console.info(`[embeddings:ensure] ${id}: ${embeddings.length} vectors`);
  }

  // Scaffold registry parity (same as scaffolds:embeddings:check).
  const scaffoldData = (await loadEmbeddingsArtifact("scaffold")) as ScaffoldEmbeddingsFile;
  const registered = getAllScaffolds()
    .map((s) => s.id)
    .sort();
  const embedded = scaffoldData.embeddings.map((e) => e.id).sort();
  const registeredSet = new Set<string>(registered);
  const embeddedSet = new Set<string>(embedded);
  const missing = registered.filter((id) => !embeddedSet.has(id));
  const orphans = embedded.filter((id) => !registeredSet.has(id));
  if (missing.length || orphans.length) {
    if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
    if (orphans.length) console.error(`  orphans: ${orphans.join(", ")}`);
    fail("scaffold embeddings out of sync with registry — run npm run scaffolds:embeddings");
  }
  if (scaffoldData._meta?.count !== registered.length) {
    fail(
      `scaffold _meta.count=${scaffoldData._meta?.count} != registered=${registered.length}`,
    );
  }

  console.info("[embeddings:ensure] OK — synced, reachable, registry parity");
}

main().catch((err) => {
  console.error("[embeddings:ensure] failed:", err);
  process.exit(1);
});
