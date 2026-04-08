#!/usr/bin/env node
/**
 * Refresh the committed v0 template catalog from local templates_v0 manifests.
 *
 * Usage:
 *   node scripts/v0-templates/refresh-local-v0-catalog.mjs
 *   node scripts/v0-templates/refresh-local-v0-catalog.mjs --with-embeddings
 */

import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const NODE = process.execPath;
const TSX_CLI = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");

const PATHS = {
  collectedManifest: resolve(ROOT, "templates_v0/out/collected-template-ids.json"),
  downloadedLog: resolve(ROOT, "templates_v0/out/downloaded.jsonl"),
};

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runStep(label, command, args) {
  console.log(`\n[templates:local:refresh] ${label}`);
  console.log(`> ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

async function main() {
  const withEmbeddings = hasFlag("--with-embeddings");
  const hasCollectedManifest = await fileExists(PATHS.collectedManifest);
  const hasDownloadedLog = await fileExists(PATHS.downloadedLog);

  if (!hasCollectedManifest) {
    throw new Error(
      `Missing ${PATHS.collectedManifest}. Run the templates_v0 intake first so the local manifest exists.`,
    );
  }

  console.log("[templates:local:refresh] Rebuilds src/lib/templates/* from local templates_v0 manifests.");
  console.log(
    `  collected-template-ids.json: ${hasCollectedManifest ? "found" : "missing"}`,
  );
  console.log(`  downloaded.jsonl: ${hasDownloadedLog ? "found" : "missing (optional)"}`);
  console.log(
    `  embeddings: ${withEmbeddings ? "will be regenerated after sync" : "not requested"}`,
  );

  runStep("Sync local manifest into template catalog", NODE, [
    "scripts/v0-templates/sync-v0-templates.mjs",
    "--source=local-manifest",
  ]);

  runStep("Validate generated catalog", NODE, [
    "scripts/v0-templates/validate-templates.mjs",
  ]);

  if (withEmbeddings) {
    runStep("Generate template embeddings", NODE, [
      TSX_CLI,
      "scripts/embeddings/generate-template-embeddings.ts",
    ]);
  } else {
    console.log("\n[templates:local:refresh] Klart.");
    console.log(
      "  Vill du aven regenerera embeddings direkt efter sync: npm run templates:local:refresh:embeddings",
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[templates:local:refresh] Failed: ${message}`);
  process.exitCode = 1;
});
