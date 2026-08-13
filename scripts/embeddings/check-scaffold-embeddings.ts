/**
 * Pre-build gate: verify scaffold embeddings are in sync with the registry.
 *
 * Loads via shared storage (Blob → local cache). Prefer `npm run embeddings:sync`
 * before this in CI when no local cache exists.
 *
 * Usage:
 *   npx tsx scripts/embeddings/check-scaffold-embeddings.ts
 *   npm run scaffolds:embeddings:check
 */

import { loadLocalEnv } from "./load-local-env";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import type { ScaffoldEmbeddingsFile } from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";
import {
  getEmbeddingsLocalPath,
  invalidateEmbeddingsArtifactCache,
  loadEmbeddingsArtifact,
  syncEmbeddingsArtifactFromBlob,
} from "../../src/lib/gen/embeddings/embeddings-storage";

const REGENERATE_HINT =
  "  Run: npm run scaffolds:embeddings   (requires OPENAI_API_KEY; writes Blob when token set)\n" +
  "  Or:  npm run embeddings:sync        (download Blob → local cache)";

function fail(msg: string): never {
  console.error(`[scaffolds:embeddings:check] ${msg}`);
  console.error(REGENERATE_HINT);
  process.exit(1);
}

async function main(): Promise<void> {
  loadLocalEnv();
  let data = (await loadEmbeddingsArtifact("scaffold")) as ScaffoldEmbeddingsFile | null;

  if (!data) {
    const synced = await syncEmbeddingsArtifactFromBlob("scaffold");
    if (synced.ok) {
      invalidateEmbeddingsArtifactCache("scaffold");
      data = (await loadEmbeddingsArtifact("scaffold")) as ScaffoldEmbeddingsFile | null;
    }
  }

  if (!data) {
    fail(
      `scaffold embeddings missing (Blob + local cache at ${getEmbeddingsLocalPath("scaffold")})`,
    );
  }

  if (!Array.isArray(data.embeddings)) {
    fail("scaffold embeddings has no 'embeddings' array");
  }

  const registered = getAllScaffolds()
    .map((s) => s.id)
    .sort();
  const embedded = data.embeddings.map((e) => e.id).sort();

  const registeredSet = new Set<string>(registered);
  const embeddedSet = new Set<string>(embedded);

  const missing = registered.filter((id) => !embeddedSet.has(id));
  const orphans = embedded.filter((id) => !registeredSet.has(id));

  if (missing.length > 0 || orphans.length > 0) {
    if (missing.length > 0) {
      console.error(`  missing embeddings for: ${missing.join(", ")}`);
    }
    if (orphans.length > 0) {
      console.error(`  orphan embedding ids:   ${orphans.join(", ")}`);
    }
    fail("scaffold embeddings out of sync with scaffold registry");
  }

  if (data._meta?.count !== registered.length) {
    fail(
      `_meta.count=${data._meta?.count} != registered=${registered.length}`,
    );
  }

  console.info(
    `[scaffolds:embeddings:check] OK — ${registered.length} scaffolds embedded (generated ${data._meta.generated})`,
  );
}

main().catch((err) => {
  console.error("[scaffolds:embeddings:check] failed:", err);
  process.exit(1);
});
