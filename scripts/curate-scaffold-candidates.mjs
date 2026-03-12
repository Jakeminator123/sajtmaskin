#!/usr/bin/env node

/**
 * Compatibility wrapper around the unified scaffold curation pipeline.
 *
 * Preferred usage:
 *   npx tsx scripts/curate-scaffold-candidates.ts
 *
 * Legacy usage still works:
 *   node scripts/curate-scaffold-candidates.mjs scaffold-candidates.json
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scriptPath = resolve(process.cwd(), "scripts", "curate-scaffold-candidates.ts");
const result = spawnSync("npx", ["tsx", scriptPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
