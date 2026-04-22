#!/usr/bin/env node
/**
 * Dumps the FIXER_REGISTRY (TypeScript source of truth) into a JSON file the
 * Streamlit backoffice can read without needing to evaluate TypeScript.
 *
 * Output: data/observability/fixer-registry.snapshot.json
 *
 * Run automatically by the auto-ingest hook AND on demand via:
 *   node scripts/observability/dump-fixer-registry.mjs
 *
 * Idempotent and zero-throw — failure exits 0 so it cannot break the runner.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "observability");
const OUT_PATH = path.join(OUT_DIR, "fixer-registry.snapshot.json");
const TS_FILE = path.join(ROOT, "src", "lib", "gen", "autofix", "fixer-registry.ts");

function quietLog(...args) {
  if (process.argv.includes("--quiet")) return;
  console.info("[fixer-registry-dump]", ...args);
}

function main() {
  if (!fs.existsSync(TS_FILE)) {
    quietLog("source not found, skipping");
    return 0;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const snippet = [
    'import { FIXER_REGISTRY } from "./src/lib/gen/autofix/fixer-registry";',
    "process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), entries: FIXER_REGISTRY }, null, 2));",
  ].join("\n");

  const result = spawnSync(
    "npx",
    ["--yes", "tsx", "-e", snippet],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    quietLog("tsx exited with", result.status, (result.stderr || "").slice(0, 200));
    return 0;
  }
  fs.writeFileSync(OUT_PATH, result.stdout, "utf8");
  quietLog(`wrote ${path.relative(ROOT, OUT_PATH)}`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.warn("[fixer-registry-dump] failed (non-fatal):", err?.message ?? err);
  process.exit(0);
}
