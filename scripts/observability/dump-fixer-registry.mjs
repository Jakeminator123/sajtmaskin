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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "observability");
const OUT_PATH = path.join(OUT_DIR, "fixer-registry.snapshot.json");
const TS_FILE = path.join(ROOT, "src", "lib", "gen", "autofix", "fixer-registry.ts");
const IS_WINDOWS = process.platform === "win32";

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

  // We write the tsx snippet to a temp file rather than passing it via `-e`
  // because shell quoting of multiline `-e` strings is unreliable on Windows
  // (cmd.exe strips newlines / mangles double quotes) and also brittle on
  // macOS/Linux shells. A temp file is universally portable.
  const snippet = [
    'import { FIXER_REGISTRY } from "./src/lib/gen/autofix/fixer-registry";',
    "process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), entries: FIXER_REGISTRY }, null, 2));",
    "",
  ].join("\n");
  const tmpFile = path.join(
    os.tmpdir(),
    `sajtmaskin-fixer-registry-dump-${process.pid}-${Date.now()}.mts`,
  );
  fs.writeFileSync(tmpFile, snippet, "utf8");

  // NOTE: `shell: true` is required on Windows so `npx` (resolved as
  // `npx.cmd`) can launch; without it `spawnSync` silently exits with
  // status 0 and empty stdout, resulting in a zero-byte snapshot.
  let result;
  try {
    result = spawnSync(
      "npx",
      ["--yes", "tsx", tmpFile],
      { cwd: ROOT, encoding: "utf8", shell: IS_WINDOWS },
    );
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* swallow */ }
  }
  if (result.status !== 0) {
    quietLog("tsx exited with", result.status, (result.stderr || "").slice(0, 400));
    return 0;
  }
  const stdout = result.stdout || "";
  if (!stdout.trim()) {
    quietLog(
      "tsx exited 0 but produced no stdout; leaving existing snapshot untouched.",
      (result.stderr || "").slice(0, 400),
    );
    return 0;
  }
  fs.writeFileSync(OUT_PATH, stdout, "utf8");
  quietLog(`wrote ${path.relative(ROOT, OUT_PATH)} (${stdout.length} bytes)`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.warn("[fixer-registry-dump] failed (non-fatal):", err?.message ?? err);
  process.exit(0);
}
