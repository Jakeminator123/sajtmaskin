/**
 * Removes Next.js + Turbopack caches before starting dev.
 *
 * When to use (run via `npm run dev:clean`):
 * - All API routes return 404 even though files exist on disk
 * - After a major change to next.config.ts / next.config.mjs
 * - After reinstalling node_modules
 * - "ENOENT" / chunk-load errors from Turbopack that survive a normal restart
 *
 * Cross-platform: pure Node fs.rmSync, works on Windows / macOS / Linux.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const TARGETS = [
  ".next",
  path.join("node_modules", ".cache", "turbopack"),
  path.join("node_modules", ".cache", "next"),
];

let removedCount = 0;
let missingCount = 0;
const errors = [];

for (const rel of TARGETS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    missingCount++;
    continue;
  }
  try {
    fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    removedCount++;
    console.log(`[clean-next-cache] removed ${rel}`);
  } catch (err) {
    errors.push({ rel, message: err instanceof Error ? err.message : String(err) });
  }
}

if (errors.length > 0) {
  console.error("[clean-next-cache] some targets could not be removed:");
  for (const e of errors) {
    console.error(`  - ${e.rel}: ${e.message}`);
  }
  console.error("[clean-next-cache] If a dev server is running, stop it first and re-run.");
  process.exit(1);
}

console.log(
  `[clean-next-cache] done (${removedCount} removed, ${missingCount} missing)`,
);
