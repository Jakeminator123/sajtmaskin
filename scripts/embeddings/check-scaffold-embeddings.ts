/**
 * Pre-build gate: verify `scaffold-embeddings.json` is in sync with the
 * scaffold registry.
 *
 * Checks (fast, no API calls):
 *   - File exists and is valid JSON.
 *   - `_meta.count` equals registered scaffold count.
 *   - ID set in file equals ID set in `getAllScaffolds()` (no missing, no orphans).
 *
 * Does NOT verify content-level drift (manifest description/tags changes) — that
 * requires an `inputHash` extension to the file format; see OMTAG/01-FINDINGS.md.
 *
 * Usage:
 *   npx tsx scripts/embeddings/check-scaffold-embeddings.ts
 *   npm run scaffolds:embeddings:check
 *
 * Exit codes:
 *   0 — in sync
 *   1 — missing file, invalid JSON, or mismatch
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import type { ScaffoldEmbeddingsFile } from "../../src/lib/gen/scaffolds/scaffold-embeddings-core";

const REL_PATH = "src/lib/gen/scaffolds/scaffold-embeddings.json";
const REGENERATE_HINT =
  "  Run: npm run scaffolds:embeddings   (requires OPENAI_API_KEY in .env.local)";

function fail(msg: string): never {
  console.error(`[scaffolds:embeddings:check] ${msg}`);
  console.error(REGENERATE_HINT);
  process.exit(1);
}

const filePath = resolve(REL_PATH);

let raw: string;
try {
  raw = readFileSync(filePath, "utf-8");
} catch (err) {
  fail(
    `${REL_PATH} missing (${
      err instanceof Error ? err.message : String(err)
    })`,
  );
}

let data: ScaffoldEmbeddingsFile;
try {
  data = JSON.parse(raw) as ScaffoldEmbeddingsFile;
} catch (err) {
  fail(
    `${REL_PATH} is not valid JSON: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}

if (!Array.isArray(data.embeddings)) {
  fail(`${REL_PATH} has no 'embeddings' array`);
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
  fail(`${REL_PATH} out of sync with scaffold registry`);
}

if (data._meta?.count !== registered.length) {
  fail(
    `${REL_PATH} _meta.count=${data._meta?.count} != registered=${registered.length}`,
  );
}

console.info(
  `[scaffolds:embeddings:check] OK — ${registered.length} scaffolds embedded (generated ${data._meta.generated})`,
);
